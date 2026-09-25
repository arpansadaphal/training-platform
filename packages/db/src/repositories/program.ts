// Repository layer for Program. Plain-TS in / plain-TS out.

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