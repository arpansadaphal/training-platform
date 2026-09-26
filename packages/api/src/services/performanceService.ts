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
  createPerformanceRecord,
  createPerformanceRecordsBatch,
  findTrainingBlockById,
  findVersionWithStructure,
  listPerformanceRecordsForSession,
  type PerformanceRecordRecord,
  type SessionRecord,
} from "@training/db";
import { loadOwnedSessionOrThrow } from "./loadOwnedExecution";

interface SessionStructure {
  workoutDayId: string;
  prescriptionIds: ReadonlySet<string>;
}

/**
 * Loads the session's structural context (the workout day of the version the
 * session was generated from) and returns the set of prescription ids
 * belonging to that day. One lookup, reused by both logSet and logBatch.
 *
 * Failing loud on a missing block/version/day is a data-integrity response,
 * not a user-facing error — the invariant is that a Session's workoutDayId
 * always resolves within its block's version structure.
 */
async function loadSessionStructure(
  session: SessionRecord,
): Promise<SessionStructure> {
  const block = await findTrainingBlockById(session.trainingBlockId);
  if (!block) {
    throw new Error(
      `Session ${session.id} references missing TrainingBlock ${session.trainingBlockId}`,
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
      `Session ${session.id} references WorkoutDay ${session.workoutDayId} not present in its version's structure.`,
    );
  }
  return {
    workoutDayId: day.id,
    prescriptionIds: new Set(day.prescriptions.map((p) => p.id)),
  };
}

export interface LogSetInput {
  exercisePrescriptionId: string;
  setIndex: number;
  actualReps?: number | null;
  actualLoad?: number | null;
  actualRpe?: number | null;
}

export async function logSet(
  userId: string,
  sessionId: string,
  input: LogSetInput,
): Promise<PerformanceRecordRecord> {
  const session = await loadOwnedSessionOrThrow(userId, sessionId);
  const structure = await loadSessionStructure(session);

  if (!structure.prescriptionIds.has(input.exercisePrescriptionId)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "The prescription is not part of this session's workout day.",
    });
  }

  return createPerformanceRecord({
    sessionId: session.id,
    exercisePrescriptionId: input.exercisePrescriptionId,
    setIndex: input.setIndex,
    actualReps: input.actualReps ?? null,
    actualLoad: input.actualLoad ?? null,
    actualRpe: input.actualRpe ?? null,
  });
}

export interface LogBatchEntry {
  exercisePrescriptionId: string;
  setIndex: number;
  actualReps?: number | null;
  actualLoad?: number | null;
  actualRpe?: number | null;
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

  const session = await loadOwnedSessionOrThrow(userId, sessionId);
  const structure = await loadSessionStructure(session);

  for (const entry of input.entries) {
    if (!structure.prescriptionIds.has(entry.exercisePrescriptionId)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "A prescription in the batch is not part of this session's workout day.",
      });
    }
  }

  return createPerformanceRecordsBatch(
    input.entries.map((e) => ({
      sessionId: session.id,
      exercisePrescriptionId: e.exercisePrescriptionId,
      setIndex: e.setIndex,
      actualReps: e.actualReps ?? null,
      actualLoad: e.actualLoad ?? null,
      actualRpe: e.actualRpe ?? null,
    })),
  );
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