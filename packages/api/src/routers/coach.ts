import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  createProvider,
  runCoachTurn,
  type AIMessageSegment,
  type CoachToolDeps,
  type ContextBuilderDeps,
  type OrchestratorDeps,
  type ScopedProgramVersion,
} from '@training/ai';
import { L2_ENABLED } from '@training/config';
import type {
  Analysis,
  AssessmentResult,
  FitScoreResult,
  ProgramStructure,
} from '@training/domain';
import {
  findGoalById,
  findGoalProfileById,
  findLatestAssessmentSnapshotForVersion,
  findVersionById,
  listExercises,
} from '@training/db';

// ⚠️ RECONCILE THIS IMPORT
// Swap for whatever Phase 6 exports as its ownership-checked block loader.
// It must return { programId, programVersionId } for the block, or throw
// TRPCError NOT_FOUND on non-ownership. Candidate names to grep for:
//   loadOwnedTrainingBlock, loadOwnedBlock, getOwnedBlock,
//   loadOwnedExecution, loadOwnedTrainingBlockOrThrow
import { loadOwnedTrainingBlockOrThrow } from '../services/loadOwnedExecution';

import {
  createConstraint,
  createTemporaryConstraintForConversation,
  listConstraintsForUser,
  listTemporaryConstraintsForConversation,
} from '../services/constraintService';
import {
  getOrCreateScopedConversation,
  listConversationsForUser,
  listMessagesForConversation,
  listRecentMessagesForContext,
  loadOwnedConversation,
  persistConversationMessage,
} from '../services/coachConversationService';
import { getPrimaryProgramId } from '../services/identityService';
import { loadOwnedProgramOrThrow } from '../services/loadOwnedProgram';
import {
  loadOwnedSimulationForCoach,
  simulateAndPersistForCoach,
} from '../services/simulationService';
import { protectedProcedure, router } from '../trpc';

/**
 * Coach router — the Phase 8 surface.
 *
 * BOUNDARY (ARCH-011, ARCH-018): this file MUST NOT call commitFromMutation
 * or commitFromSimulation. The Coach explains and proposes; the apply is a
 * client-triggered call to the programVersion router's commit procedure,
 * made from the Coach panel's Apply button. If either name appears in this
 * file, that is a violation of the central safety invariant of Phase 8.
 *
 * The tool's prepare_apply_confirmation only returns a render payload — the
 * router does not apply it, and no code path in packages/ai or this router
 * can. This is the mechanical enforcement of "applying is a distinct,
 * explicit, human-triggered action" (Final Freeze invariant 5).
 *
 * The postMessage procedure constructs OrchestratorDeps on each call:
 *
 *   - provider: selected by createProvider() from MODEL_PROVIDER (ARCH-045).
 *     Constructed per turn so a missing key fails at subscription time with
 *     a clear error, not at module load.
 *   - scoping: openConversation auto-scopes to the user's primary Program
 *     when the caller supplies no scope (ARCH-047). Every /app/coach
 *     conversation is therefore program-scoped whenever the user has a
 *     program; users with no programs keep the general conversation.
 *   - toolDeps: the six CoachToolDeps methods, each wired to a real service.
 *   - contextDeps: the five ContextBuilderDeps methods.
 *   - persistMessage: writes AIMessage rows via coachConversationService.
 *   - l2Enabled: from packages/config's build-time constant, threaded as an
 *     argument — packages/ai never imports the flag itself.
 *   - model: resolved by createProvider() from the provider-specific model
 *     env var, per ARCH-007 (no model strings in code).
 */

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const postMessageInput = z.object({
  conversationId: z.string().min(1),
  text: z.string().trim().min(1).max(4000),
});

const getConversationInput = z.object({
  id: z.string().min(1),
});

const openConversationInput = z.object({
  programId: z.string().min(1).nullable().optional(),
  programVersionId: z.string().min(1).nullable().optional(),
  /**
   * When true, skip the get-or-create lookup and always create a fresh
   * conversation for the resolved scope. /app/coach's "+ New" button sets
   * this; the Review path (openConversationForBlock) does not, and neither
   * does any future "open my program chat" affordance.
   */
  forceNew: z.boolean().optional(),
});

