// packages/api/src/services/performanceService.ts
//
// Orchestration for PerformanceRecord (logged sets).
//
// HONESTY REQUIREMENT (08-training-execution-and-evidence.md): a logged set
// is stored exactly as the user entered it. This service does NOT reconcile
// actualReps / actualLoad / actualRpe against the prescription, does not
// clamp them to plausible ranges, and does not reject a deviation. A
// PerformanceRecord describes what was EXECUTED; ExercisePrescription
// describes what was PLANNED; the gap is exactly what Review (Phase 7)
// exists to surface.
//
// What IS validated: that the exercisePrescriptionId belongs to the
// WorkoutDay the Session was generated from. A prescription from a different
// workout day is a client-side bug (the UI only ever lists the current
// session's prescriptions) and is rejected with BAD_REQUEST.
//
// Decimal handling: the repository converts Prisma.Decimal → number at the
// packages/db boundary, so `actualLoad` / `actualRpe` here are plain
// `number | null`. Input side accepts number | null.

import { TRPCError } from "@trpc/server";
import {
  countPrescriptionsOfOwnedSession,
  createPerformanceRecord,
  createPerformanceRecordsBatch,
  deletePerformanceRecord,
  findOwnedPerformanceRecord,
  isPrimaryKeyConflict,
  listOwnedPerformanceRecordsByIds,
  listPerformanceRecordsForSession,
  updatePerformanceRecord,
  type PerformanceRecordRecord,
} from "@training/db";
import { loadOwnedSessionOrThrow } from "./loadOwnedExecution";

/**
 * Proves, in one statement, that `sessionId` is the caller's and that every
 * prescription belongs to its workout day. On success that is the whole check
 * (a logged set is this plus one insert: two database calls, down from five).
 * Only when it fails do we spend more calls working out why, so the error the
 * caller sees is unchanged: NOT_FOUND for a Session that is missing or not
 * theirs (ARCH-040), BAD_REQUEST for a prescription from another day.
 */
async function assertPrescriptionsInOwnedSession(
  userId: string,
  sessionId: string,
  prescriptionIds: readonly string[],
  badRequestMessage: string,
): Promise<void> {
  const distinct = [...new Set(prescriptionIds)];
  const matched = await countPrescriptionsOfOwnedSession(userId, sessionId, distinct);
  if (matched === distinct.length) return;
  await loadOwnedSessionOrThrow(userId, sessionId);
  throw new TRPCError({ code: "BAD_REQUEST", message: badRequestMessage });
}

/**
 * A client may stamp a set with the time it was tapped, so a set that waited
 * out a bad signal, or an undone delete, keeps its real place in the session.
 * Only a plausible stamp is believed: not in the future (5 minutes of clock
 * skew allowed) and not older than a session can be (the 6 h staleness window
 * and some slack). Anything else is the server's now.
 */
const COMPLETED_AT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const COMPLETED_AT_SKEW_MS = 5 * 60 * 1000;

function believableCompletedAt(claimed: Date | undefined, now: Date): Date | undefined {
  if (claimed === undefined) return undefined;
  const t = claimed.getTime();
  if (Number.isNaN(t)) return undefined;
  if (t > now.getTime() + COMPLETED_AT_SKEW_MS) return undefined;
  if (t < now.getTime() - COMPLETED_AT_MAX_AGE_MS) return undefined;
  return new Date(Math.min(t, now.getTime()));
}

export interface LogSetInput {
  /** Client-chosen id: a retry of the same tap is the same set, never a second one. */
  id?: string;
  exercisePrescriptionId: string;
  setIndex: number;
  actualReps?: number | null;
  actualLoad?: number | null;
  actualRpe?: number | null;
  completedAt?: Date;
}

export async function logSet(
  userId: string,
  sessionId: string,
  input: LogSetInput,
): Promise<PerformanceRecordRecord> {
  await assertPrescriptionsInOwnedSession(
    userId,
    sessionId,
    [input.exercisePrescriptionId],
    "The prescription is not part of this session's workout day.",
  );

  const completedAt = believableCompletedAt(input.completedAt, new Date());
  try {
    return await createPerformanceRecord({
      ...(input.id ? { id: input.id } : {}),
      sessionId,
      exercisePrescriptionId: input.exercisePrescriptionId,
      setIndex: input.setIndex,
      actualReps: input.actualReps ?? null,
      actualLoad: input.actualLoad ?? null,
      actualRpe: input.actualRpe ?? null,
      ...(completedAt ? { completedAt } : {}),
    });
  } catch (err) {
    // A retry whose first attempt landed: hand back that set. Another user's
    // id (or another Session's) is not ours to return.
    if (input.id && isPrimaryKeyConflict(err)) {
      const existing = await findOwnedPerformanceRecord(userId, sessionId, input.id);
      if (existing) return existing;
      throw new TRPCError({ code: "CONFLICT", message: "That set id is already in use." });
    }
    throw err;
  }
}

