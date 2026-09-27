import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { CoachTool, CoachToolDeps } from './types';
import { ToolExecutionError } from './types';

/**
 * query_training_history — L2 (Historian) read tool.
 *
 * IMPLEMENTED but GATED. This tool is not included in the tools array passed
 * to the model while L2_ENABLED is false (see ./index.ts). The tool exists
 * here from Phase 8 because it is a cheap read and TrainingBlock data already
 * exists from Phase 6 — but exposing it to the model is a separate switch,
 * and Phase 8 does not flip it. See 10-ai-coach-architecture.md's
 * "Tier gating" section.
 *
 * Scope: the caller's own data. `userId` comes from ctx, never from the
 * model. The `.strict()` schema below would reject any attempt to smuggle
 * a user-identifying argument through the input.
 *
 * Returns a SUMMARISED view of the user's recent TrainingBlocks — session
 * counts and observation counts, not raw log dumps. Keeping the response
 * small is what lets it be added to model context without blowing the budget
 * (see 10-ai-coach-architecture.md's context-construction note).
 */

const inputSchema = z
  .object({
    sinceISO: z
      .string()
      .describe(
        'Optional ISO-8601 date. Only blocks started on or after this date ' +
          'are returned.',
      )
      .optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .describe(
        'Maximum number of blocks to return, newest-first. Defaults to 10.',
      )
      .optional(),
  })
  .strict();

export function createQueryTrainingHistoryTool(
  deps: CoachToolDeps,
): CoachTool {
  return {
    name: 'query_training_history',
    description:
      "Look up a summary of the user's own completed TrainingBlocks — when " +
      'each block started and ended, how many sessions were completed, and ' +
      'how many observations were logged. Use this when the user asks about ' +
      'their own training history or when a pattern across blocks is relevant. ' +
      'Does not return individual sets or raw logs.',
    inputSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
    async execute(input, ctx) {
      const parsed = inputSchema.safeParse(input ?? {});
      if (!parsed.success) {
        throw new ToolExecutionError(
          `Invalid input: ${parsed.error.message}`,
          'INVALID_INPUT',
        );
      }
      const summary = await deps.queryTrainingHistory({
        userId: ctx.userId,
        programId: ctx.currentProgramId ?? undefined,
        sinceISO: parsed.data.sinceISO,
        limit: parsed.data.limit,
      });
      return {
        modelContent: {
          count: summary.blocks.length,
          blocks: summary.blocks,
        },
      };
    },
  };
}