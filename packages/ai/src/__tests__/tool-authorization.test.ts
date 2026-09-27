import { describe, expect, it } from 'vitest';

import type { ToolExecutionContext } from '..';
import { createLookupExercisesTool } from '../tools/lookupExercises';
import { createNoteConstraintTool } from '../tools/noteConstraint';
import { createNoteTemporaryConstraintTool } from '../tools/noteTemporaryConstraint';
import { createPrepareApplyConfirmationTool } from '../tools/prepareApplyConfirmation';
import { createQueryTrainingHistoryTool } from '../tools/queryTrainingHistory';
import { createSimulateProgramChangeTool } from '../tools/simulateProgramChange';

import { makeSpyToolDeps } from './test-helpers';

const CTX: ToolExecutionContext = {
  userId: 'user-real',
  conversationId: 'conv-real',
  currentProgramId: 'prog-real',
  currentProgramVersionId: 'ver-real',
};

describe('tool authorization', () => {
  describe('every tool reads userId from ctx, never from model input', () => {
    it('lookup_exercises passes ctx.userId to the dep', async () => {
      const { deps, calls } = makeSpyToolDeps();
      const tool = createLookupExercisesTool(deps);
      await tool.execute({ query: 'squat' }, CTX);
      expect(calls).toEqual([
        {
          method: 'lookupExercises',
          input: { userId: CTX.userId, query: 'squat' },
        },
      ]);
    });

    it('simulate_program_change passes ctx.userId and ctx program ids to the dep', async () => {
      const { deps, calls } = makeSpyToolDeps();
      const tool = createSimulateProgramChangeTool(deps);
      await tool.execute({ mutation: { op: 'ADD' } }, CTX);
      const call = calls[0];
      expect(call?.method).toBe('simulateAndPersist');
      expect(call?.input).toMatchObject({
        userId: CTX.userId,
        programId: CTX.currentProgramId,
        baseVersionId: CTX.currentProgramVersionId,
        conversationId: CTX.conversationId,
      });
    });

    it('prepare_apply_confirmation passes ctx.userId to the dep', async () => {
      const { deps, calls } = makeSpyToolDeps({
        // The override returns a fixture. It does NOT record the call —
        // recording is the helper's job (the wrapper the helper installs
        // pushes onto `calls` before delegating to this override). Adding
        // a push here would double-record.
        loadOwnedSimulation: async () => ({
          id: 'sim-1',
          baseVersionId: 'v-1',
          humanSummary: 'x',
        }),
      });
      const tool = createPrepareApplyConfirmationTool(deps);
      await tool.execute({ simulationId: 'sim-1' }, CTX);
      expect(calls).toEqual([
        {
          method: 'loadOwnedSimulation',
          input: { userId: CTX.userId, simulationId: 'sim-1' },
        },
      ]);
    });

    it('note_constraint passes ctx.userId to the dep', async () => {
      const { deps, calls } = makeSpyToolDeps();
      const tool = createNoteConstraintTool(deps);
      await tool.execute({ kind: 'FREEFORM', note: 'x' }, CTX);
      expect(calls[0]?.input).toMatchObject({
        userId: CTX.userId,
        kind: 'FREEFORM',
        note: 'x',
      });
    });

    it('note_temporary_constraint uses ctx.conversationId, not any model input', async () => {
      const { deps, calls } = makeSpyToolDeps();
      const tool = createNoteTemporaryConstraintTool(deps);
      await tool.execute({ note: 'x' }, CTX);
      expect(calls[0]?.input).toMatchObject({
        userId: CTX.userId,
        conversationId: CTX.conversationId,
        note: 'x',
      });
    });

    it('query_training_history passes ctx.userId to the dep', async () => {
      const { deps, calls } = makeSpyToolDeps();
      const tool = createQueryTrainingHistoryTool(deps);
      await tool.execute({}, CTX);
      expect(calls[0]?.input).toMatchObject({ userId: CTX.userId });
    });
  });

  describe('manipulated model input', () => {
    it('a top-level userId field on any tool is rejected by .strict()', async () => {
      const { deps } = makeSpyToolDeps();

      await expect(
        createLookupExercisesTool(deps).execute(
          { query: 'squat', userId: 'attacker' },
          CTX,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

      await expect(
        createSimulateProgramChangeTool(deps).execute(
          { mutation: { op: 'ADD' }, userId: 'attacker' },
          CTX,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

      await expect(
        createPrepareApplyConfirmationTool(deps).execute(
          { simulationId: 'sim-1', userId: 'attacker' },
          CTX,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

      await expect(
        createNoteConstraintTool(deps).execute(
          { kind: 'FREEFORM', note: 'x', userId: 'attacker' },
          CTX,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

      await expect(
        createNoteTemporaryConstraintTool(deps).execute(
          { note: 'x', userId: 'attacker' },
          CTX,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

      await expect(
        createQueryTrainingHistoryTool(deps).execute(
          { userId: 'attacker' },
          CTX,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('a programId smuggled inside the mutation does not change the outer programId', async () => {
      const { deps, calls } = makeSpyToolDeps();
      const tool = createSimulateProgramChangeTool(deps);
      await tool.execute(
        { mutation: { op: 'ADD', programId: 'attacker-program' } },
        CTX,
      );

      // The OUTER programId — the one that determines which program is
      // simulated — is ctx's. The smuggled field travels inside the spec
      // (the engine ignores unknown fields), but it has no effect on the
      // routing.
      const input = calls[0]?.input as {
        programId: string;
        spec: Record<string, unknown>;
      };
      expect(input.programId).toBe(CTX.currentProgramId);
      expect(input.spec.programId).toBe('attacker-program');
    });

    it('note_temporary_constraint has no input field for conversationId', async () => {
      // The tool's schema accepts only { note }. Even if the model tried to
      // pass conversationId, the .strict() schema rejects it, and the
      // handler reads ctx.conversationId regardless.
      const { deps, calls } = makeSpyToolDeps();
      const tool = createNoteTemporaryConstraintTool(deps);

      await expect(
        tool.execute({ note: 'x', conversationId: 'attacker-conv' }, CTX),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

      // Now the honest call — the dep receives ctx's conversationId.
      await tool.execute({ note: 'x' }, CTX);
      expect(calls[0]?.input).toMatchObject({
        conversationId: CTX.conversationId,
      });
    });
  });
});