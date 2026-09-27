import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { CoachTool, CoachToolDeps } from './types';
import { ToolExecutionError } from './types';

/**
 * lookup_exercises — reference-data read.
 *
 * Returns the canonical exercise catalogue (optionally filtered by a
 * case-insensitive substring match on name). Read-only, no side effects,
 * freely callable by the model.
 *
 * Zod schema (option C): one source of truth. `inputSchema` is the
 * model-facing JSON Schema, derived from the Zod schema at construction time.
 * `execute` re-validates the model's input against the same schema, so the
 * JSON Schema and the runtime validation cannot drift.
 */

const inputSchema = z
  .object({
    query: z
      .string()
      .describe(
        'Optional case-insensitive substring to filter exercise names by.',
      )
      .optional(),
  })
  .strict();

export function createLookupExercisesTool(deps: CoachToolDeps): CoachTool {
  return {
    name: 'lookup_exercises',
    description:
      'Look up exercises in the canonical reference catalogue. Returns each ' +
      "exercise's id, name, and the muscle groups it involves. Use this " +
      'whenever you need to refer to a specific exercise by id — never guess ' +
      'or invent an exercise id. Optionally pass a `query` to filter by ' +
      'name substring.',
    inputSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
    async execute(input, ctx) {
      const parsed = inputSchema.safeParse(input ?? {});
      if (!parsed.success) {
        throw new ToolExecutionError(
          `Invalid input: ${parsed.error.message}`,
          'INVALID_INPUT',
        );
      }
      const results = await deps.lookupExercises({
        userId: ctx.userId,
        query: parsed.data.query,
      });
      return {
        modelContent: {
          count: results.length,
          exercises: results,
        },
      };
    },
  };
}