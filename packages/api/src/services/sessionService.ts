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
  countCompletedInBlockThrough,
  createSessionInTx,
  deleteSessionIfEmptyInTx,
  findActiveSessionForBlock,
  findActiveTrainingBlockForProgram,
  findProgramOfBlock,
  findTrainingBlockById,
  findVersionWithStructure,
  findWorkoutDayRow,
  findLatestCompletedSessionForUser,
  listCompletedPerformancesForDay,
  listExercises,
  listObservationsForSession,
  listPrescriptionRowsForDay,
  type ExerciseRecord,
  type ObservationRecord,
  listInProgressSessionsForUser,
  listPerformanceRecordsForSession,
  listSessionsForBlock,
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
  computeTargetsForPrescriptions,
  wholeDaysSince,
  type PrescriptionTarget,
} from "./targetsService";
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
  /** ARCH-061 */
  isRestDay: boolean;
  orderIndex: number;
  prescriptions: PrescriptionContext[];
}

export interface SessionContext {
  session: SessionRecord;
  /** COMPLETED Sessions in the block up to and including this one ("Session 8 (4 completed)"). */
  completedInBlockThrough: number;
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

/** ARCH-057: whether activity at `activity` is old enough to be stale at `now`. */
export function isStaleAt(activity: Date | null, now: Date): boolean {
  return activity !== null && now.getTime() - activity.getTime() >= STALE_SESSION_AFTER_MS;
}

/** ARCH-057 staleness. Only IN_PROGRESS Sessions can be stale. */
export async function isStaleInProgress(
  session: SessionRecord,
  now: Date,
): Promise<boolean> {
  if (session.status !== "IN_PROGRESS") return false;
  const records = await listPerformanceRecordsForSession(session.id);
  const activity = lastActivityAt(session, records);
  return isStaleAt(activity, now);
}

/**
 * A write planned before the transaction that performs it. DELETE is the
 * ARCH-057 addendum's "nothing happened" case; it falls back to SKIPPED if the
 * Session turns out to have records or a note (deleteSessionIfEmptyInTx).
 */
interface ClosePlan {
  session: SessionRecord;
  action: "COMPLETED" | "SKIPPED" | "DELETE";
  completedAt?: Date;
}

/**
 * ARCH-057 auto-close: COMPLETED at the last logged set's time when the
 * Session has records; otherwise deleted (addendum: no training decision was
 * made, so the rotation must not advance).
 */
async function planAutoClose(session: SessionRecord, now: Date): Promise<ClosePlan> {
  const records = await listPerformanceRecordsForSession(session.id);
  if (records.length === 0) {
    return { session, action: "DELETE", completedAt: now };
  }
  let last = records[0]!.completedAt;
  for (const r of records) if (r.completedAt > last) last = r.completedAt;
  return { session, action: "COMPLETED", completedAt: last };
}

/**
 * ARCH-056 addendum: the rotation pointer, replayed from a block's closed
 * Sessions (day indices, in sequence order). A Session on the pointer's day or
 * ahead of it moves the pointer past it; one behind the pointer is an extra
 * session and leaves it alone. Returns the index of the day trained next.
 */
export function replayRotationPointer(
  dayCount: number,
  closedDayIndices: readonly number[],
): number {
  let pointer = 0;
  for (const d of closedDayIndices) {
    if (d < 0 || d >= dayCount) continue;
    if (d >= pointer) pointer = (d + 1) % dayCount;
  }
  return pointer;
}

export interface RotationDay {
  id: string;
  name: string;
  /** ARCH-061: shown as a rest day in the picker; skipped through, not trained. */
  isRestDay: boolean;
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
  /** Whether staleInBlock has logged sets (it will close COMPLETED) or not (it will be deleted). */
  staleHasRecords: boolean;
  /** Every Session in the block, in sequence order. */
  sessions: SessionRecord[];
  /** ARCH-056 addendum: the day the rotation trains next, ignoring the pending Session. */
  pointerIndex: number;
  /** Index into `days` of the day a plain "Start training" trains: the pending Session's, else the pointer. */
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
  const days = version.workoutDays.map((d) => ({ id: d.id, name: d.name, isRestDay: d.isRestDay }));
  const indexOf = (dayId: string) => days.findIndex((d) => d.id === dayId);

