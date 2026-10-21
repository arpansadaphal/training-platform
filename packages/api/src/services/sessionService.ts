// packages/api/src/services/sessionService.ts
//
// Orchestration for workout Sessions.
//
// Session generation is LAZY, not bulk: getOrCreateNext returns "today's / the
// next" Session on demand by cycling the active version's WorkoutDays in
// orderIndex sequence. Nothing pre-generates a block's Sessions — block length
// is informational, not a hard constraint (08-training-execution-and-evidence.md).
//
// Status transitions (enforced here, not at the repository layer):
//   PLANNED → IN_PROGRESS     (markStarted)
//   IN_PROGRESS → COMPLETED   (markCompleted)
//   PLANNED | IN_PROGRESS → SKIPPED  (markSkipped)
//   COMPLETED, SKIPPED are terminal — a second transition is rejected.
//
// A SKIPPED Session does NOT count toward the block's COMPLETED resolution
// (that rule lives in trainingService, which reads status == COMPLETED only).
//
// Reading the structural context (workout day, prescriptions) goes through
// findVersionWithStructure rather than a dedicated WorkoutDay repository —
// the structure is a per-version projection (ARCH-012), and there is no need
// for a third read path when the version-with-structure read already produces
// exactly the shape the session UI needs.
//
// Phase A2 additions: startSpecificDay (ARCH-056), auto-close of superseded
// IN_PROGRESS Sessions (ARCH-057), getTrainingOptions (the /train picker),
// getLastTimeHints ("Last: 60 kg × 10"). getOrCreateNext is now the
// "suggested day" case of the same start path.
//
// Phase 7 additions:
//   - getCurrentSession: read-only sibling of getOrCreateNext (never creates).
//   - getSessionContext now resolves exercise display names via listExercises
//     instead of leaking the exerciseId cuid as exerciseName.

import { TRPCError } from "@trpc/server";
import {
  createSessionInTx,
  findActiveSessionForBlock,
  findActiveTrainingBlockForProgram,
  findLatestSessionForBlock,
  findProgramById,
  findTrainingBlockById,
  findVersionWithStructure,
  listCompletedPerformancesForExercises,
  listExercises,
  listInProgressSessionsForUser,
  listPerformanceRecordsForSession,
  prisma,
  TRANSACTION_OPTIONS,
  updateSessionStatus,
  updateSessionStatusInTx,
  type ExercisePerformanceRecord,
  type PerformanceRecordRecord,
  type SessionRecord,
  type SessionStatus,
  type TrainingBlockRecord,
} from "@training/db";
import { loadOwnedProgramOrThrow } from "./loadOwnedProgram";
import {
  loadOwnedSessionOrThrow,
  loadOwnedTrainingBlockOrThrow,
} from "./loadOwnedExecution";

interface PrescriptionContext {
  id: string;
  orderIndex: number;
  exerciseId: string;
  exerciseName: string;
  targetSets: number;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe: number | null;
  loadScheme: unknown;
}

interface WorkoutDayContext {
  id: string;
  name: string;
  orderIndex: number;
  prescriptions: PrescriptionContext[];
}

export interface SessionContext {
  session: SessionRecord;
  block: TrainingBlockRecord;
  workoutDay: WorkoutDayContext;
  program: { id: string; name: string };
}

// ---- Rotation, day picking and auto-close (ARCH-056, ARCH-057) -----------

/**
 * ARCH-057: an IN_PROGRESS Session with no activity for this long is stale.
 * Activity is the latest logged set's completedAt, else startedAt. A product
 * boundary, not a measurement: a normal session fits well inside it; a
 * session "continued" the next day does not.
 */
export const STALE_SESSION_AFTER_MS = 6 * 60 * 60 * 1000;

/** When an IN_PROGRESS Session last saw activity, or null if it never started. */
export function lastActivityAt(
  session: Pick<SessionRecord, "startedAt">,
  records: readonly Pick<PerformanceRecordRecord, "completedAt">[],
): Date | null {
  let latest: Date | null = session.startedAt;
  for (const r of records) {
    if (latest === null || r.completedAt > latest) latest = r.completedAt;
  }
  return latest;
}

