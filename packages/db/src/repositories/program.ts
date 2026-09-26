// Repository layer for Program. Plain-TS in / plain-TS out.

import { type Prisma } from "@prisma/client";
import { prisma } from "../client";

export type ProgramVisibility = "PRIVATE" | "SHARED" | "PUBLIC";

export interface ProgramRecord {
  id: string;
  ownerUserId: string;
  name: string;
  currentGoalId: string | null;
  activeVersionId: string | null;
  visibility: ProgramVisibility;
  publicShowsExecutionHistory: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PROGRAM_SELECT = {
  id: true,
  ownerUserId: true,
  name: true,
  currentGoalId: true,
  activeVersionId: true,
  visibility: true,
  publicShowsExecutionHistory: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function createProgram(input: {
  ownerUserId: string;
  name: string;
}): Promise<ProgramRecord> {
  return prisma.program.create({
    data: {
      ownerUserId: input.ownerUserId,
      name: input.name,
    },
    select: PROGRAM_SELECT,
  });
}

/**
 * Transaction-aware variant of createProgram, for the "auto-create a Goal on
 * Program.create" flow in Phase 4: a Program is created and its currentGoalId
 * is set in the same transaction, so a Program never exists momentarily
 * without a Goal.
 *
 * `currentGoalId` is required here — a caller that has no Goal to attach
 * should use the regular createProgram and set it later, but Phase 4's
 * program.create always passes it.
 */
export async function createProgramInTx(
  tx: Prisma.TransactionClient,
  input: {
    ownerUserId: string;
    name: string;
    currentGoalId: string;
  },
): Promise<ProgramRecord> {
  return tx.program.create({
    data: {
      ownerUserId: input.ownerUserId,
      name: input.name,
      currentGoalId: input.currentGoalId,
    },
    select: PROGRAM_SELECT,
  });
}

export async function listProgramsByOwner(
  ownerUserId: string,
  options?: { includeArchived?: boolean },
): Promise<ProgramRecord[]> {
  return prisma.program.findMany({
    where: {
      ownerUserId,
      ...(options?.includeArchived ? {} : { archivedAt: null }),
    },
    select: PROGRAM_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

export async function findProgramById(
  id: string,
): Promise<ProgramRecord | null> {
  return prisma.program.findUnique({
    where: { id },
    select: PROGRAM_SELECT,
  });
}

export async function renameProgram(
  id: string,
  name: string,
): Promise<ProgramRecord> {
  return prisma.program.update({
    where: { id },
    data: { name },
    select: PROGRAM_SELECT,
  });
}

export async function archiveProgram(id: string): Promise<ProgramRecord> {
  return prisma.program.update({
    where: { id },
    data: { archivedAt: new Date() },
    select: PROGRAM_SELECT,
  });
}

/**
 * Transaction-aware: sets the Program's activeVersionId. Called from the
 * commit service after the new ProgramVersion row exists, inside the same
 * outer transaction — a partial commit would leave the Program pointing at
 * a version that does not exist, or a version that is not active.
 *
 * Flipping activeVersionId is what triggers the (future) TrainingBlock
 * lifecycle per ARCH-016. Phase 4 does not open a TrainingBlock here — that
 * is deferred to Phase 5 per the phase-04 spec's "no training execution"
 * scope. Phase 5 will either extend this function or add a sibling
 * openTrainingBlockInTx call right after it.
 */
export async function setActiveVersionInTx(
  tx: Prisma.TransactionClient,
  programId: string,
  versionId: string,
): Promise<ProgramRecord> {
  return tx.program.update({
    where: { id: programId },
    data: { activeVersionId: versionId },
    select: PROGRAM_SELECT,
  });
}