export interface LogBatchEntry {
  id?: string;
  exercisePrescriptionId: string;
  setIndex: number;
  actualReps?: number | null;
  actualLoad?: number | null;
  actualRpe?: number | null;
  completedAt?: Date;
}

export interface LogBatchInput {
  entries: LogBatchEntry[];
}

/**
 * Batch-log N sets in one transaction. Every entry's prescription must
 * belong to the session's workout day; the whole batch is rejected if any
 * entry fails that check (before opening the transaction, so no partial
 * write occurs).
 *
 * Empty entries array returns [] — no degenerate transaction.
 */
export async function logBatch(
  userId: string,
  sessionId: string,
  input: LogBatchInput,
): Promise<PerformanceRecordRecord[]> {
  if (input.entries.length === 0) return [];

  await assertPrescriptionsInOwnedSession(
    userId,
    sessionId,
    input.entries.map((e) => e.exercisePrescriptionId),
    "A prescription in the batch is not part of this session's workout day.",
  );

  const now = new Date();
  const ids = input.entries.flatMap((e) => (e.id ? [e.id] : []));
  try {
    return await createPerformanceRecordsBatch(
      input.entries.map((e) => {
        const completedAt = believableCompletedAt(e.completedAt, now);
        return {
          ...(e.id ? { id: e.id } : {}),
          sessionId,
          exercisePrescriptionId: e.exercisePrescriptionId,
          setIndex: e.setIndex,
          actualReps: e.actualReps ?? null,
          actualLoad: e.actualLoad ?? null,
          actualRpe: e.actualRpe ?? null,
          ...(completedAt ? { completedAt } : {}),
        };
      }),
    );
  } catch (err) {
    // A retried batch whose first attempt landed (the transaction is
    // all-or-nothing, so every id is there or none is): hand those sets back.
    if (ids.length === input.entries.length && isPrimaryKeyConflict(err)) {
      const existing = await listOwnedPerformanceRecordsByIds(userId, sessionId, ids);
      if (existing.length === ids.length) return existing;
      throw new TRPCError({
        code: "CONFLICT",
        message: "A set id in that batch is already in use.",
      });
    }
    throw err;
  }
}

/**
 * Read-only: every logged set for a Session, oldest-first. The session-detail
 * UI calls this (and re-invalidates it after each log mutation).
 */
export async function listMyRecordsForSession(
  userId: string,
  sessionId: string,
): Promise<PerformanceRecordRecord[]> {
  await loadOwnedSessionOrThrow(userId, sessionId);
  return listPerformanceRecordsForSession(sessionId);
}

// ---- ARCH-055: correcting a set while the Session is open ----------------

/**
 * Loads a record the caller may edit: the Session must be the caller's
 * (NOT_FOUND otherwise, ARCH-040), the record must belong to that Session
 * (NOT_FOUND otherwise, so a record id cannot be probed through someone
 * else's Session), and the Session must be IN_PROGRESS. A COMPLETED or
 * SKIPPED Session's records are frozen (PRECONDITION_FAILED).
 */
async function loadEditableRecordOrThrow(
  userId: string,
  sessionId: string,
  recordId: string,
): Promise<PerformanceRecordRecord> {
  // Two flat reads in parallel (the Session, and the record filtered by the same
  // ownership) instead of Session -> block -> record in a row.
  const [session, record] = await Promise.all([
    loadOwnedSessionOrThrow(userId, sessionId),
    findOwnedPerformanceRecord(userId, sessionId, recordId),
  ]);
  if (!record) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Logged set not found" });
  }
  if (session.status !== "IN_PROGRESS") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Sets can only be changed while the session is in progress.",
    });
  }
  return record;
}

export interface UpdateSetInput {
  actualReps?: number | null;
  actualLoad?: number | null;
  actualRpe?: number | null;
}

/**
 * Corrects a logged set. Same honesty rule as logSet: the values are stored
 * as entered and never checked against the prescription.
 */
export async function updateSet(
  userId: string,
  sessionId: string,
  recordId: string,
  changes: UpdateSetInput,
): Promise<PerformanceRecordRecord> {
  await loadEditableRecordOrThrow(userId, sessionId, recordId);
  return updatePerformanceRecord(recordId, changes);
}

export async function deleteSet(
  userId: string,
  sessionId: string,
  recordId: string,
): Promise<{ id: string }> {
  await loadEditableRecordOrThrow(userId, sessionId, recordId);
  await deletePerformanceRecord(recordId);
  return { id: recordId };
}
