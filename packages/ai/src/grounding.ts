import type { CoachContext } from './context-builder';
import type { AIMessageSegment } from './types';

/**
 * Grounding check.
 *
 * Invariant 1: the deterministic engine is the sole source of quantitative
 * truth. The Coach may restate numbers the engine produced; it may not
 * invent them. This module is the mechanical enforcement of that rule for
 * Coach output.
 *
 * The allowed set of numbers on a turn is exactly:
 *   - every number that appears anywhere in the serialized `CoachContext`,
 *   - every number that appears anywhere in a tool result produced this turn.
 *
 * Nothing else — not prior turns, not the system prompt's instructions, not
 * the model's own reasoning. This is deliberately strict: a false positive
 * costs a regeneration or a withheld segment, while a false negative is a
 * number the user might act on that the engine never produced.
 *
 * The check runs on segment *content*. `sourceRef` values (which may contain
 * numeric ids) are not content and are not checked — they are server-supplied
 * references, not model-emitted text.
 */
/**
 * On `context.conversationHistory`: numbers appearing in prior turns are
 * deliberately in-context. The user sees that history, and the model
 * restating it on a follow-up turn is legitimate (e.g. "you asked about the
 * 12kg press earlier"). The recursion is bounded by the prior turn's
 * grounding check — the only numbers that can enter history are ones that
 * were already allowed on a previous turn, since a turn's persisted segments
 * passed `checkGrounding` against that turn's context before being written.
 * History therefore cannot be a laundering path for an ungrounded number.
 */
export interface GroundingInput {
  context: CoachContext;
  /** Raw `modelContent` from each tool call this turn, in call order. */
  toolResults: unknown[];
  segments: AIMessageSegment[];
}

export interface OffendingToken {
  token: string;
  segmentIndex: number;
}

export interface GroundingResult {
  ok: boolean;
  offendingTokens: OffendingToken[];
  /** Unique indices into `segments` that contain at least one offending token. */
  offendingSegmentIndices: number[];
}

/**
 * Extract every numeric token from a string. A numeric token is a run of
 * digits, optionally with a single decimal point. Signs and units are not
 * part of the token — "12kg" yields "12", "-3.5" yields "3.5".
 *
 * Exported because the test suite asserts the tokenizer behaviour directly.
 */
export function extractNumericTokens(text: string): string[] {
  const matches = text.match(/\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map(normalizeNumericToken);
}

/**
 * Normalize a numeric token so "2.0" and "2" compare equal, and "02" and "2"
 * compare equal. The model and the context serializer may disagree on
 * formatting of the same underlying number.
 */
function normalizeNumericToken(raw: string): string {
  const asNumber = Number(raw);
  if (!Number.isFinite(asNumber)) return raw;
  // String(2.0) === "2"; String(2.5) === "2.5". Handles trailing-zero drift.
  return String(asNumber);
}

/**
 * Walk a JSON-serializable value and collect every numeric leaf, plus every
 * numeric token that appears inside string leaves. This catches both
 * `{ targetSets: 3 }` and `{ note: "3 sets on bench" }`.
 */
function collectNumericTokensFromValue(value: unknown, into: Set<string>): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) into.add(String(value));
    return;
  }
  if (typeof value === 'string') {
    for (const token of extractNumericTokens(value)) into.add(token);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNumericTokensFromValue(item, into);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectNumericTokensFromValue(v, into);
    }
    return;
  }
  // booleans and functions contribute nothing
}

/**
 * Build the set of numbers the model is permitted to reference this turn.
 */
export function buildAllowedNumbers(input: {
  context: CoachContext;
  toolResults: unknown[];
}): Set<string> {
  const allowed = new Set<string>();
  collectNumericTokensFromValue(input.context, allowed);
  for (const result of input.toolResults) {
    collectNumericTokensFromValue(result, allowed);
  }
  return allowed;
}

export function checkGrounding(input: GroundingInput): GroundingResult {
  const allowed = buildAllowedNumbers({
    context: input.context,
    toolResults: input.toolResults,
  });

  const offendingTokens: OffendingToken[] = [];
  const offendingSegments = new Set<number>();

  input.segments.forEach((segment, segmentIndex) => {
    // Only text and claim segments carry model-emitted prose. Tool-produced
    // segments (apply_confirmation, notices) have content the server built.
    if (segment.type !== 'text' && segment.type !== 'claim') return;

    const tokens = extractNumericTokens(segment.content);
    for (const token of tokens) {
      if (!allowed.has(token)) {
        offendingTokens.push({ token, segmentIndex });
        offendingSegments.add(segmentIndex);
      }
    }
  });

  return {
    ok: offendingTokens.length === 0,
    offendingTokens,
    offendingSegmentIndices: [...offendingSegments].sort((a, b) => a - b),
  };
}

/**
 * Produce the fallback message when a grounding failure survives the retry.
 *
 * The rule (Phase 8 Q7-as-revised): never silently drop a number, never fail
 * the whole turn. Drop the offending segments, keep the grounded ones, and
 * append a visible warning so the user knows something was withheld.
 *
 * If every model-emitted segment was offending, the result is a lone warning
 * — the user sees that the Coach produced nothing they can trust, which is
 * the honest state.
 */
export function dropOffendingAndAddWarning(
  segments: AIMessageSegment[],
  offendingIndices: number[],
): AIMessageSegment[] {
  const drop = new Set(offendingIndices);
  const kept = segments.filter((_, i) => !drop.has(i));
  const warning: AIMessageSegment = {
    type: 'grounding_warning',
    content:
      'Some content was withheld because it could not be grounded in the ' +
      'current analysis.',
  };
  return [...kept, warning];
}