  const [active, sessions] = await Promise.all([
    findActiveSessionForBlock(block.id),
    listSessionsForBlock(block.id),
  ]);

  let pending: SessionRecord | null = active;
  let staleInBlock: SessionRecord | null = null;
  let staleHasRecords = false;
  if (active !== null && (await isStaleInProgress(active, now))) {
    staleInBlock = active;
    staleHasRecords = (await listPerformanceRecordsForSession(active.id)).length > 0;
    pending = null;
  }

  // Closed history, plus a stale session that will close COMPLETED.
  const closed = sessions
    .filter(
      (s) =>
        s.status === "COMPLETED" ||
        s.status === "SKIPPED" ||
        (s.id === staleInBlock?.id && staleHasRecords),
    )
    .map((s) => indexOf(s.workoutDayId));
  const pointerIndex = replayRotationPointer(days.length, closed);
  const suggestedIndex =
    pending !== null ? Math.max(0, indexOf(pending.workoutDayId)) : pointerIndex;

  return {
    block,
    days,
    pending,
    staleInBlock,
    staleHasRecords,
    sessions,
    pointerIndex,
    suggestedIndex,
  };
}

/** A Session ARCH-057 closed as COMPLETED during a start, for the "auto-saved" banner. */
export interface AutoSavedSession {
  sessionId: string;
  completedAt: Date;
}

export type StartedSession = SessionRecord & { autoSaved: AutoSavedSession[] };

/**
 * The one start path behind getOrCreateNext (picks the suggested day) and
 * startSpecificDay (picks any day).
 *
 *   1. ARCH-057: IN_PROGRESS Sessions in the user's other blocks, and a stale
 *      one in this block, are auto-closed (COMPLETED with records, else
 *      deleted).
 *   2. Picking the pending Session's day resumes it.
 *   3. Otherwise the pending Session is superseded: on the pointer's day with
 *      nothing logged and an AHEAD pick, it is the day being skipped
 *      (SKIPPED); otherwise it is auto-closed like a stale one.
 *   4. ARCH-056 addendum: only an AHEAD pick cascades. Days from the pointer
 *      up to (not including) the picked day become SKIPPED Sessions. A pick
 *      BEHIND the pointer is an extra session; the rotation is untouched.
 *   5. A PLANNED Session is created for the picked day.
 *
 * All writes happen in one transaction; the reads that plan them happen
 * first.
 */
async function startDay(
  userId: string,
  programId: string,
  pickDayId: string | null,
): Promise<StartedSession> {
  const now = new Date();
  const rotation = await resolveRotation(userId, programId, now);
  const { block, days, pending, staleInBlock, sessions, suggestedIndex } = rotation;
  const indexOf = (dayId: string) => days.findIndex((d) => d.id === dayId);

  const pickedIndex = pickDayId === null ? suggestedIndex : indexOf(pickDayId);
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

  if (pending !== null && indexOf(pending.workoutDayId) === pickedIndex) {
    const autoSaved = await applyCloses(closes);
    return { ...pending, autoSaved };
  }

  // Closed history as it will stand after the planned closes.
  const closedIndices = (extra: ClosePlan[]) => {
    const closing = new Map(extra.map((c) => [c.session.id, c.action]));
    return sessions
      .filter((s) => {
        const action = closing.get(s.id);
        if (action !== undefined) return action !== "DELETE";
        return s.status === "COMPLETED" || s.status === "SKIPPED";
      })
      .map((s) => indexOf(s.workoutDayId));
  };

  if (pending !== null) {
    const pendingIndex = indexOf(pending.workoutDayId);
    const pointerBefore = replayRotationPointer(days.length, closedIndices(closes));
    const records = await listPerformanceRecordsForSession(pending.id);
    if (
      pending.status === "PLANNED" &&
      records.length === 0 &&
      pendingIndex === pointerBefore &&
      pickedIndex > pointerBefore
    ) {
      closes.push({ session: pending, action: "SKIPPED" });
    } else {
      closes.push(await planAutoClose(pending, now));
    }
  }

  const pointer = replayRotationPointer(days.length, closedIndices(closes));
  const skippedDayIds: string[] = [];
  if (pickedIndex > pointer) {
    for (let i = pointer; i < pickedIndex; i++) skippedDayIds.push(days[i]!.id);
  }

  const deleted = new Set(closes.filter((c) => c.action === "DELETE").map((c) => c.session.id));
  let sequenceIndex =
    sessions.reduce((max, s) => (deleted.has(s.id) ? max : Math.max(max, s.sequenceIndex)), -1) + 1;
  const pickedDay = days[pickedIndex]!;

  return prisma.$transaction(async (tx) => {
    const autoSaved = await applyClosesInTx(tx, closes);
    for (const dayId of skippedDayIds) {
      await createSessionInTx(tx, {
        trainingBlockId: block.id,
        workoutDayId: dayId,
        sequenceIndex: sequenceIndex++,
        status: "SKIPPED",
      });
    }
    const created = await createSessionInTx(tx, {
      trainingBlockId: block.id,
      workoutDayId: pickedDay.id,
      sequenceIndex,
    });
    return { ...created, autoSaved };
  }, TRANSACTION_OPTIONS);
}

/** The db package's transaction client, without naming a Prisma type here (ARCH-005). */
type Tx = Parameters<typeof updateSessionStatusInTx>[0];

async function applyClosesInTx(
  tx: Tx,
  closes: readonly ClosePlan[],
): Promise<AutoSavedSession[]> {
  const autoSaved: AutoSavedSession[] = [];
  for (const c of closes) {
    if (c.action === "DELETE" && (await deleteSessionIfEmptyInTx(tx, c.session.id))) continue;
    const status = c.action === "COMPLETED" ? "COMPLETED" : "SKIPPED";
    await updateSessionStatusInTx(tx, c.session.id, {
      status,
      ...(c.completedAt ? { completedAt: c.completedAt } : {}),
    });
    if (status === "COMPLETED" && c.completedAt) {
      autoSaved.push({ sessionId: c.session.id, completedAt: c.completedAt });
    }
  }
  return autoSaved;
}

async function applyCloses(closes: readonly ClosePlan[]): Promise<AutoSavedSession[]> {
  if (closes.length === 0) return [];
  return prisma.$transaction((tx) => applyClosesInTx(tx, closes), TRANSACTION_OPTIONS);
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
): Promise<StartedSession> {
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
): Promise<StartedSession> {
  return startDay(userId, programId, workoutDayId);
}

export interface TrainingOptions {
  programId: string;
  days: RotationDay[];
  suggestedDayId: string;
  /** ARCH-056 addendum: the day the rotation trains next; picks ahead of it skip days, picks behind are extras. */
  pointerDayId: string;
  /** The Session a plain start resumes, when there is one. */
  pending: {
    sessionId: string;
    status: SessionStatus;
    workoutDayId: string;
    hasRecords: boolean;
  } | null;
}

/** Read-only: what /train's day picker shows. Never creates or closes anything. */
export async function getTrainingOptions(
  userId: string,
  programId: string,
): Promise<TrainingOptions> {
  const { days, pending, suggestedIndex, pointerIndex } = await resolveRotation(
    userId,
    programId,
    new Date(),
  );
  return {
    programId,
    days,
    suggestedDayId: days[suggestedIndex]!.id,
    pointerDayId: days[pointerIndex]!.id,
    pending:
      pending === null
        ? null
        : {
            sessionId: pending.id,
            status: pending.status,
            workoutDayId: pending.workoutDayId,
            hasRecords: (await listPerformanceRecordsForSession(pending.id)).length > 0,
          },
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
 * The hints for a session's exercises from the user's earlier COMPLETED sets,
 * newest Session first (the order listCompletedPerformancesForDay returns).
 * Pure: shared by the hints procedure and the session page's single read.
 */
export function lastTimeHintsFromRows(
  rows: readonly ExercisePerformanceRecord[],
): LastTimeHint[] {
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
 * "Last: 60 kg × 10 (Mar 15)". For each exercise in the Session's workout
 * day, the top set (heaviest load, then most reps) of the most recent
 * COMPLETED Session that included it, in any block. Display-only: the
 * Phase 6 no-prefill rule stands, so nothing here fills an input.
 */
export async function getLastTimeHints(
  userId: string,
  sessionId: string,
): Promise<LastTimeHint[]> {
  const session = await loadOwnedSessionOrThrow(userId, sessionId);
  const rows = await listCompletedPerformancesForDay(userId, session.workoutDayId, sessionId);
  return lastTimeHintsFromRows(rows);
}

/**
 * The Session plus everything that hangs off its own ids, read in two steps:
 * the owned Session (one statement), then block, workout day, prescriptions,
 * program and position in the block side by side. It used to be seven reads in
 * a row, and was run twice per page.
 */
async function loadContextFor(
  session: SessionRecord,
  exercises: readonly ExerciseRecord[],
): Promise<SessionContext> {
  const [block, day, prescriptions, program, completedInBlockThrough] = await Promise.all([
    findTrainingBlockById(session.trainingBlockId),
    findWorkoutDayRow(session.workoutDayId),
    listPrescriptionRowsForDay(session.workoutDayId),
    findProgramOfBlock(session.trainingBlockId),
    countCompletedInBlockThrough(session.trainingBlockId, session.sequenceIndex),
  ]);
  if (!block) {
    throw new Error(
      `Session ${session.id} references missing TrainingBlock ${session.trainingBlockId}`,
    );
  }
  if (!day) {
    throw new Error(
      `Session ${session.id} references WorkoutDay ${session.workoutDayId} that does not exist.`,
    );
  }
  if (!program) {
    throw new Error(`TrainingBlock ${block.id} has no Program through its version.`);
  }

  // Phase 7 fix: the exercise id used to leak to the UI as the display name.
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));
  const workoutDay: WorkoutDayContext = {
    id: day.id,
    name: day.name,
    isRestDay: day.isRestDay,
    orderIndex: day.orderIndex,
    prescriptions: prescriptions.map((p) => ({
      id: p.id,
      orderIndex: p.orderIndex,
      exerciseId: p.exerciseId,
      exerciseName: nameById.get(p.exerciseId) ?? p.exerciseId,
      targetSets: p.targetSets,
      targetRepsLow: p.targetRepsLow,
      targetRepsHigh: p.targetRepsHigh,
      targetRpe: p.targetRpe,
      loadScheme: p.loadScheme,
    })),
  };

  return {
    session,
    completedInBlockThrough,
    block,
    workoutDay,
    program: { id: program.id, name: program.name },
  };
}

/** The context of a Session the caller has already proven they own (one read fewer). */
export async function getSessionContextOf(session: SessionRecord): Promise<SessionContext> {
  return loadContextFor(session, await listExercises());
}

/**
 * Loads a Session plus its structural context (block, workout day,
 * prescriptions, program) for the session-detail UI.
 */
export async function getSessionContext(
  userId: string,
  sessionId: string,
): Promise<SessionContext> {
  const [session, exercises] = await Promise.all([
    loadOwnedSessionOrThrow(userId, sessionId),
    listExercises(),
  ]);
  return loadContextFor(session, exercises);
}

/** Everything the session page renders, from one call. */
export interface SessionPageData {
  context: SessionContext;
  exercises: ExerciseRecord[];
  records: PerformanceRecordRecord[];
  observations: ObservationRecord[];
  lastTimeHints: LastTimeHint[];
  /** ARCH-062: what to lift, per prescription, from the lifter's own earlier sets. */
  targets: PrescriptionTarget[];
}

/**
 * The session page's whole read in two steps (down from a chain of fifteen
 * reads): the owned Session, then the context, the logged sets, the notes and
 * the exercise history all at once. Ownership is proven by the first step, so
 * the second reads by id without re-checking.
 */
export async function getSessionPage(
  userId: string,
  sessionId: string,
): Promise<SessionPageData> {
  const [session, exercises] = await Promise.all([
    loadOwnedSessionOrThrow(userId, sessionId),
    listExercises(),
  ]);
  const [context, records, observations, history, lastCompleted] = await Promise.all([
    loadContextFor(session, exercises),
    listPerformanceRecordsForSession(sessionId),
    listObservationsForSession(sessionId),
    listCompletedPerformancesForDay(userId, session.workoutDayId, sessionId),
    findLatestCompletedSessionForUser(userId),
  ]);
  const targets = computeTargetsForPrescriptions({
    prescriptions: context.workoutDay.prescriptions,
    equipmentByExerciseId: new Map(exercises.map((e) => [e.id, e.equipment])),
    history,
    daysSinceLastTraining: wholeDaysSince(lastCompleted?.completedAt ?? null, new Date()),
  });
  return {
    context,
    exercises,
    records,
    observations,
    lastTimeHints: lastTimeHintsFromRows(history),
    targets,
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