const openConversationForBlockInput = z.object({
  trainingBlockId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Deps construction
// ---------------------------------------------------------------------------

/**
 * Build the ContextBuilderDeps for one turn.
 *
 * Closed over `userId` because the context builder's interface deliberately
 * passes only `conversationId` to some of its methods. The userId is what
 * authorises every load, and it comes from the session, never from an
 * argument the caller could influence.
 *
 * `loadScopedProgramVersion` reads the persisted COMMIT-time
 * AssessmentSnapshot for the version — metrics (Analysis), assessment
 * (AssessmentResult), and fitScore (FitScoreResult) all come from the same
 * snapshot row. That is the ARCH-015 discipline: the Coach sees the
 * assessment the user actually saw at commit time, not a live recompute.
 *
 * GOAL-DRIFT NOTE: the snapshot's assessment was computed against the goal
 * that was active at commit time. If the Program's currentGoalId has since
 * changed, `assessment` here reflects the old goal while `activeGoal` in
 * the returned context reflects the new one. This is correct per ARCH-015 —
 * the Coach should explain what was shown, not what would be shown today —
 * but a future change to goal switching should consider whether the Coach
 * needs to narrate the difference.
 */
function buildContextDepsForTurn(userId: string): ContextBuilderDeps {
  return {
    loadScopedProgramVersion: async ({
      userId: callerId,
      conversationId,
    }): Promise<ScopedProgramVersion | null> => {
      if (callerId !== userId) {
        throw new Error('context-builder userId mismatch');
      }

      const conversation = await loadOwnedConversation(userId, conversationId);
      if (!conversation || !conversation.programId) return null;

      const program = await loadOwnedProgramOrThrow(
        userId,
        conversation.programId,
      );
      if (!program.activeVersionId) return null;

      const version = await findVersionById(program.activeVersionId);
      if (!version) return null;

      if (!program.currentGoalId) return null;
      const goal = await findGoalById(program.currentGoalId);
      if (!goal) return null;
      const profile = await findGoalProfileById(goal.goalProfileId);
      if (!profile) return null;

      // The snapshot is the source for all three computed artifacts. No
      // computeAnalysis / computeAssessment / computeFitScore call appears
      // in this file — reading the snapshot is the ARCH-015 discipline and
      // re-running the engine here would silently disagree with what the
      // user was shown if the engine or config had since changed.
      const snapshot = await findLatestAssessmentSnapshotForVersion(
        version.id,
      );
      if (!snapshot) return null;

      const structure = version.structureSnapshot as ProgramStructure;
      const analysis = snapshot.metrics as Analysis;
      const assessment = snapshot.assessment as AssessmentResult;
      const fitScore = snapshot.fitScore as FitScoreResult;

      return {
        programId: program.id,
        programVersionId: version.id,
        versionNumber: version.versionNumber,
        structure,
        analysis,
        assessment,
        fitScore,
        goalId: goal.id,
        goalProfileKey: profile.key,
      };
    },

    listPersistentConstraints: async ({ userId: callerId, limit }) => {
      if (callerId !== userId) {
        throw new Error('context-builder userId mismatch');
      }
      const rows = await listConstraintsForUser({ userId, limit });
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        note: r.note,
        createdAtISO: r.createdAt.toISOString(),
      }));
    },

    listTemporaryConstraintsForConversation: async ({
      conversationId,
      limit,
    }) => {
      const rows = await listTemporaryConstraintsForConversation({
        userId,
        conversationId,
        limit,
      });
      if (rows === null) return [];
      return rows.map((r) => ({
        id: r.id,
        conversationId: r.aiConversationId,
        note: r.note,
        createdAtISO: r.createdAt.toISOString(),
      }));
    },

    listRecentConversationMessages: async ({ conversationId, limit }) => {
      return listRecentMessagesForContext({ conversationId, limit });
    },

    /**
     * L2-only. The orchestrator calls this only when l2Enabled is true;
     * Phase 8 ships l2Enabled false, so this is never reached. Wired to a
     * placeholder that returns null. A future phase that flips L2_ENABLED
     * replaces this body with a real summarising read — no shape change.
     */
    loadTrainingHistorySummary: async () => null,
  };
}

