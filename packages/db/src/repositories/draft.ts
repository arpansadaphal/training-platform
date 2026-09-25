// Repository layer for ProgramDraft.
//
// Drafts are the only mutable structural entity in the domain model.
// Per ARCH-014, a Program may hold many concurrent ACTIVE drafts.

import { Prisma } from "@prisma/client";
import { prisma } from "../client";

export type DraftStatus = "ACTIVE" | "COMMITTED" | "DISCARDED";

export interface ProgramDraftRecord {
  id: string;
  programId: string;
  baseVersionId: string | null;
  label: string;
  structure: unknown;
  status: DraftStatus;
  committedAsVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const DRAFT_SELECT = {
  id: true,
  programId: true,
  baseVersionId: true,
  label: true,
  structure: true,
  status: true,
  committedAsVersionId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function createDraft(input: {
  programId: string;
  baseVersionId?: string | null;
  label: string;
  structure: unknown;
}): Promise<ProgramDraftRecord> {
  return prisma.programDraft.create({
    data: {
      programId: input.programId,
      baseVersionId: input.baseVersionId ?? null,
      label: input.label,
      structure: input.structure as Prisma.InputJsonValue,
    },
    select: DRAFT_SELECT,
  });
}

export async function findDraftById(
  id: string,
): Promise<ProgramDraftRecord | null> {
  return prisma.programDraft.findUnique({
    where: { id },
    select: DRAFT_SELECT,
  });
}

export async function listActiveDraftsByProgram(
  programId: string,
): Promise<ProgramDraftRecord[]> {
  return prisma.programDraft.findMany({
    where: { programId, status: "ACTIVE" },
    select: DRAFT_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

export async function updateDraftStructure(
  id: string,
  structure: unknown,
): Promise<ProgramDraftRecord> {
  return prisma.programDraft.update({
    where: { id },
    data: { structure: structure as Prisma.InputJsonValue },
    select: DRAFT_SELECT,
  });
}

export async function discardDraft(id: string): Promise<ProgramDraftRecord> {
  return prisma.programDraft.update({
    where: { id },
    data: { status: "DISCARDED" },
    select: DRAFT_SELECT,
  });
}