/** ARCH-057 staleness. Only IN_PROGRESS Sessions can be stale. */
export async function isStaleInProgress(
  session: SessionRecord,
  now: Date,
): Promise<boolean> {
  if (session.status !== "IN_PROGRESS") return false;
  const records = await listPerformanceRecordsForSession(session.id);
  const activity = lastActivityAt(session, records);
  return activity !== null && now.getTime() - activity.getTime() >= STALE_SESSION_AFTER_MS;
}

/** A status write planned before the transaction that performs it. */
interface ClosePlan {
  sessionId: string;
  status: "COMPLETED" | "SKIPPED";
  completedAt?: Date;
}

/**
 * ARCH-057 auto-close: COMPLETED at the last logged set's time when the
 * Session has records, otherwise SKIPPED at `now`.
 */
async function planAutoClose(session: SessionRecord, now: Date): Promise<ClosePlan> {
  const records = await listPerformanceRecordsForSession(session.id);
  if (records.length === 0) {
    return { sessionId: session.id, status: "SKIPPED", completedAt: now };
  }
  let last = records[0]!.completedAt;
  for (const r of records) if (r.completedAt > last) last = r.completedAt;
  return { sessionId: session.id, status: "COMPLETED", completedAt: last };
}

export interface RotationDay {
  id: string;
  name: string;
}

/**
 * Read-only view of where a Program's rotation stands. Shared by the start
 * paths (which act on it) and by /train and /app (which only display it), so
 * what the user is shown is what a start will do.
 */
export interface RotationState {
  block: TrainingBlockRecord;
  days: RotationDay[];
  /** The block's PLANNED or non-stale IN_PROGRESS Session: the one a start resumes. */
  pending: SessionRecord | null;
  /** A stale IN_PROGRESS Session in this block that the next start will auto-close. */
  staleInBlock: SessionRecord | null;
  /** Highest-sequence Session in the block (pending, stale, or closed). */
  latest: SessionRecord | null;
  /** Index into `days` of the day a plain "Start training" would train. */
  suggestedIndex: number;
}

export async function resolveRotation(
  userId: string,
  programId: string,
  now: Date,
): Promise<RotationState> {
  await loadOwnedProgramOrThrow(userId, programId);

  const block = await findActiveTrainingBlockForProgram(programId);
  if (block === null) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "No active training block. Activate a committed version before training.",
    });
  }

  const version = await findVersionWithStructure(block.programVersionId);
  if (!version || version.workoutDays.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The active version has no workout days to train.",
    });
  }
  const days = version.workoutDays.map((d) => ({ id: d.id, name: d.name }));
  const indexOf = (dayId: string) => days.findIndex((d) => d.id === dayId);

  const [active, latest] = await Promise.all([
    findActiveSessionForBlock(block.id),
    findLatestSessionForBlock(block.id),
  ]);

  let pending: SessionRecord | null = active;
  let staleInBlock: SessionRecord | null = null;
  if (active !== null && (await isStaleInProgress(active, now))) {
    staleInBlock = active;
    pending = null;
  }

  // Rotation: the pending Session's day, else the day after the latest
  // Session's day (wrapping), else the first day.
  let suggestedIndex = 0;
  if (pending !== null) {
    suggestedIndex = Math.max(0, indexOf(pending.workoutDayId));
  } else if (latest !== null) {
    const position = indexOf(latest.workoutDayId);
    if (position >= 0) suggestedIndex = (position + 1) % days.length;
  }

  return { block, days, pending, staleInBlock, latest, suggestedIndex };
}

/**
 * The one start path behind getOrCreateNext (picks the suggested day) and
 * startSpecificDay (picks any day).
 *
 *   1. ARCH-057: IN_PROGRESS Sessions in the user's other blocks, and a stale
 *      one in this block, are auto-closed.
 *   2. Picking the suggested day resumes the pending Session if there is one.
 *   3. ARCH-056: otherwise every day from the suggested day up to (not
 *      including) the picked day, in rotation order and wrapping, is recorded
 *      as SKIPPED: the pending Session if it covers that day (PLANNED becomes
 *      SKIPPED; IN_PROGRESS is auto-closed), else a new SKIPPED Session.
 *   4. A PLANNED Session is created for the picked day, so the rotation
 *      advances from it.
 *
 * All writes happen in one transaction; the reads that plan them happen
 * first.
 */
