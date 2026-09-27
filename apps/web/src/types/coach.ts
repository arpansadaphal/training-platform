/**
 * Client-side mirror of the Coach's response types.
 *
 * Deliberately NOT imported from @training/ai. Two reasons:
 *   1. @training/ai depends on @anthropic-ai/sdk, @training/db, zod, and
 *      other server-leaning packages. Importing even `import type` from a
 *      client component requires apps/web to declare the dependency, which
 *      widens the client bundle graph for no runtime benefit.
 *   2. The Client* pattern (learning 18) is the established discipline for
 *      this repo: shapes that cross the wire get re-declared client-side so
 *      the client is not coupled to server-package evolution.
 *
 * If the server type drifts from this one, the drift surfaces as a wrong
 * render or an unhandled segment type — visible, not silent. A test in 8g
 * can assert the two shapes stay in sync by importing both and comparing
 * exhaustively.
 */

export type EvidenceTag = 'PLANNED' | 'EXECUTED' | 'OBSERVED' | 'INTERPRETED';

export type SegmentSourceRef =
  | { kind: 'axis'; key: string }
  | { kind: 'simulation'; id: string }
  | { kind: 'assessment' }
  | { kind: 'analysis' }
  | { kind: 'observation'; id: string }
  | { kind: 'session'; id: string }
  | { kind: 'constraint'; id: string }
  | { kind: 'temporary_constraint'; id: string };

export type ConstraintKind =
  | 'EXERCISE_AVOIDANCE'
  | 'MOVEMENT_PATTERN_AVOIDANCE'
  | 'FREEFORM';

export type ClientAIMessageSegment =
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
      payload: { simulationId: string; summary: string };
    }
  | {
      type: 'constraint_notice';
      content: string;
      payload: {
        constraintId: string;
        kind: ConstraintKind;
        displayText: string;
      };
    }
  | {
      type: 'temporary_constraint_notice';
      content: string;
      payload: {
        temporaryConstraintId: string;
        conversationId: string;
        displayText: string;
      };
    }
  | { type: 'grounding_warning'; content: string };

export type ClientCoachStreamChunk =
  | { type: 'delta'; text: string }
  | { type: 'segment'; segment: ClientAIMessageSegment }
  | { type: 'final'; messageId: string; segments: ClientAIMessageSegment[] }
  | { type: 'error'; message: string; code?: string };

/**
 * The shape of one message as returned by coach.getConversation. Dates arrive
 * as ISO strings — the RSC-to-client boundary serializes them.
 */
export interface ClientCoachMessage {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'TOOL';
  segments: ClientAIMessageSegment[];
  createdAtISO: string;
}