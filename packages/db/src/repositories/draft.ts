// Repository layer for ProgramDraft.
//
// Drafts are the only mutable structural entity in the domain model.
// Per ARCH-014, a Program may hold many concurrent ACTIVE drafts.
//
// Phase 4 change: discardDraft is now a hard delete. The DISCARDED enum value
// still exists in the schema (removing it is a later migration), but nothing
// writes it — a soft-deleted draft would leave zombie rows that render nowhere
// and would complicate the "list ACTIVE drafts" query. See DECISIONS.md.

import { type Prisma } from "@prisma/client";
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

/**
 * Hard-deletes an ACTIVE draft. Rows with status COMMITTED are immutable and
 * must not be deleted — that would break the `committedAsVersionId` foreign
 * key relationship in the schema (which is @unique but not nullable on the
 * version side). Callers should treat this as "the user closed this draft
 * without committing," and it is irreversible.
 */
export async function discardDraft(id: string): Promise<ProgramDraftRecord> {
  return prisma.programDraft.delete({
    where: { id },
    select: DRAFT_SELECT,
  });
}

/**
 * Transaction-aware: flips a draft to COMMITTED and sets its
 * committedAsVersionId. Called only from the commit service, inside the outer
 * commit transaction — if the transaction rolls back, the draft stays ACTIVE.
 *
 * A draft is never mutated after this — a subsequent edit produces a NEW
 * draft, per the "ProgramDraft is the only mutable structural entity, and
 * only while ACTIVE" rule.
 */
export async function markDraftCommittedInTx(
  tx: Prisma.TransactionClient,
  draftId: string,
  versionId: string,
): Promise<ProgramDraftRecord> {
  return tx.programDraft.update({
    where: { id: draftId },
    data: {
      status: "COMMITTED",
      committedAsVersionId: versionId,
    },
    select: DRAFT_SELECT,
  });
}