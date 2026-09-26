// packages/db/src/repositories/session.ts
//
// Repository layer for Session (a workout Session — an executed instance of
// a WorkoutDay). Not to be confused with a Coach conversation; see
// 03-domain-model.md's terminology note.
//
// Sessions are generated lazily, one at a time, by
// sessionService.getOrCreateNext — never bulk-pregenerated for a whole
// block. This file provides the primitives: find the current pending one,
// find the latest one, create the next one, transition status.
//
// Status-transition policy lives in the service layer, not here. These
// functions write whatever the caller asks for. The service enforces
// PLANNED → IN_PROGRESS → COMPLETED and PLANNED|IN_PROGRESS → SKIPPED.

import { type Prisma } from "@prisma/client";
import { prisma } from "../client";

export type SessionStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";

export interface SessionRecord {
  id: string;
  trainingBlockId: string;
  workoutDayId: string;
  sequenceIndex: number;
  status: SessionStatus;
  scheduledDate: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

const SESSION_SELECT = {
  id: true,
  trainingBlockId: true,
  workoutDayId: true,
  sequenceIndex: true,
  status: true,
  scheduledDate: true,
  startedAt: true,
  completedAt: true,
} as const;

export async function findSessionById(id: string): Promise<SessionRecord | null> {
  return prisma.session.findUnique({
    where: { id },
    select: SESSION_SELECT,
  });
}

export async function listSessionsForBlock(
  blockId: string,
): Promise<SessionRecord[]> {
  return prisma.session.findMany({
    where: { trainingBlockId: blockId },
    orderBy: { sequenceIndex: "asc" },
    select: SESSION_SELECT,
  });
}

/**
 * The highest-sequenceIndex Session in a block, or null. Used by
 * getOrCreateNext to advance the rotation: the next WorkoutDay is the one
 * after whichever day the latest Session was generated from.
 */
export async function findLatestSessionForBlock(
  blockId: string,
): Promise<SessionRecord | null> {
  return prisma.session.findFirst({
    where: { trainingBlockId: blockId },
    orderBy: { sequenceIndex: "desc" },
    select: SESSION_SELECT,
  });
}

/**
 * The current pending Session in a block — either PLANNED (created but not
 * started) or IN_PROGRESS (started but not finished). At most one exists at
 * a time by construction: getOrCreateNext returns this one rather than
 * creating a new one when present.
 *
 * Ordered ascending so a hypothetical future where multiple pending
 * Sessions somehow exist returns the earliest, not a random one.
 */
export async function findActiveSessionForBlock(
  blockId: string,
): Promise<SessionRecord | null> {
  return prisma.session.findFirst({
    where: {
      trainingBlockId: blockId,
      status: { in: ["PLANNED", "IN_PROGRESS"] },
    },
    orderBy: { sequenceIndex: "asc" },
    select: SESSION_SELECT,
  });
}

export interface CreateSessionInput {
  trainingBlockId: string;
  workoutDayId: string;
  sequenceIndex: number;
}

/**
 * Creates a new Session in PLANNED status. Single-statement INSERT — no
 * transaction needed at the Phase 6 call sites.
 */
export async function createSession(
  input: CreateSessionInput,
): Promise<SessionRecord> {
  return prisma.session.create({
    data: {
      trainingBlockId: input.trainingBlockId,
      workoutDayId: input.workoutDayId,
      sequenceIndex: input.sequenceIndex,
      status: "PLANNED",
    },
    select: SESSION_SELECT,
  });
}

/**
 * Transaction-aware variant, in case a caller wants the create inside a
 * wider transaction. Phase 6 does not need this today, but exposing it
 * keeps the pattern consistent with createProgramVersionInTx and friends.
 */
export async function createSessionInTx(
  tx: Prisma.TransactionClient,
  input: CreateSessionInput,
): Promise<SessionRecord> {
  return tx.session.create({
    data: {
      trainingBlockId: input.trainingBlockId,
      workoutDayId: input.workoutDayId,
      sequenceIndex: input.sequenceIndex,
      status: "PLANNED",
    },
    select: SESSION_SELECT,
  });
}

/**
 * Transitions a Session's status. Allowed transitions are enforced at the
 * service layer; this function writes whatever it is asked to write.
 *
 * startedAt / completedAt are optional — the service passes the timestamp
 * for the transition it is performing. To leave a timestamp untouched,
 * omit the field entirely (undefined ≠ null: `null` would clear it).
 */
export interface SessionStatusUpdate {
  status: SessionStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export async function updateSessionStatus(
  id: string,
  update: SessionStatusUpdate,
): Promise<SessionRecord> {
  const data: Prisma.SessionUpdateInput = { status: update.status };
  if (update.startedAt !== undefined) {
    data.startedAt = update.startedAt;
  }
  if (update.completedAt !== undefined) {
    data.completedAt = update.completedAt;
  }
  return prisma.session.update({
    where: { id },
    data,
    select: SESSION_SELECT,
  });
}

/**
 * Phase 7 addition — /app landing screen's headline stat.
 *
 * Program-scoped, LIFETIME: counts every COMPLETED Session across every
 * TrainingBlock of every ProgramVersion belonging to the Program. Not
 * block-scoped — the block-scoped variant used by the ARCH-039 close paths
 * is countCompletedSessionsForBlockInTx (a separate function in
 * trainingBlock.ts).
 */
export async function countCompletedSessionsForProgram(
  programId: string,
): Promise<number> {
  return prisma.session.count({
    where: {
      status: "COMPLETED",
      trainingBlock: {
        programVersion: { programId },
      },
    },
  });
}