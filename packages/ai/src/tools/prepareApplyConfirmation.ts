import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { AIMessageSegment } from '../types';
import type { CoachTool, CoachToolDeps } from './types';
import { ToolExecutionError } from './types';

/**
 * prepare_apply_confirmation — the load-bearing safety boundary in tool form.
 *
 * Despite its name, this tool APPLIES NOTHING. It:
 *   1. Loads the referenced Simulation, ownership-checked.
 *   2. Returns a render payload the orchestrator turns into an
 *      `apply_confirmation` segment.
 *
 * The actual apply step is a client-triggered procedure, called ONLY by client
 * code on explicit user click (ARCH-018, Phase 8 Q6).
 *
 * The summary text is SERVER-BUILT from the persisted Simulation (see
 * SimulationSummary.humanSummary in ./types.ts). The model cannot inject text
 * here — a model that tried to influence what the user sees on the apply
 * button has no path to do so.
 */

const inputSchema = z
  .object({
    simulationId: z
      .string()
      .min(1)
      .describe(
        'The `simulationId` returned by a prior simulate_program_change ' +
          'call in this conversation.',
      ),
  })
  .strict();

export function createPrepareApplyConfirmationTool(
  deps: CoachToolDeps,
): CoachTool {
  return {
    name: 'prepare_apply_confirmation',
    description:
      'Offer the user an explicit "Apply this change" button for a Simulation ' +
      'you previously created. This does NOT apply the change — it only ' +
      'surfaces the button, which the user must click. Call this after ' +
      'simulate_program_change when the user seems interested in acting on ' +
      'the result. Do not claim the change has been applied.',
    inputSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
    async execute(input, ctx) {
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) {
        throw new ToolExecutionError(
          `Invalid input: ${parsed.error.message}`,
          'INVALID_INPUT',
        );
      }

      const simulation = await deps.loadOwnedSimulation({
        userId: ctx.userId,
        simulationId: parsed.data.simulationId,
      });
      if (!simulation) {
        // Deliberately does not distinguish "not found" from "not owned" —
        // either way the model is told the reference is unusable.
        throw new ToolExecutionError(
          'The referenced simulation could not be found. It may have expired ' +
            'or may not belong to this conversation.',
          'NOT_FOUND',
        );
      }

      const segment: AIMessageSegment = {
        type: 'apply_confirmation',
        content: simulation.humanSummary,
        payload: {
          simulationId: simulation.id,
          summary: simulation.humanSummary,
        },
      };

      return {
        modelContent: {
          simulationId: simulation.id,
          status: 'confirmation_prepared',
          note:
            'The user has been shown an Apply button. The change has NOT been ' +
            'applied. Do not claim it has been applied; do not imply it will be.',
        },
        segments: [segment],
      };
    },
  };
}