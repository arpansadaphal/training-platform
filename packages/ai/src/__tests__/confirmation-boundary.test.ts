import { describe, expect, it } from 'vitest';

import { MockProvider, runCoachTurn } from '..';
import { createPrepareApplyConfirmationTool } from '../tools/prepareApplyConfirmation';

import {
  drain,
  finalTurnJson,
  makeSpyToolDeps,
  makeStubOrchestratorDeps,
  TURN_INPUT,
} from './test-helpers';

const CTX = {
  userId: 'user-1',
  conversationId: 'conv-1',
  currentProgramId: 'p-1',
  currentProgramVersionId: 'v-1',
};

describe('confirmation boundary (ARCH-011, ARCH-018)', () => {
  // -------------------------------------------------------------------------
  // Structural: no commit-shaped method exists on the injected deps
  // -------------------------------------------------------------------------

  it('CoachToolDeps has no method whose name is commit-shaped', () => {
    const { deps } = makeSpyToolDeps();
    const keys = Object.keys(deps);
    const suspicious = keys.filter((k) =>
      k.toLowerCase().includes('commit'),
    );
    expect(suspicious).toEqual([]);
  });

  it('CoachToolDeps has exactly the six declared methods', () => {
    // If a future refactor adds a seventh — particularly one that could
    // mutate program structure — this assertion flags it for review.
    const { deps } = makeSpyToolDeps();
    const keys = Object.keys(deps);
    expect(keys.sort()).toEqual([
      'loadOwnedSimulation',
      'lookupExercises',
      'noteConstraint',
      'noteTemporaryConstraint',
      'queryTrainingHistory',
      'simulateAndPersist',
    ]);
  });

  // -------------------------------------------------------------------------
  // Tool behavior: prepare_apply_confirmation only reads
  // -------------------------------------------------------------------------

  it('prepare_apply_confirmation reads the simulation and returns a payload — no write', async () => {
    const { deps, calls } = makeSpyToolDeps({
      loadOwnedSimulation: async () => ({
        id: 'sim-1',
        baseVersionId: 'v-1',
        humanSummary: 'Apply simulated add exercise',
      }),
    });
    const tool = createPrepareApplyConfirmationTool(deps);

    const result = await tool.execute({ simulationId: 'sim-1' }, CTX);

    // Only the read occurred — no other dep was touched. The recording
    // helper wraps overrides, so this assertion sees the call even though
    // the impl was overridden.
    expect(calls.map((c) => c.method)).toEqual(['loadOwnedSimulation']);

    // The tool returned a render payload — an apply_confirmation segment.
    expect(result.segments).toHaveLength(1);
    const seg = result.segments?.[0];
    expect(seg?.type).toBe('apply_confirmation');
    if (seg?.type === 'apply_confirmation') {
      expect(seg.payload.simulationId).toBe('sim-1');
    }

    // The modelContent explicitly tells the model that nothing was applied.
    const content = result.modelContent as { note: string; status: string };
    expect(content.status).toBe('confirmation_prepared');
    expect(content.note.toLowerCase()).toContain('not');
  });

  it('rejects a simulation id that the caller does not own', async () => {
    const { deps } = makeSpyToolDeps({
      loadOwnedSimulation: async () => null,
    });
    const tool = createPrepareApplyConfirmationTool(deps);

    await expect(
      tool.execute({ simulationId: 'sim-other' }, CTX),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // -------------------------------------------------------------------------
  // End-to-end: the orchestrator yields a segment chunk but applies nothing
  // -------------------------------------------------------------------------

  it('the orchestrator yields an apply_confirmation segment — and no mutation occurs', async () => {
    const provider = new MockProvider();
    provider.queueToolCall('prepare_apply_confirmation', {
      simulationId: 'sim-1',
    });
    provider.queueText(
      finalTurnJson([
        {
          type: 'text',
          content: 'I have prepared the change. Click Apply to commit it.',
        },
      ]),
    );

    const { deps: toolDeps, calls: toolCalls } = makeSpyToolDeps({
      loadOwnedSimulation: async () => ({
        id: 'sim-1',
        baseVersionId: 'v-1',
        humanSummary: 'Apply simulated add exercise',
      }),
    });
    const { deps, persistSpy } = makeStubOrchestratorDeps(provider, {
      toolDeps,
    });

    const chunks = await drain(runCoachTurn(deps, TURN_INPUT));

    // Exactly one segment chunk was yielded, of type apply_confirmation.
    const segmentChunks = chunks.filter((c) => c.type === 'segment');
    expect(segmentChunks).toHaveLength(1);
    const first = segmentChunks[0];
    if (first?.type === 'segment') {
      expect(first.segment.type).toBe('apply_confirmation');
    }

    // Exactly one dep was called: loadOwnedSimulation. No simulate, no
    // constraint write, nothing else.
    expect(toolCalls.map((c) => c.method)).toEqual(['loadOwnedSimulation']);

    // The persisted assistant message carries the apply_confirmation
    // payload — and only that. There is no "applied" state to be found
    // anywhere in the persisted data, because no such state is written by
    // the server on a prepare.
    const assistant = persistSpy.calls.find((c) => c.role === 'ASSISTANT');
    expect(assistant).toBeDefined();
    const applySegments = assistant?.segments.filter(
      (s) => s.type === 'apply_confirmation',
    );
    expect(applySegments).toHaveLength(1);
  });
});