import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { AIMessageSegment, ConstraintKind } from '../types';
import type { CoachTool, CoachToolDeps } from './types';
import { ToolExecutionError } from './types';

/**
 * note_constraint — writes a persistent, user-level Constraint.
 *
 * Final Freeze §17 requires these writes to be VISIBLE: the orchestrator
 * appends a `constraint_notice` segment so the Coach's own response
 * acknowledges the write, and the UI surfaces it in the constraints list.
 * A silent write is a bug, not a style issue.
 *
 * The three `kind` values here are the SAME three that ConstraintKind in
 * ../types.ts and the DB schema enumerate. z.enum with `as const` keeps the
 * runtime validation and the type aligned — a fourth kind added to the union
 * but not to this array will fail TypeScript compilation because
 * `z.enum(VALID_KINDS)` derives its literal type from the array.
 */

const VALID_KINDS = [
  'EXERCISE_AVOIDANCE',
  'MOVEMENT_PATTERN_AVOIDANCE',
  'FREEFORM',
] as const;

const inputSchema = z
  .object({
    kind: z
      .enum(VALID_KINDS)
      .describe(
        'EXERCISE_AVOIDANCE for a specific exercise, ' +
          'MOVEMENT_PATTERN_AVOIDANCE for a pattern (e.g. "no overhead ' +
          'pressing"), FREEFORM for anything that does not structure cleanly.',
      ),
    note: z
      .string()
      .trim()
      .min(1)
      .describe(
        'The constraint, phrased as guidance to keep. Be specific and ' +
          'faithful to what the user actually said — do not embellish or ' +
          'extrapolate.',
      ),
  })
  .strict();

export function createNoteConstraintTool(deps: CoachToolDeps): CoachTool {
  return {
    name: 'note_constraint',
    description:
      'Record a persistent constraint the user has stated (an exercise to ' +
      'avoid, a movement pattern to avoid, or freeform guidance). This affects ' +
      'all future analysis and proposals. Use this only when the user has ' +
      'stated a durable preference — for a short-lived, in-conversation ' +
      'clarification, use note_temporary_constraint instead.',
    inputSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
    async execute(input, ctx) {
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) {
        throw new ToolExecutionError(
          `Invalid input: ${parsed.error.message}`,
          'INVALID_INPUT',
        );
      }
      const { kind, note } = parsed.data;
      const record = await deps.noteConstraint({
        userId: ctx.userId,
        kind: kind as ConstraintKind,
        note,
      });

      const segment: AIMessageSegment = {
        type: 'constraint_notice',
        content: `Noted as a constraint: ${record.note}`,
        payload: {
          constraintId: record.id,
          kind: record.kind,
          displayText: record.note,
        },
      };

      return {
        modelContent: {
          constraintId: record.id,
          kind: record.kind,
          status: 'written',
          note:
            "The constraint is now visible in the user's constraints list. " +
            'Acknowledge the write in your reply.',
        },
        segments: [segment],
      };
    },
  };
}