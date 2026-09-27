import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { AIMessageSegment } from '../types';
import type { CoachTool, CoachToolDeps } from './types';
import { ToolExecutionError } from './types';

/**
 * note_temporary_constraint — writes a TemporaryConstraint scoped to the
 * current conversation.
 *
 * Scope: the AIConversation. Never the workout Session. These are different
 * entities with overloaded names (see 03-domain-model.md's terminology note);
 * do not conflate them.
 *
 * Lifecycle: shapes proposals within this conversation only. Never silently
 * promoted to a persistent Constraint — the user must do that explicitly (or
 * ask the Coach to, via note_constraint).
 *
 * Visibility: like note_constraint, the write is acknowledged in the Coach's
 * own response via a temporary_constraint_notice segment. Writes are never
 * silent.
 *
 * The `conversationId` is NOT a model-supplied argument. It comes from
 * ctx.conversationId. The `.strict()` schema below would reject a model that
 * tried to inject one.
 */

const inputSchema = z
  .object({
    note: z
      .string()
      .trim()
      .min(1)
      .describe(
        'The temporary constraint, in plain language. Be faithful to what ' +
          'the user said; do not embellish or extrapolate.',
      ),
  })
  .strict();

export function createNoteTemporaryConstraintTool(
  deps: CoachToolDeps,
): CoachTool {
  return {
    name: 'note_temporary_constraint',
    description:
      'Record a short-lived constraint that applies only to THIS conversation. ' +
      'Use this when the user clarifies something contextual ("I tweaked my ' +
      'back yesterday", "just exploring today") that should shape your ' +
      'proposals here but should NOT affect their program long-term. For a ' +
      'durable preference that should affect all future analysis, use ' +
      'note_constraint instead.',
    inputSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
    async execute(input, ctx) {
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) {
        throw new ToolExecutionError(
          `Invalid input: ${parsed.error.message}`,
          'INVALID_INPUT',
        );
      }
      const record = await deps.noteTemporaryConstraint({
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        note: parsed.data.note,
      });

      const segment: AIMessageSegment = {
        type: 'temporary_constraint_notice',
        content: `Noted for this conversation: ${record.note}`,
        payload: {
          temporaryConstraintId: record.id,
          conversationId: record.conversationId,
          displayText: record.note,
        },
      };

      return {
        modelContent: {
          temporaryConstraintId: record.id,
          conversationId: record.conversationId,
          status: 'written',
          scope: 'this_conversation_only',
          note:
            'This constraint applies only to this conversation and will not ' +
            'affect future analysis. Acknowledge the write in your reply.',
        },
        segments: [segment],
      };
    },
  };
}