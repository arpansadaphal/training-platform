// packages/db/src/repositories/trainingBlock.ts
//
// Repository layer for TrainingBlock.
//
// A TrainingBlock is the real-world period a specific ProgramVersion was
// actively trained. Lifecycle is fully automatic (ARCH-016):
//
//   - Opens when a ProgramVersion becomes a Program's activeVersionId.
//   - Closes when a different ProgramVersion becomes active, or the Program
//     is archived. Status resolves to COMPLETED if the closing block had at
//     least one COMPLETED Session, else ABANDONED.
//
// The service layer (packages/api/src/services/trainingService.ts) makes the
// open/close decisions and passes the resolved status in. This file is a
// read/write boundary only.
//
// Phase 6 kickoff fix (accepted): the activateVersion and archive paths MUST
// run their reads AND writes inside one transaction — TrainingBlock has no
// unique constraint that would catch two ACTIVE blocks for the same Program
// (a partial unique index `WHERE status = 'ACTIVE'` cannot be expressed in
// Prisma's schema DSL without raw SQL, and raw-SQL migrations are out of
// scope for Phase 6). The InTx read variants below exist specifically so the
// service can do "read current block + count sessions + close + open" as one
// atomic unit. The non-tx reads remain for callers that only read
// (getCurrentBlock, Phase 7's Review iteration).

import { type Prisma } from "@prisma/client";
import { prisma } from "../client";

export type TrainingBlockStatus = "ACTIVE" | "COMPLETED" | "ABANDONED";

export interface TrainingBlockRecord {
  id: string;
  programVersionId: string;
  userId: string;
  status: TrainingBlockStatus;
  plannedLengthWeeks: number | null;
  startedAt: Date;
  endedAt: Date | null;
}

const TRAINING_BLOCK_SELECT = {
  id: true,
  programVersionId: true,
  userId: true,
  status: true,
  plannedLengthWeeks: true,
  startedAt: true,
  endedAt: true,
} as const;

export async function findTrainingBlockById(
  id: string,
): Promise<TrainingBlockRecord | null> {
  return prisma.trainingBlock.findUnique({
    where: { id },
    select: TRAINING_BLOCK_SELECT,
  });
}

/**
 * Returns the Program's currently-ACTIVE TrainingBlock, or null.
 *
 * There can be at most one ACTIVE block per Program in practice (the service
 * enforces this atomically), but nothing at the schema level prevents two.
 * The `orderBy startedAt desc` is defensive: if a bug ever produced two
 * ACTIVE blocks, the caller sees the most recent rather than an arbitrary one.
 */
export async function findActiveTrainingBlockForProgram(
  programId: string,
): Promise<TrainingBlockRecord | null> {
  return prisma.trainingBlock.findFirst({
    where: {
      status: "ACTIVE",
      programVersion: { programId },
    },
    orderBy: { startedAt: "desc" },
    select: TRAINING_BLOCK_SELECT,
  });
}

/**
 * Transaction-aware variant of findActiveTrainingBlockForProgram. Used by
 * trainingService.activateVersion and the archive path — both MUST read the
 * current block inside the same transaction that closes it, or the check and
 * the write can observe different states.
 */
export async function findActiveTrainingBlockForProgramInTx(
  tx: Prisma.TransactionClient,
  programId: string,
): Promise<TrainingBlockRecord | null> {
  return tx.trainingBlock.findFirst({
    where: {
      status: "ACTIVE",
      programVersion: { programId },
    },
    orderBy: { startedAt: "desc" },
    select: TRAINING_BLOCK_SELECT,
  });
}

/**
 * Lists every block for a Program, newest first. Not used in Phase 6's
 * write paths; here for the Phase 7 Review screen to iterate blocks.
 */
export async function listTrainingBlocksForProgram(
  programId: string,
): Promise<TrainingBlockRecord[]> {
  return prisma.trainingBlock.findMany({
    where: { programVersion: { programId } },
    orderBy: { startedAt: "desc" },
    select: TRAINING_BLOCK_SELECT,
  });
}

export interface CreateTrainingBlockInput {
  programVersionId: string;
  userId: string;
  plannedLengthWeeks?: number | null;
}

/**
 * Transaction-aware: writes a new ACTIVE block. Callers must be inside a
 * transaction that also closes the prior block (if any) and flips the
 * Program's activeVersionId — the three writes are one atomic unit of work.
 */
export async function createTrainingBlockInTx(
  tx: Prisma.TransactionClient,
  input: CreateTrainingBlockInput,
): Promise<TrainingBlockRecord> {
  return tx.trainingBlock.create({
    data: {
      programVersionId: input.programVersionId,
      userId: input.userId,
      status: "ACTIVE",
      plannedLengthWeeks: input.plannedLengthWeeks ?? null,
    },
    select: TRAINING_BLOCK_SELECT,
  });
}

/**
 * Transaction-aware: closes an ACTIVE block. Sets status (COMPLETED or
 * ABANDONED, resolved by the caller) and endedAt = now(). Does NOT verify
 * the block is currently ACTIVE — the caller has just read it as ACTIVE
 * inside the same transaction and is responsible for that invariant.
 */
export async function closeTrainingBlockInTx(
  tx: Prisma.TransactionClient,
  blockId: string,
  status: "COMPLETED" | "ABANDONED",
): Promise<TrainingBlockRecord> {
  return tx.trainingBlock.update({
    where: { id: blockId },
    data: { status, endedAt: new Date() },
    select: TRAINING_BLOCK_SELECT,
  });
}

/**
 * Counts COMPLETED Sessions in a block. Only Sessions whose status is
 * exactly COMPLETED count toward the block's COMPLETED-vs-ABANDONED
 * resolution — SKIPPED and IN_PROGRESS do not.
 *
 * Non-tx variant. Kept for read-only callers (future Review).
 */
export async function countCompletedSessionsInBlock(
  blockId: string,
): Promise<number> {
  return prisma.session.count({
    where: { trainingBlockId: blockId, status: "COMPLETED" },
  });
}

/**
 * Transaction-aware variant. Used by activateVersion and the archive path,
 * which MUST count inside the same transaction that closes the block.
 *
 * Renamed from countCompletedSessionsInBlockInTx to
 * countCompletedSessionsForBlockInTx at the Phase 6 kickoff so the "ForBlock"
 * phrasing matches the read it performs (counts sessions FOR this block) and
 * reads more naturally at the call site.
 */
export async function countCompletedSessionsForBlockInTx(
  tx: Prisma.TransactionClient,
  blockId: string,
): Promise<number> {
  return tx.session.count({
    where: { trainingBlockId: blockId, status: "COMPLETED" },
  });
}