/**
 * Build the CoachToolDeps for one turn.
 *
 * Every method that needs a userId reads it from this closure — never from
 * its input argument. The tool layer passes `ctx.userId` (which the
 * orchestrator populated from the session); a model that tries to influence
 * which user's data a tool touches has no path to do so (asserted by the
 * permission-boundary test in the Phase 8 suite).
 */
function buildToolDepsForTurn(
  userId: string,
  _conversationId: string,
): CoachToolDeps {
  return {
    lookupExercises: async ({ query }) => {
      const all = await listExercises();
      const q = query?.toLowerCase();
      const filtered = q
        ? all.filter((e) => e.name.toLowerCase().includes(q))
        : all;
      return filtered.slice(0, 100).map((e) => ({
        id: e.id,
        name: e.name,
        muscleGroups: [],
      }));
    },

    // The simulation half is injected — this is the ARCH-011 / ARCH-018
    // injection point. simulateAndPersistForCoach is a thin adapter over the
    // same service the simulation.simulate procedure uses; it does not call
    // any commit-shaped function.
    simulateAndPersist: simulateAndPersistForCoach,

    loadOwnedSimulation: loadOwnedSimulationForCoach,

    noteConstraint: async ({ kind, note }) => {
      const record = await createConstraint({
        userId,
        kind,
        note,
      });
      return {
        id: record.id,
        kind: record.kind,
        note: record.note,
        createdAtISO: record.createdAt.toISOString(),
      };
    },

    noteTemporaryConstraint: async ({ conversationId: convId, note }) => {
      const record = await createTemporaryConstraintForConversation({
        userId,
        conversationId: convId,
        note,
      });
      if (!record) {
        throw new Error('Conversation not found or not owned by caller.');
      }
      return {
        id: record.id,
        conversationId: record.aiConversationId,
        note: record.note,
        createdAtISO: record.createdAt.toISOString(),
      };
    },

    /**
     * L2-only. Tool is constructed but excluded from the model-facing array
     * while L2_ENABLED is false (see packages/ai's buildModelFacingTools);
     * this dep is never invoked in Phase 8.
     */
    queryTrainingHistory: async () => ({ blocks: [] }),
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const coachRouter = router({
  /**
   * Get-or-create the conversation scoped to a (programId, programVersionId)
   * tuple.
   *
   * Auto-scope (ARCH-047): when the caller supplies no scope — both arguments
   * null — the procedure resolves the user's primary Program server-side and
   * scopes the conversation to it. This is what makes /app/coach's "+ New"
   * button produce a program-scoped conversation without the client having to
   * know what "primary program" means. The general (unscoped) conversation
   * remains available for users with no programs.
   *
   * ProgramVersion is deliberately left null on the auto-scope path: the
   * Coach's context builder resolves the current active version live from the
   * Program, so a single (programId, null) conversation is reused across
   * version changes — which is the intent. A version-pinned conversation is
   * created only by `openConversationForBlock`, which sets both fields.
   */
  openConversation: protectedProcedure
    .input(openConversationInput)
    .mutation(async ({ ctx, input }) => {
      let programId = input.programId ?? null;
      const programVersionId = input.programVersionId ?? null;

      if (programId === null && programVersionId === null) {
        programId = await getPrimaryProgramId(ctx.user.id);
      }

      const conversation = await getOrCreateScopedConversation(
        ctx.user.id,
        { programId, programVersionId },
        { forceNew: input.forceNew === true },
      );
      return {
        id: conversation.id,
        programId: conversation.programId,
        programVersionId: conversation.programVersionId,
        createdAtISO: conversation.createdAt.toISOString(),
      };
    }),

  /**
   * Get-or-create the conversation scoped to the program version a given
   * TrainingBlock was opened by. Used by the Review RSC — it has a blockId
   * but not a programId/programVersionId, and the panel needs a conversation
   * scoped to the version under review.
   *
   * Extension beyond the phase file's three-procedure list, alongside
   * `openConversation`. Flagged in DECISIONS at Phase 8 close-out.
   *
   * The block → version → program resolution happens server-side and is
   * ownership-checked. The client cannot influence which program the
   * conversation is scoped to.
   */
  openConversationForBlock: protectedProcedure
    .input(openConversationForBlockInput)
    .mutation(async ({ ctx, input }) => {
      const block = await loadOwnedTrainingBlockOrThrow(
        ctx.user.id,
        input.trainingBlockId,
      );

      // TrainingBlock carries programVersionId only; the program is reached
      // by joining through the version. Both lookups are ownership-checked:
      // the block by loadOwnedTrainingBlockOrThrow above, the version by the
      // program load below (a version the user does not own will not be
      // reachable from a program they do own).
      const version = await findVersionById(block.programVersionId);
      if (!version) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'This training block references a program version that no longer exists.',
        });
      }

      const program = await loadOwnedProgramOrThrow(
        ctx.user.id,
        version.programId,
      );

      const conversation = await getOrCreateScopedConversation(ctx.user.id, {
        programId: program.id,
        programVersionId: version.id,
      });

      return {
        id: conversation.id,
        programId: conversation.programId,
        programVersionId: conversation.programVersionId,
        createdAtISO: conversation.createdAt.toISOString(),
      };
    }),

  listConversations: protectedProcedure.query(async ({ ctx }) => {
    const rows = await listConversationsForUser(ctx.user.id, { limit: 100 });
    return rows.map((r) => ({
      id: r.id,
      programId: r.programId,
      programVersionId: r.programVersionId,
      createdAtISO: r.createdAt.toISOString(),
    }));
  }),

  getConversation: protectedProcedure
    .input(getConversationInput)
    .query(async ({ ctx, input }) => {
      const conversation = await loadOwnedConversation(ctx.user.id, input.id);
      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found.',
        });
      }
      const [messages, temporaryConstraints] = await Promise.all([
        listMessagesForConversation(conversation.id),
        listTemporaryConstraintsForConversation({
          userId: ctx.user.id,
          conversationId: conversation.id,
          limit: 200,
        }),
      ]);
      return {
        id: conversation.id,
        programId: conversation.programId,
        programVersionId: conversation.programVersionId,
        createdAtISO: conversation.createdAt.toISOString(),
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          segments: m.segments as AIMessageSegment[],
          createdAtISO: m.createdAt.toISOString(),
        })),
        temporaryConstraints: (temporaryConstraints ?? []).map((r) => ({
          id: r.id,
          conversationId: r.aiConversationId,
          note: r.note,
          createdAtISO: r.createdAt.toISOString(),
        })),
      };
    }),

  /**
   * The streaming Coach turn.
   *
   * Ownership is checked BEFORE the orchestrator runs, so an unauthorised
   * conversation id fails fast with NOT_FOUND and never reaches the model.
   *
   * No commit-shaped call appears in this procedure, or anywhere in this
   * file. The apply happens client-side via the programVersion router.
   *
   * Provider selection (ARCH-045): createProvider() reads MODEL_PROVIDER
   * from the environment and returns the concrete ModelProvider plus the
   * resolved model string. Throws with a clear message if the selected
   * provider's required env is missing — the throw surfaces here, at
   * subscription time, before any message is persisted or any context is
   * built.
   */
  postMessage: protectedProcedure
    .input(postMessageInput)
    .subscription(async function* ({ ctx, input }) {
      const userId = ctx.user.id;

      const owned = await loadOwnedConversation(userId, input.conversationId);
      if (!owned) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found.',
        });
      }

      const { provider, model } = createProvider();

      const deps: OrchestratorDeps = {
        provider,
        toolDeps: buildToolDepsForTurn(userId, input.conversationId),
        contextDeps: buildContextDepsForTurn(userId),
        persistMessage: persistConversationMessage,
        l2Enabled: L2_ENABLED,
        model,
      };

      for await (const chunk of runCoachTurn(deps, {
        userId,
        conversationId: input.conversationId,
        userMessageText: input.text,
      })) {
        yield chunk;
      }
    }),
});