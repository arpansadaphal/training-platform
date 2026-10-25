// packages/api/src/services/identityService.ts
//
// The /app landing screen's single aggregation. One procedure, one fan-out,
// so the page renders with a single round trip rather than five-to-six
// parallel reads across four routers.
//
// "Primary Program" is a Phase-7 product choice, not derived from the
// freeze: the Program the user is currently training. Resolution order:
//   1. A non-archived Program with an ACTIVE TrainingBlock.
//   2. Otherwise, the most recently created non-archived Program.
//   3. Otherwise, null (a user with no Programs).
// If two Programs have ACTIVE blocks — an invariant-level oddity at MVP —
// the most recently started block wins; ties break on Program.createdAt.
//
// Headline stats are lifetime-scope, primary-Program-scope, per the Phase 7
// kickoff exchange: sessionsCompleted, totalSetsLogged, versionsCommitted.
// No streak, no "current week" — the phase file warns against
// streak-as-hero-stat.
//
// Phase 10c addition: currentBlock carries an anticipationCue — a purely
// informational, forward-looking line about where the user is in the block.
// Derived from block.plannedLengthWeeks, the active version's workoutDay
// count, and the count of COMPLETED Sessions in the block. No streaks, no
// login counts, no loss-aversion framing.
//
// Phase A2 additions:
//   - The current session's day name comes from the version's normalized
//     WorkoutDay rows, whose ids Sessions reference (ARCH-058). The snapshot's
//     ids never match, which is why the button always read "Workout".
//   - A stale IN_PROGRESS Session (ARCH-057) is not offered as the current
//     session: the next start auto-closes it.
//   - recentClosedBlock: the newest closed block with ≥1 completed session,
//     for "Recent blocks" (empty archive/unarchive blocks never appear).
//   - lastCompletedSessionAt: across all of the user's Programs, for the
//     informational "Welcome back" line.

import {
  listProgramsByOwner,
  findActiveTrainingBlockForProgram,
  findVersionById,
  countCompletedSessionsForProgram,
  countPerformanceRecordsForProgram,
  findActiveSessionForBlock,
  countCompletedSessionsInBlock,
  findLatestCompletedSessionForUser,
  findDayOfActiveSession,
  findLatestSetTimeInOpenSessions,
  findRecentClosedBlockWithSessions,
  countVersionsOfProgram,
  listCompletedPerformancesForVersion,
  listExercises,
  listPrescriptionRowsForVersion,
  listSessionsForBlock,
  listWorkoutDayRowsForVersion,
  type TrainingBlockRecord,
  type ProgramRecord,
} from "@training/db";
import { trainingDayCount, type ProgramStructure } from "@training/domain";
import { isStaleAt, lastActivityAt } from "./sessionService";
import { buildTodayPlan, type TodayPlan } from "./todayService";
import {
  buildAnticipationCue,
  type AnticipationCue,
} from "./anticipationCue";

export interface IdentitySummaryActiveVersion {
  id: string;
  versionNumber: number;
  createdAt: Date;
}

export interface IdentitySummaryCurrentBlock {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
  startedAt: Date;
  plannedLengthWeeks: number | null;
  /** Phase 10c. */
  anticipationCue: AnticipationCue;
  /** COMPLETED Sessions in this block. */
  sessionsCompleted: number;
}

export interface IdentitySummaryCurrentSession {
  id: string;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
  workoutDayName: string;
  /** ARCH-061: the day is a rest day. */
  isRestDay: boolean;
  sequenceIndex: number;
}

export interface IdentitySummaryProgram {
  id: string;
  name: string;
  activeVersion: IdentitySummaryActiveVersion | null;
  currentBlock: IdentitySummaryCurrentBlock | null;
}

export interface IdentitySummaryStats {
  sessionsCompleted: number;
  totalSetsLogged: number;
  versionsCommitted: number;
}

export interface IdentitySummaryClosedBlock {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
  startedAt: Date;
  endedAt: Date | null;
}

export interface IdentitySummary {
  primaryProgram: IdentitySummaryProgram | null;
  /** Phase A2: the primary Program's most recently started closed block, or null. */
  recentClosedBlock: IdentitySummaryClosedBlock | null;
  /** Phase A2: when the user last completed any Session, or null. */
  lastCompletedSessionAt: Date | null;
  /** Read-only: an existing PLANNED / IN_PROGRESS Session, or null. Never creates one. */
  currentSession: IdentitySummaryCurrentSession | null;
  /** The Today card (ARCH-062): today's day with a target per lift, or what was just done. */
  today: TodayPlan | null;
  /** Sessions completed in the last 7 days against the training days a week the program has; null with no block. */
  weekProgress: { completed: number; planned: number } | null;
  stats: IdentitySummaryStats;
}

