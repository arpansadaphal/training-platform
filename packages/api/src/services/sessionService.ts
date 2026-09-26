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

import { TRPCError } from "@trpc/server";
import {
  createSession,
  findActiveSessionForBlock,
  findActiveTrainingBlockForProgram,
  findLatestSessionForBlock,
  findProgramById,
  findTrainingBlockById,
  findVersionWithStructure,
  updateSessionStatus,
  type SessionRecord,
  type SessionStatus,
  type TrainingBlockRecord,
} from "@training/db";
import { loadOwnedProgramOrThrow } from "./loadOwnedProgram";
import { loadOwnedSessionOrThrow } from "./loadOwnedExecution";

interface PrescriptionContext {
  id: string;
  orderIndex: number;
  exerciseId: string;
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

/**
 * Returns the pending or in-progress Session for a Program, or creates the
 * next one in rotation.
 *
 * Rotation:
 *   - If a Session is already PLANNED or IN_PROGRESS in the block, return it
 *     unchanged (do not create a duplicate).
 *   - Otherwise, find the day position of the latest Session's workoutDayId
 *     in the version's ordered WorkoutDays, advance one position, and create
 *     a new PLANNED Session against that day. If there is no latest Session,
 *     start at position 0. The rotation wraps.
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
  await loadOwnedProgramOrThrow(userId, programId);

  const block = await findActiveTrainingBlockForProgram(programId);
  if (block === null) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "No active training block. Activate a committed version before training.",
    });
  }

  const active = await findActiveSessionForBlock(block.id);
  if (active !== null) {
    return active;
  }

  const version = await findVersionWithStructure(block.programVersionId);
  if (!version || version.workoutDays.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The active version has no workout days to train.",
    });
  }

  const workoutDays = version.workoutDays;
  const latest = await findLatestSessionForBlock(block.id);

  let nextDayIndex = 0;
  if (latest !== null) {
    const position = workoutDays.findIndex(
      (d) => d.id === latest.workoutDayId,
    );
    if (position >= 0) {
      nextDayIndex = (position + 1) % workoutDays.length;
    }
  }

  const nextDay = workoutDays[nextDayIndex];
  if (nextDay === undefined) {
    // Satisfies noUncheckedIndexedAccess. nextDayIndex is modulo'd into range
    // above, so this is unreachable under normal operation — but the type
    // requires the guard.
    throw new Error(
      "Unexpected: next WorkoutDay index was out of range after modulo.",
    );
  }

  const sequenceIndex = (latest?.sequenceIndex ?? -1) + 1;

  return createSession({
    trainingBlockId: block.id,
    workoutDayId: nextDay.id,
    sequenceIndex,
  });
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

  const workoutDay: WorkoutDayContext = {
    id: day.id,
    name: day.name,
    orderIndex: day.orderIndex,
    prescriptions: day.prescriptions.map((p) => ({
      id: p.id,
      orderIndex: p.orderIndex,
      exerciseId: p.exerciseId,
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