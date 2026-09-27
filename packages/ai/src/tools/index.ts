import type { ToolDefinition } from '../provider';

import { createLookupExercisesTool } from './lookupExercises';
import { createNoteConstraintTool } from './noteConstraint';
import { createNoteTemporaryConstraintTool } from './noteTemporaryConstraint';
import { createPrepareApplyConfirmationTool } from './prepareApplyConfirmation';
import { createQueryTrainingHistoryTool } from './queryTrainingHistory';
import { createSimulateProgramChangeTool } from './simulateProgramChange';

import type {
  CoachTool,
  CoachToolDeps,
  ToolExecutionContext,
  ToolExecutionResult,
} from './types';
import { ToolExecutionError } from './types';

export type {
  CoachTool,
  CoachToolDeps,
  ExerciseLookupResult,
  ConstraintRecord,
  SimulateAndPersistInput,
  SimulateAndPersistResult,
  SimulationSummary,
  TemporaryConstraintRecord,
  ToolExecutionContext,
  ToolExecutionResult,
  TrainingHistorySummary,
} from './types';
export { ToolExecutionError } from './types';

export interface BuildToolsOptions {
  /**
   * Phase 8 ships this `false`. When `false`, query_training_history is
   * constructed (so tests can exercise it directly) but is NOT included in
   * the tools array passed to the model, and the executor rejects any call
   * to it. Flipping this to `true` is the L1→L2 boundary crossing.
   *
   * The value passed in comes from packages/config's L2_ENABLED constant.
   * It is a parameter here rather than an import so that tests can exercise
   * both branches without touching global state.
   */
  l2Enabled: boolean;
}

/**
 * Construct every CoachTool, regardless of gating. Used by the executor
 * (which must be able to reject a call to a gated tool with a specific error
 * rather than "unknown tool") and by tests that exercise gated tools directly.
 */
export function buildAllTools(deps: CoachToolDeps): CoachTool[] {
  return [
    createLookupExercisesTool(deps),
    createSimulateProgramChangeTool(deps),
    createPrepareApplyConfirmationTool(deps),
    createNoteConstraintTool(deps),
    createNoteTemporaryConstraintTool(deps),
    createQueryTrainingHistoryTool(deps),
  ];
}

const GATED_TOOL_NAMES: ReadonlySet<string> = new Set(['query_training_history']);

/**
 * The tools array passed to the model. Excludes gated tools when the
 * corresponding flag is off. Returning a fresh array each call keeps callers
 * from mutating shared state.
 */
export function buildModelFacingTools(
  deps: CoachToolDeps,
  options: BuildToolsOptions,
): CoachTool[] {
  return buildAllTools(deps).filter((tool) => {
    if (!options.l2Enabled && GATED_TOOL_NAMES.has(tool.name)) {
      return false;
    }
    return true;
  });
}

/**
 * Convert CoachTool[] to the provider's ToolDefinition shape. Kept separate
 * from buildModelFacingTools so a caller can log or snapshot the exact
 * definition set sent to the model without reconstructing it.
 */
export function toModelToolDefinitions(tools: CoachTool[]): ToolDefinition[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export type ToolExecutor = (
  name: string,
  input: unknown,
  ctx: ToolExecutionContext,
) => Promise<ToolExecutionResult>;

/**
 * Build a dispatcher that resolves a model-requested tool name to a
 * CoachTool and executes it. Two independent rejection paths:
 *
 *   1. Gated tool called while its flag is off → UNAUTHORIZED. This is
 *      DEFENCE IN DEPTH, not redundant with buildModelFacingTools:
 *      buildModelFacingTools is what SHOULD keep the model from ever seeing a
 *      gated tool; this executor path is what catches a stale conversation
 *      history, a manipulated input, or a future bug in the filter. Removing
 *      either path weakens the gate — do not delete one as "unreachable."
 *
 *   2. Unknown tool name → INVALID_INPUT. The model invented a name.
 *
 * Both surface as `is_error: true` tool_results to the model, not as thrown
 * exceptions out of the subscription — the orchestrator catches them.
 */
export function buildToolExecutor(
  deps: CoachToolDeps,
  options: BuildToolsOptions,
): ToolExecutor {
  const tools = buildAllTools(deps);
  const byName = new Map(tools.map((t) => [t.name, t]));

  return async (name, input, ctx) => {
    if (!options.l2Enabled && GATED_TOOL_NAMES.has(name)) {
      throw new ToolExecutionError(
        `Tool "${name}" is not enabled in this environment.`,
        'UNAUTHORIZED',
      );
    }
    const tool = byName.get(name);
    if (!tool) {
      throw new ToolExecutionError(
        `Unknown tool "${name}".`,
        'INVALID_INPUT',
      );
    }
    return tool.execute(input, ctx);
  };
}