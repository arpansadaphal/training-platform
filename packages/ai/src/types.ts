/**
 * Shared Coach types — the persisted and wire shape of an assistant turn.
 *
 * These types describe the Coach's structured output format. They live in
 * packages/ai, not packages/domain, because the domain layer has no concept
 * of a "claim" or an "evidence tag" — the tags are a Coach-specific response
 * contract (see 03-domain-model.md, "Evidence categorization: implicit vs.
 * explicit").
 *
 * BOUNDARY: this file must never import from the API package. It may import from
 * @training/domain and @training/db. The boundary test at
 * packages/ai/src/__tests__/boundary.test.ts enforces the ban mechanically.
 */

/** Final Freeze invariant 7. */
export type EvidenceTag = 'PLANNED' | 'EXECUTED' | 'OBSERVED' | 'INTERPRETED';

/**
 * A reference from a claim segment back to the analysis/assessment/tool result
 * it is grounded in. Object-typed (not a bare string) so the client can render
 * a link without re-parsing the model's prose.
 */
export type SegmentSourceRef =
  | { kind: 'axis'; key: string }
  | { kind: 'simulation'; id: string }
  | { kind: 'assessment' }
  | { kind: 'analysis' }
  | { kind: 'observation'; id: string }
  | { kind: 'session'; id: string }
  | { kind: 'constraint'; id: string }
  | { kind: 'temporary_constraint'; id: string };

export interface ApplyConfirmationPayload {
  simulationId: string;
  summary: string;
}

export type ConstraintKind =
  | 'EXERCISE_AVOIDANCE'
  | 'MOVEMENT_PATTERN_AVOIDANCE'
  | 'FREEFORM';

export interface ConstraintNoticePayload {
  constraintId: string;
  kind: ConstraintKind;
  displayText: string;
}

export interface TemporaryConstraintNoticePayload {
  temporaryConstraintId: string;
  conversationId: string;
  displayText: string;
}

/**
 * One segment of an assistant turn.
 *
 * Discriminated union on `type`. The `claim` variant makes `tag` a required
 * field at the type level — a claim segment literally cannot be constructed
 * without one, which is what turns invariant 7 from a UI convention into a
 * compile-time property (see DECISIONS.md, ARCH-043 candidate).
 *
 * The `apply_confirmation` variant is what a `prepare_apply_confirmation` tool
 * result renders as. It carries the `simulationId` explicitly so the client
 * can call programVersion.commitFromSimulation on click without re-parsing
 * the model's output (Phase 8 Q6 refinement).
 */
export type AIMessageSegment =
  | { type: 'text'; content: string }
  | {
      type: 'claim';
      tag: EvidenceTag;
      content: string;
      sourceRef?: SegmentSourceRef;
    }
  | {
      type: 'apply_confirmation';
      content: string;
      payload: ApplyConfirmationPayload;
    }
  | {
      type: 'constraint_notice';
      content: string;
      payload: ConstraintNoticePayload;
    }
  | {
      type: 'temporary_constraint_notice';
      content: string;
      payload: TemporaryConstraintNoticePayload;
    }
  | {
      type: 'grounding_warning';
      content: string;
    };

export type AIMessageRole = 'USER' | 'ASSISTANT' | 'TOOL';

/**
 * Chunks emitted by the coach.postMessage tRPC subscription.
 *
 * Sequence: zero or more `delta` chunks (raw text tokens as they stream from
 * the provider), then zero or more `segment` chunks (structured segments the
 * orchestrator has assembled and wants to surface early — e.g. an apply
 * button that becomes available the moment its tool returns, before the
 * final text finishes streaming), then exactly one terminal `final` or
 * `error` chunk.
 *
 * The `final` chunk carries the persisted AIMessage id and the full segments
 * array so the client can reconcile its local buffer against server state and
 * stop rendering optimistic text.
 */
export type CoachStreamChunk =
  | { type: 'delta'; text: string }
  | { type: 'segment'; segment: AIMessageSegment }
  | { type: 'final'; messageId: string; segments: AIMessageSegment[] }
  | { type: 'error'; message: string; code?: string };

/**
 * Runtime guard: a claim segment must have a non-null tag. Enforced at the
 * type level, but the orchestrator re-validates on the way in from the model
 * because the model's output is `unknown` before schema validation.
 */
export function isWellFormedSegment(value: unknown): value is AIMessageSegment {
  if (typeof value !== 'object' || value === null) return false;
  const seg = value as Record<string, unknown>;
  if (typeof seg.type !== 'string' || typeof seg.content !== 'string') {
    return false;
  }

  // Whitelist narrowing. An unknown segment type must be rejected here, not
  // silently persisted. Without this, a future segment type added to
  // AIMessageSegment but not to this guard would slip through and land in the
  // database unrendered.
  if (
    seg.type !== 'text' &&
    seg.type !== 'claim' &&
    seg.type !== 'apply_confirmation' &&
    seg.type !== 'constraint_notice' &&
    seg.type !== 'temporary_constraint_notice' &&
    seg.type !== 'grounding_warning'
  ) {
    return false;
  }

  switch (seg.type) {
    case 'text':
    case 'grounding_warning':
      return true;

    case 'claim': {
      const tag = seg.tag;
      return (
        tag === 'PLANNED' ||
        tag === 'EXECUTED' ||
        tag === 'OBSERVED' ||
        tag === 'INTERPRETED'
      );
    }

    case 'apply_confirmation': {
      const payload = seg.payload;
      if (typeof payload !== 'object' || payload === null) return false;
      const p = payload as Record<string, unknown>;
      return (
        typeof p.simulationId === 'string' && typeof p.summary === 'string'
      );
    }

    case 'constraint_notice': {
      const payload = seg.payload;
      if (typeof payload !== 'object' || payload === null) return false;
      const p = payload as Record<string, unknown>;
      const kindOk =
        p.kind === 'EXERCISE_AVOIDANCE' ||
        p.kind === 'MOVEMENT_PATTERN_AVOIDANCE' ||
        p.kind === 'FREEFORM';
      return (
        typeof p.constraintId === 'string' &&
        typeof p.displayText === 'string' &&
        kindOk
      );
    }

    case 'temporary_constraint_notice': {
      const payload = seg.payload;
      if (typeof payload !== 'object' || payload === null) return false;
      const p = payload as Record<string, unknown>;
      return (
        typeof p.temporaryConstraintId === 'string' &&
        typeof p.conversationId === 'string' &&
        typeof p.displayText === 'string'
      );
    }
  }

  // Unreachable — the whitelist above narrows seg.type to the six literal
  // types handled exhaustively in the switch. Kept as defence against a future
  // segment type being added to the union without updating this guard.
  return false;
}