async function startDay(
  userId: string,
  programId: string,
  pickDayId: string | null,
): Promise<SessionRecord> {
  const now = new Date();
  const rotation = await resolveRotation(userId, programId, now);
  const { block, days, pending, staleInBlock, latest, suggestedIndex } = rotation;

  const pickedIndex =
    pickDayId === null ? suggestedIndex : days.findIndex((d) => d.id === pickDayId);
  if (pickedIndex < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That workout day is not part of the active version.",
    });
  }

  const closes: ClosePlan[] = [];
  for (const other of await listInProgressSessionsForUser(userId)) {
    if (other.trainingBlockId !== block.id) closes.push(await planAutoClose(other, now));
  }
  if (staleInBlock !== null) closes.push(await planAutoClose(staleInBlock, now));

  if (pickedIndex === suggestedIndex && pending !== null) {
    if (closes.length > 0) await applyCloses(closes);
    return pending;
  }

  const skippedDayIds: string[] = [];
  if (pickedIndex !== suggestedIndex) {
    let i = suggestedIndex;
    if (pending !== null) {
      closes.push(
        pending.status === "IN_PROGRESS"
          ? await planAutoClose(pending, now)
          : { sessionId: pending.id, status: "SKIPPED" },
      );
      i = (i + 1) % days.length;
    }
    while (i !== pickedIndex) {
      skippedDayIds.push(days[i]!.id);
      i = (i + 1) % days.length;
    }
  }

  const pickedDay = days[pickedIndex]!;
  let sequenceIndex = (latest?.sequenceIndex ?? -1) + 1;

  return prisma.$transaction(async (tx) => {
    for (const c of closes) {
      await updateSessionStatusInTx(tx, c.sessionId, {
        status: c.status,
        ...(c.completedAt ? { completedAt: c.completedAt } : {}),
      });
    }
    for (const dayId of skippedDayIds) {
      await createSessionInTx(tx, {
        trainingBlockId: block.id,
        workoutDayId: dayId,
        sequenceIndex: sequenceIndex++,
        status: "SKIPPED",
      });
    }
    return createSessionInTx(tx, {
      trainingBlockId: block.id,
      workoutDayId: pickedDay.id,
      sequenceIndex,
    });
  }, TRANSACTION_OPTIONS);
}

async function applyCloses(closes: readonly ClosePlan[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const c of closes) {
      await updateSessionStatusInTx(tx, c.sessionId, {
        status: c.status,
        ...(c.completedAt ? { completedAt: c.completedAt } : {}),
      });
    }
  }, TRANSACTION_OPTIONS);
}

/**
 * Returns the pending or in-progress Session for a Program, or creates the
 * next one in rotation.
 *
 * Rotation:
 *   - If a Session is already PLANNED or IN_PROGRESS (and not stale, ARCH-057)
 *     in the block, return it unchanged (do not create a duplicate).
 *   - Otherwise, find the day position of the latest Session's workoutDayId
 *     in the version's ordered WorkoutDays, advance one position, and create
 *     a new PLANNED Session against that day. If there is no latest Session,
 *     start at position 0. The rotation wraps.
 *   - ARCH-057: superseded IN_PROGRESS Sessions are auto-closed first.
 *
 * Errors:
 *   - NOT_FOUND            — caller does not own the Program
 *   - PRECONDITION_FAILED  — the Program has no active TrainingBlock
 *   - PRECONDITION_FAILED  — the active version has zero WorkoutDays
 */
export async function getOrCreateNext(
  userId: string,
  programId: string,
): Promise<SessionRecord> {
  return startDay(userId, programId, null);
}

/**
 * ARCH-056: start a chosen WorkoutDay instead of the rotation's suggestion.
 * Passed-over days are recorded as SKIPPED; the rotation advances from the
 * picked day. Picking the suggested day behaves exactly like getOrCreateNext.
 *
 * Errors: as getOrCreateNext, plus BAD_REQUEST for a day outside the active
 * version.
 */
