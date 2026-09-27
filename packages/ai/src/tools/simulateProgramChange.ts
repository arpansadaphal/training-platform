import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { MutationSpec } from '@training/domain';

import type { CoachTool, CoachToolDeps } from './types';
import { ToolExecutionError } from './types';

/**
 * simulate_program_change — the Explorer's core tool.
 *
 * Persists a Simulation row and returns the SimulationResult. Does NOT apply
 * anything. The result is either COMPUTED (with Gain/Cost/Net), CANNOT_COMPUTE
 * (the honest answer under the shipped HYPERTROPHY config — see ARCH-032), or
 * INVALID_MUTATION.
 *
 * The `programId` and `baseVersionId` are taken from ctx, never from the
 * model's input. A model that tries to target another program by supplying a
 * programId argument has that argument rejected by `.strict()` below.
 *
 * The `mutation` field is deliberately `z.unknown()` — the MutationSpec shape
 * is defined in packages/domain, and replicating it as a Zod schema here would
 * create a second source of truth. The permissiveness is now an explicit,
 * visible schema-level decision rather than a hand-written omission. If
 * INVALID_MUTATION proves common in practice, tighten this schema in a later
 * phase (Phase 8 ruling, 8b-2 #1).
 */

const inputSchema = z
  .object({
    mutation: z
      .unknown()
      .describe(
        'A MutationSpec describing a single hypothetical change. Shape is ' +
          'validated by the deterministic engine; the tool returns ' +
          'INVALID_MUTATION with a reason if the shape is rejected.',
      ),
  })
  .strict();

export function createSimulateProgramChangeTool(
  deps: CoachToolDeps,
): CoachTool {
  return {
    name: 'simulate_program_change',
    description:
      'Test a hypothetical change to the current program WITHOUT applying it. ' +
      'Returns an analysis of what the change would do — a Gain/Cost/Net ' +
      'summary when the engine can compute it, or an explicit ' +
      "CANNOT_COMPUTE marker when the current goal profile's thresholds are " +
      'not yet validated. The change is never applied by this tool; the user ' +
      'must explicitly apply it from the UI afterward.\n\n' +
      'The `mutation` argument is a MutationSpec object as defined by the ' +
      'engine (typically `{ op, ... }`). If the shape is rejected, the tool ' +
      'returns INVALID_MUTATION with a message you should narrate honestly to ' +
      'the user rather than retry blindly.',
    inputSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
     async execute(input, ctx) {
      if (!ctx.currentProgramId || !ctx.currentProgramVersionId) {
        throw new ToolExecutionError(
          'No program is in view for this conversation, so no simulation can be run. ' +
            'The user must open a specific program before a change can be explored.',
          'INVALID_INPUT',
        );
      }
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) {
        throw new ToolExecutionError(
          `Invalid input: ${parsed.error.message}`,
          'INVALID_INPUT',
        );
      }
      // The mutation's own shape is NOT validated here — see the file header.
      // `simulateAndPersist` forwards to the deterministic engine, which is
      // the sole authority on MutationSpec validity (invariant 1), and returns
      // a SimulationResult whose INVALID_MUTATION variant is the honest answer
      // for a malformed spec. The try/catch below is the defensive net for the
      // case where the engine throws something simulate() did not convert —
      // an infrastructure error, or a raw TypeError from a spec that is
      // malformed beyond what applyMutation recognises.
      try {
        const result = await deps.simulateAndPersist({
          userId: ctx.userId,
          programId: ctx.currentProgramId,
          baseVersionId: ctx.currentProgramVersionId,
          conversationId: ctx.conversationId,
          spec: parsed.data.mutation as MutationSpec,
        });
        return { modelContent: result };
      } catch (err) {
        if (err instanceof ToolExecutionError) throw err;
        throw new ToolExecutionError(
          'The simulation could not be run due to an internal error. This is ' +
            'not a problem with the proposed change — do not retry the same ' +
            'mutation. Tell the user the simulation is temporarily unavailable.',
          'UPSTREAM_FAILURE',
        );
      }
    },
  };
}