/**
 * Three steps, not eleven: (1) the programs and the last completed session;
 * (2) each program's active block, to pick the primary one; (3) everything
 * about the primary program side by side. Each read in step 3 is one flat
 * statement keyed off ids already in hand, so the page waits for three round
 * trips however many things it shows.
 */
export async function getMyIdentitySummary(
  userId: string,
): Promise<IdentitySummary> {
  const [programs, lastCompleted] = await Promise.all([
    listProgramsByOwner(userId, { includeArchived: false }),
    findLatestCompletedSessionForUser(userId),
  ]);
  const lastCompletedSessionAt = lastCompleted?.completedAt ?? null;

  const picked = await pickPrimaryProgram(programs);

  if (!picked) {
    return {
      primaryProgram: null,
      recentClosedBlock: null,
      lastCompletedSessionAt,
      currentSession: null,
      today: null,
      weekProgress: null,
      stats: {
        sessionsCompleted: 0,
        totalSetsLogged: 0,
        versionsCommitted: 0,
      },
    };
  }
  const primary = picked.program;
  const block = picked.block;

  // The anticipation cue (Phase 10c) is derived from the block's
  // plannedLengthWeeks, the active version's workoutDay count, and the count
  // of COMPLETED Sessions in the block (SKIPPED and IN_PROGRESS do not count).
  // session.getOrCreateNext is the MUTATING path, called only from /train;
  // rendering /app never creates a Session, so the current session is a read.
  const now = new Date();
  const [
    activeVersion,
    sessionsCompletedInBlock,
    activeSession,
    activeDay,
    latestSetTime,
    closed,
    sessionsCompleted,
    totalSetsLogged,
    versionsCommitted,
    todayDays,
    todayPrescriptions,
    blockSessions,
    todayHistory,
    exercises,
  ] = await Promise.all([
    primary.activeVersionId ? findVersionById(primary.activeVersionId) : Promise.resolve(null),
    block ? countCompletedSessionsInBlock(block.id) : Promise.resolve(0),
    block ? findActiveSessionForBlock(block.id) : Promise.resolve(null),
    block ? findDayOfActiveSession(block.id) : Promise.resolve(null),
    block ? findLatestSetTimeInOpenSessions(block.id) : Promise.resolve(null),
    // Newest closed block with at least one completed session. Empty blocks
    // (opened by unarchive and closed again, or a version activated and
    // replaced without training) are never "recent".
    findRecentClosedBlockWithSessions(primary.id),
    countCompletedSessionsForProgram(primary.id),
    countPerformanceRecordsForProgram(primary.id),
    countVersionsOfProgram(primary.id),
    // The Today card: the version being trained, its history, and the block's
    // sessions, all keyed off ids already in hand.
    block ? listWorkoutDayRowsForVersion(block.programVersionId) : Promise.resolve([]),
    block ? listPrescriptionRowsForVersion(block.programVersionId) : Promise.resolve([]),
    block ? listSessionsForBlock(block.id) : Promise.resolve([]),
    block ? listCompletedPerformancesForVersion(userId, block.programVersionId) : Promise.resolve([]),
    listExercises(),
  ]);

  let activeVersionInfo: IdentitySummaryActiveVersion | null = null;
  let activeVersionStructure: ProgramStructure | null = null;
  if (activeVersion) {
    activeVersionInfo = {
      id: activeVersion.id,
      versionNumber: activeVersion.versionNumber,
      createdAt: activeVersion.createdAt,
    };
    activeVersionStructure = activeVersion.structureSnapshot as ProgramStructure;
  }

  let currentBlock: IdentitySummaryCurrentBlock | null = null;
  if (block) {
    currentBlock = {
      id: block.id,
      status: block.status,
      startedAt: block.startedAt,
      plannedLengthWeeks: block.plannedLengthWeeks,
      sessionsCompleted: sessionsCompletedInBlock,
      anticipationCue: buildAnticipationCue({
        plannedLengthWeeks: block.plannedLengthWeeks,
        sessionsPerWeek: activeVersionStructure ? trainingDayCount(activeVersionStructure) : 0,
        sessionsCompletedInBlock,
      }),
    };
  }

  // A stale IN_PROGRESS Session (ARCH-057) is not offered: the next start
  // auto-closes it. Same rule as isStaleInProgress, from the reads above.
  let currentSession: IdentitySummaryCurrentSession | null = null;
  if (activeSession) {
    const stale =
      activeSession.status === "IN_PROGRESS" &&
      isStaleAt(
        lastActivityAt(
          activeSession,
          latestSetTime === null ? [] : [{ completedAt: latestSetTime }],
        ),
        now,
      );
    if (!stale) {
      currentSession = {
        id: activeSession.id,
        status: activeSession.status,
        sequenceIndex: activeSession.sequenceIndex,
        workoutDayName: activeDay?.name ?? "Workout",
        isRestDay: activeDay?.isRestDay ?? false,
      };
    }
  }

  const stalePending =
    activeSession !== null && activeSession.status === "IN_PROGRESS" && currentSession === null;
  const today = block
    ? buildTodayPlan({
        now,
        days: todayDays,
        prescriptions: todayPrescriptions,
        exercises,
        blockSessions,
        pending: currentSession === null ? null : activeSession,
        staleHasRecords: stalePending && latestSetTime !== null,
        staleSessionId: stalePending ? activeSession.id : null,
        history: todayHistory,
        lastCompletedAt: lastCompletedSessionAt,
      })
    : null;

  const recentClosedBlock: IdentitySummaryClosedBlock | null = closed
    ? { id: closed.id, status: closed.status, startedAt: closed.startedAt, endedAt: closed.endedAt }
    : null;

  return {
    primaryProgram: {
      id: primary.id,
      name: primary.name,
      activeVersion: activeVersionInfo,
      currentBlock,
    },
    recentClosedBlock,
    lastCompletedSessionAt,
    currentSession,
    today,
    weekProgress: weekProgressOf(block !== null, blockSessions, activeVersionStructure, now),
    stats: {
      sessionsCompleted,
      totalSetsLogged,
      versionsCommitted,
    },
  };
}