export async function startSpecificDay(
  userId: string,
  programId: string,
  workoutDayId: string,
): Promise<SessionRecord> {
  return startDay(userId, programId, workoutDayId);
}

export interface TrainingOptions {
  programId: string;
  days: RotationDay[];
  suggestedDayId: string;
  /** The Session a plain start resumes, when there is one. */
  pending: { sessionId: string; status: SessionStatus; workoutDayId: string } | null;
}

/** Read-only: what /train's day picker shows. Never creates or closes anything. */
export async function getTrainingOptions(
  userId: string,
  programId: string,
): Promise<TrainingOptions> {
  const { days, pending, suggestedIndex } = await resolveRotation(
    userId,
    programId,
    new Date(),
  );
  return {
    programId,
    days,
    suggestedDayId: days[suggestedIndex]!.id,
    pending:
      pending === null
        ? null
        : { sessionId: pending.id, status: pending.status, workoutDayId: pending.workoutDayId },
  };
}

/** The most recent previous performance of one exercise, for a display-only hint. */
export interface LastTimeHint {
  exerciseId: string;
  /** Top set of the most recent completed Session that included the exercise. */
  load: number | null;
  reps: number | null;
  unit: "kg" | "lb";
  sessionCompletedAt: Date;
}

/**
 * "Last: 60 kg × 10 (Mar 15)". For each exercise in the Session's workout
 * day, the top set (heaviest load, then most reps) of the most recent
 * COMPLETED Session that included it, in any block. Display-only: the
 * Phase 6 no-prefill rule stands, so nothing here fills an input.
 */
export async function getLastTimeHints(
  userId: string,
  sessionId: string,
): Promise<LastTimeHint[]> {
  const context = await getSessionContext(userId, sessionId);
  const exerciseIds = [...new Set(context.workoutDay.prescriptions.map((p) => p.exerciseId))];
  const rows = await listCompletedPerformancesForExercises(userId, exerciseIds, sessionId);

  // Rows arrive newest Session first; keep only each exercise's newest Session.
  const latestSessionOf = new Map<string, string>();
  const byExercise = new Map<string, ExercisePerformanceRecord[]>();
  for (const row of rows) {
    if (row.sessionCompletedAt === null) continue;
    const latestSession = latestSessionOf.get(row.exerciseId);
    if (latestSession === undefined) latestSessionOf.set(row.exerciseId, row.sessionId);
    else if (latestSession !== row.sessionId) continue;
    byExercise.set(row.exerciseId, [...(byExercise.get(row.exerciseId) ?? []), row]);
  }

  const hints: LastTimeHint[] = [];
  for (const [exerciseId, sets] of byExercise) {
    const top = sets.reduce((best, r) => {
      const bl = best.actualLoad ?? -1;
      const rl = r.actualLoad ?? -1;
      if (rl !== bl) return rl > bl ? r : best;
      return (r.actualReps ?? -1) > (best.actualReps ?? -1) ? r : best;
    });
    const scheme = top.loadScheme as { type?: string; unit?: string } | null;
    hints.push({
      exerciseId,
      load: top.actualLoad,
      reps: top.actualReps,
      unit: scheme?.type === "FIXED_WEIGHT" && scheme.unit === "lb" ? "lb" : "kg",
      sessionCompletedAt: top.sessionCompletedAt!,
    });
  }
  return hints;
}

/**
 * Loads a Session plus its structural context (block, workout day,
 * prescriptions, program) for the session-detail UI. Returns everything the
 * /train/session/[id] page needs in one call, so the RSC page does not
 * re-fetch the version and program separately.
 */
