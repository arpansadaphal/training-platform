import type {
  Analysis,
  AssessmentResult,
  FitScoreResult,
  ProgramStructure,
} from '@training/domain';

import type {
  ConstraintRecord,
  TemporaryConstraintRecord,
  TrainingHistorySummary,
} from './tools/types';

/**
 * Coach context — the bounded, structured payload the model sees on each
 * turn.
 *
 * Design principles:
 *
 *   1. **Bounded.** Every collection has an explicit cap. The function reads
 *      like a whitelist of what's included, not a dump. A future reader
 *      should be able to audit "what could possibly be in the context?" by
 *      reading this file and nothing else.
 *
 *   2. **Structured.** The model sees typed fields, not raw DB rows. A
 *      `ConstraintRecord` has been projected to `{ id, kind, note,
 *      createdAtISO }` — nothing more.
 *
 *   3. **Populated conditionally.** `recentHistorySummary` is present in the
 *      type but populated only when L2 is enabled. The type is stable across
 *      the L1→L2 boundary; only the value changes.
 */

export interface AIMessageForContext {
  id: string;
  role: 'USER' | 'ASSISTANT';
  /**
   * Plain-text projection for the model. For assistant messages, this is the
   * concatenation of text and claim segment contents — non-text segments
   * (apply_confirmation, constraint_notice) are UI affordances, not
   * conversational content, and are omitted.
   */
  textContent: string;
  createdAtISO: string;
}

export interface ScopedProgramVersion {
  programId: string;
  programVersionId: string;
  versionNumber: number;
  structure: ProgramStructure;
  analysis: Analysis;
  assessment: AssessmentResult;
  fitScore: FitScoreResult;
  goalId: string;
  goalProfileKey: string;
}

export interface CoachContext {
   currentProgramVersion: {
    programId: string;
    programVersionId: string;
    versionNumber: number;
    structure: ProgramStructure;
    analysis: Analysis;
    assessment: AssessmentResult;
    fitScore: FitScoreResult;
  } | null;
  activeGoal: { id: string; profileKey: string } | null;
  persistentConstraints: ConstraintRecord[];
  /** This conversation only. Never confused with a workout Session. */
  temporaryConstraints: TemporaryConstraintRecord[];
  /** Null when L2 is off. Populated only when l2Enabled is true. */
  recentHistorySummary: TrainingHistorySummary | null;
  /** Most recent turns, newest last. Hard-capped at CONVERSATION_MESSAGE_CAP. */
  conversationHistory: AIMessageForContext[];
}

const BOUNDS = {
  PERSISTENT_CONSTRAINTS: 20,
  TEMPORARY_CONSTRAINTS: 20,
  CONVERSATION_MESSAGES: 20,
  TRAINING_HISTORY_BLOCKS: 10,
} as const;

export interface ContextBuilderDeps {
  /**
   * Loads the program version in view, its goal, structure, and the latest
   * COMMIT-time AssessmentSnapshot for that version.
   *
   * Per ARCH-015 and Phase 7's read discipline, this reads the persisted
   * snapshot, never a live recompute. If the conversation is not scoped to a
   * program, returns null.
   *
   * The implementation lives in packages/api and is injected here — same
   * reason as the tool deps: it keeps the reading surface of packages/ai
   * explicit and testable without a live DB.
   */
  loadScopedProgramVersion(input: {
    userId: string;
    conversationId: string;
  }): Promise<ScopedProgramVersion | null>;

  listPersistentConstraints(input: {
    userId: string;
    limit: number;
  }): Promise<ConstraintRecord[]>;

  listTemporaryConstraintsForConversation(input: {
    conversationId: string;
    limit: number;
  }): Promise<TemporaryConstraintRecord[]>;

  /**
   * Most recent messages for the conversation, oldest first, capped at
   * `limit`. The orchestrator persists the current user message BEFORE
   * calling this, so the returned array already ends with it and the
   * orchestrator does not append again.
   */
  listRecentConversationMessages(input: {
    conversationId: string;
    limit: number;
  }): Promise<AIMessageForContext[]>;

  /**
   * L2 retrieval. Only called when the flag is on. Returns null when the
   * user has no completed blocks yet.
   */
  loadTrainingHistorySummary(input: {
    userId: string;
    programId?: string;
    limit: number;
  }): Promise<TrainingHistorySummary | null>;
}

export interface BuildCoachContextOptions {
  /**
   * Phase 8 ships this `false`. The value is threaded from packages/config's
   * L2_ENABLED constant at the call site (packages/api's coach router), not
   * imported here — so tests can exercise both branches without touching
   * module state, and so this package has no runtime coupling to a flag it
   * does not own.
   */
  l2Enabled: boolean;
}

export async function buildCoachContext(
  deps: ContextBuilderDeps,
  input: { userId: string; conversationId: string },
  options: BuildCoachContextOptions,
): Promise<CoachContext> {
  const scoped = await deps.loadScopedProgramVersion({
    userId: input.userId,
    conversationId: input.conversationId,
  });

  const [persistentConstraints, temporaryConstraints, conversationHistory] =
    await Promise.all([
      deps.listPersistentConstraints({
        userId: input.userId,
        limit: BOUNDS.PERSISTENT_CONSTRAINTS,
      }),
      deps.listTemporaryConstraintsForConversation({
        conversationId: input.conversationId,
        limit: BOUNDS.TEMPORARY_CONSTRAINTS,
      }),
      deps.listRecentConversationMessages({
        conversationId: input.conversationId,
        limit: BOUNDS.CONVERSATION_MESSAGES,
      }),
    ]);

  // L2 retrieval is the only branch that changes shape with the flag. When
  // the flag is off, the field is null — present in the type, absent in the
  // value. This is the boundary between L1 and L2, and it is intentionally
  // the only place in the context builder that reads `options.l2Enabled`.
  const recentHistorySummary =
    options.l2Enabled && scoped
      ? await deps.loadTrainingHistorySummary({
          userId: input.userId,
          programId: scoped.programId,
          limit: BOUNDS.TRAINING_HISTORY_BLOCKS,
        })
      : null;

  return {
       currentProgramVersion: scoped
      ? {
          programId: scoped.programId,
          programVersionId: scoped.programVersionId,
          versionNumber: scoped.versionNumber,
          structure: scoped.structure,
          analysis: scoped.analysis,
          assessment: scoped.assessment,
          fitScore: scoped.fitScore,
        }
      : null,
    activeGoal: scoped
      ? { id: scoped.goalId, profileKey: scoped.goalProfileKey }
      : null,
    persistentConstraints,
    temporaryConstraints,
    recentHistorySummary,
    conversationHistory,
  };
}

/**
 * Exported for the context-builder test to assert the bounds are what a
 * reviewer expects, and for the orchestrator's documentation to reference
 * the same numbers.
 */
export const CONTEXT_BOUNDS = BOUNDS;