/** Past 7 days, not a calendar week: a server cannot know the lifter's time zone, and "last 7 days" is a fact in any of them. */
function weekProgressOf(
  hasBlock: boolean,
  sessions: readonly { status: string; completedAt: Date | null }[],
  structure: ProgramStructure | null,
  now: Date,
): { completed: number; planned: number } | null {
  if (!hasBlock || structure === null) return null;
  const planned = trainingDayCount(structure);
  if (planned === 0) return null;
  const since = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const completed = sessions.filter(
    (s) => s.status === "COMPLETED" && s.completedAt !== null && s.completedAt.getTime() >= since,
  ).length;
  return { completed, planned };
}

/**
 * The user's primary Program id, or null if the user has no non-archived
 * Programs. Exposes the same resolution `getMyIdentitySummary` uses
 * internally (`pickPrimaryProgram`) as a lightweight read for callers that
 * need only the id — currently `coach.openConversation`'s auto-scope path
 * (ARCH-047).
 *
 * Kept as its own export rather than exporting `pickPrimaryProgram` because
 * the full ProgramRecord is not a shape the caller should depend on.
 */
export async function getPrimaryProgramId(
  userId: string,
): Promise<string | null> {
  const programs = await listProgramsByOwner(userId, {
    includeArchived: false,
  });
  const primary = await pickPrimaryProgram(programs);
  return primary?.program.id ?? null;
}

// ---- Helpers -------------------------------------------------------------

/**
 * The primary program and its ACTIVE block (null when it has none). Each
 * program's block is looked up at the same time, not one after another.
 */
async function pickPrimaryProgram(
  programs: ProgramRecord[],
): Promise<{ program: ProgramRecord; block: TrainingBlockRecord | null } | null> {
  if (programs.length === 0) return null;

  // Prefer one with an ACTIVE block.
  const blocks = await Promise.all(
    programs.map((p) => findActiveTrainingBlockForProgram(p.id)),
  );
  const withActiveBlock: { program: ProgramRecord; block: TrainingBlockRecord }[] = [];
  programs.forEach((program, i) => {
    const block = blocks[i];
    if (block) withActiveBlock.push({ program, block });
  });

  if (withActiveBlock.length > 0) {
    withActiveBlock.sort((a, b) => {
      const dt = b.block.startedAt.getTime() - a.block.startedAt.getTime();
      if (dt !== 0) return dt;
      return b.program.createdAt.getTime() - a.program.createdAt.getTime();
    });
    const first = withActiveBlock[0];
    if (first) return first;
  }

  // Otherwise the most recently created non-archived Program.
  const sorted = [...programs].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const newest = sorted[0];
  return newest ? { program: newest, block: null } : null;
}
