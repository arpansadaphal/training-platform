import { describe, expect, it } from 'vitest';

import type { MutationSpec, SimulationResult } from '@training/domain';

import type { SimulateAndPersistInput, ToolExecutionContext } from '..';
import { createSimulateProgramChangeTool } from '../tools/simulateProgramChange';

import { makeSpyToolDeps } from './test-helpers';

const CTX: ToolExecutionContext = {
  userId: 'user-1',
  conversationId: 'conv-1',
  currentProgramId: 'prog-1',
  currentProgramVersionId: 'ver-1',
};

const SAMPLE_RESULT = {
  kind: 'INVALID_MUTATION',
  reason: 'test stub',
} as unknown as SimulationResult;

describe('simulate_program_change consistency with simulation.simulate', () => {
  it('calls deps.simulateAndPersist with the exact input shape the router provides', async () => {
    // The router wires simulateAndPersist to simulateAndPersistForCoach,
    // which is a thin positional wrapper over the same simulationService
    // function that simulation.simulate uses. This test asserts the tool
    // does not mangle the input on its way in. If it did — if it built its
    // own input object with different field names, or omitted
    // conversationId, or supplied a hardcoded baseVersionId — the tool
    // would be a second, divergent implementation of the simulation path,
    // and invariant 2 ("simulate and apply share one mutation function")
    // would be violated at the AI layer.
    const { deps, calls } = makeSpyToolDeps();
    const tool = createSimulateProgramChangeTool(deps);

    const mutation = { op: 'ADD_EXERCISE' } as unknown as MutationSpec;
    await tool.execute({ mutation }, CTX);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.method).toBe('simulateAndPersist');
    const input = call?.input as SimulateAndPersistInput;
    expect(input).toEqual({
      userId: CTX.userId,
      programId: CTX.currentProgramId,
      baseVersionId: CTX.currentProgramVersionId,
      conversationId: CTX.conversationId,
      spec: mutation,
    });
  });

  it('returns the dep result as modelContent by reference, unmodified', async () => {
    const { deps } = makeSpyToolDeps({
      simulateAndPersist: async () => ({
        simulationId: 'sim-1',
        result: SAMPLE_RESULT,
      }),
    });
    const tool = createSimulateProgramChangeTool(deps);
    const out = await tool.execute(
      { mutation: { op: 'X' } as unknown as MutationSpec },
      CTX,
    );

    // Identity equality — the result object the tool returns IS the same
    // object the dep returned. No wrapping, no copying, no field mapping
    // that could subtly disagree with the router's presentation.
    const content = out.modelContent as {
      simulationId: string | null;
      result: SimulationResult;
    };
    expect(content.simulationId).toBe('sim-1');
    expect(content.result).toBe(SAMPLE_RESULT);
  });

  it('passes an INVALID_MUTATION result through unchanged', async () => {
    // Under the shipped HYPERTROPHY config, most simulations return
    // INVALID_MUTATION or CANNOT_COMPUTE. The tool must pass both through
    // without interpretation — the model narrates them honestly, and the
    // engine remains the sole source of quantitative truth (invariant 1).
    const invalidResult: SimulationResult = {
      kind: 'INVALID_MUTATION',
      reason: 'unknown op',
    } as unknown as SimulationResult;

    const { deps } = makeSpyToolDeps({
      simulateAndPersist: async () => ({
        simulationId: null,
        result: invalidResult,
      }),
    });
    const tool = createSimulateProgramChangeTool(deps);
    const out = await tool.execute(
      { mutation: { op: 'X' } as unknown as MutationSpec },
      CTX,
    );
    const content = out.modelContent as {
      simulationId: string | null;
      result: SimulationResult;
    };
    expect(content.simulationId).toBeNull();
    expect(content.result).toBe(invalidResult);
  });

  it('refuses to run when no program is in view, without calling the dep', async () => {
    const { deps, calls } = makeSpyToolDeps();
    const tool = createSimulateProgramChangeTool(deps);

    await expect(
      tool.execute(
        { mutation: { op: 'X' } as unknown as MutationSpec },
        { ...CTX, currentProgramId: null, currentProgramVersionId: null },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    // The dep was never called — the guard fires before the injection point.
    expect(calls).toHaveLength(0);
  });

  it('passes the exact mutation object through without structural validation', async () => {
    // Invariant 1: the deterministic engine is the sole authority on
    // MutationSpec validity. The tool passes the spec through verbatim; the
    // engine returns INVALID_MUTATION for anything it rejects. The tool
    // does not attempt to pre-validate, because a second validator would be
    // a second source of truth.
    const weirdSpec = {
      op: 'SOMETHING_UNUSUAL',
      payload: { nested: true },
    } as unknown as MutationSpec;

    const { deps, calls } = makeSpyToolDeps();
    const tool = createSimulateProgramChangeTool(deps);
    await tool.execute({ mutation: weirdSpec }, CTX);

    const input = calls[0]?.input as SimulateAndPersistInput;
    // Reference equality: the tool did not copy or reshape the spec.
    expect(input.spec).toBe(weirdSpec);
  });
});