export async function getSessionContext(
  userId: string,
  sessionId: string,
): Promise<SessionContext> {
  const session = await loadOwnedSessionOrThrow(userId, sessionId);

  const block = await findTrainingBlockById(session.trainingBlockId);
  if (!block) {
    throw new Error(
      `Session ${sessionId} references missing TrainingBlock ${session.trainingBlockId}`,
    );
  }

  const version = await findVersionWithStructure(block.programVersionId);
  if (!version) {
    throw new Error(
      `TrainingBlock ${block.id} references missing ProgramVersion ${block.programVersionId}`,
    );
  }

  const day = version.workoutDays.find((d) => d.id === session.workoutDayId);
  if (!day) {
    throw new Error(
      `Session ${sessionId} references WorkoutDay ${session.workoutDayId} that is not in its version's structure.`,
    );
  }

  const program = await findProgramById(version.programId);
  if (!program) {
    throw new Error(
      `ProgramVersion ${version.id} references missing Program ${version.programId}`,
    );
  }

  // Phase 7 fix: previously returned the exercise cuid as exerciseName — the
  // session UI displayed a cuid where a human-readable name belongs. Load
  // the reference data once per call and resolve names below.
  const allExercises = await listExercises();
  const nameById = new Map<string, string>();
  for (const e of allExercises) nameById.set(e.id, e.name);

  const workoutDay: WorkoutDayContext = {
    id: day.id,
    name: day.name,
    orderIndex: day.orderIndex,
    prescriptions: day.prescriptions.map((p) => ({
      id: p.id,
      orderIndex: p.orderIndex,
      exerciseId: p.exerciseId,
      // Phase 7 fix: was `p.exerciseId` — a cuid leaked to the UI.
      exerciseName: nameById.get(p.exerciseId) ?? p.exerciseId,
      targetSets: p.targetSets,
      targetRepsLow: p.targetRepsLow,
      targetRepsHigh: p.targetRepsHigh,
      targetRpe: p.targetRpe === null ? null : Number(p.targetRpe),
      loadScheme: p.loadScheme,
    })),
  };

  return {
    session,
    block,
    workoutDay,
    program: { id: program.id, name: program.name },
  };
}

/**
 * The three allowed Session status transitions, keyed by from-status.
 * A transition not listed here is rejected with PRECONDITION_FAILED.
 */
const ALLOWED_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  PLANNED: ["IN_PROGRESS", "SKIPPED"],
  IN_PROGRESS: ["COMPLETED", "SKIPPED"],
  COMPLETED: [],
  SKIPPED: [],
};

function assertTransitionAllowed(
  current: SessionStatus,
  next: SessionStatus,
): void {
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Cannot transition a ${current} session to ${next}.`,
    });
  }
}

export async function markStarted(
  userId: string,
  sessionId: string,
): Promise<SessionRecord> {
  const session = await loadOwnedSessionOrThrow(userId, sessionId);
  assertTransitionAllowed(session.status, "IN_PROGRESS");
  return updateSessionStatus(session.id, {
    status: "IN_PROGRESS",
    startedAt: new Date(),
  });
}

export async function markCompleted(
  userId: string,
  sessionId: string,
): Promise<SessionRecord> {
  const session = await loadOwnedSessionOrThrow(userId, sessionId);
  assertTransitionAllowed(session.status, "COMPLETED");
  return updateSessionStatus(session.id, {
    status: "COMPLETED",
    completedAt: new Date(),
  });
}

export async function markSkipped(
  userId: string,
  sessionId: string,
): Promise<SessionRecord> {
  const session = await loadOwnedSessionOrThrow(userId, sessionId);
  assertTransitionAllowed(session.status, "SKIPPED");
  // No dedicated timestamp column for skip. The schema's startedAt /
  // completedAt are for the other two transitions; a SKIPPED transition
  // changes only the status.
  return updateSessionStatus(session.id, { status: "SKIPPED" });
}

// === PHASE 7 ADDITION ===
/**
 * Read-only sibling of getOrCreateNext. Returns the current PLANNED or
 * IN_PROGRESS Session for a block, or null. NEVER creates a Session.
 *
 * The /app landing screen's identity summary calls findActiveSessionForBlock
 * directly; this wrapper exists for callers that want to gate the read on
 * ownership of the block.
 */
export async function getCurrentSession(
  userId: string,
  trainingBlockId: string,
): Promise<SessionRecord | null> {
  await loadOwnedTrainingBlockOrThrow(userId, trainingBlockId);
  return findActiveSessionForBlock(trainingBlockId);
}