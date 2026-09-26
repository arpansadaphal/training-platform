// packages/api/src/services/draftService.ts
//
// Orchestration service for ProgramDraft.
//
// Drafts are the only mutable structural entity in the domain model (see
// 03-domain-model.md). Everything here deals with ACTIVE drafts; a draft
// whose status is COMMITTED is immutable, and DISCARDED is unused in Phase 4
// (discard is a hard delete — see ARCH-020-adjacent note in DECISIONS).
//
// Ownership: the caller must own the Program the draft belongs to. A draft
// whose program the caller does not own is NOT_FOUND, matching the
// program-level rule.

import { TRPCError } from "@trpc/server";
import {
  createDraft,
  findDraftById,
  listActiveDraftsByProgram,
  updateDraftStructure,
  discardDraft as discardDraftRepo,
  findVersionById,
  type ProgramDraftRecord,
  type ProgramVersionRecord,
} from "@training/db";
import type { ProgramStructure } from "@training/domain";
import { DraftNotActiveError } from "../errors";
import { loadOwnedProgramOrThrow } from "./loadOwnedProgram";

const EMPTY_STRUCTURE: ProgramStructure = { workoutDays: [] };

/**
 * Loads a draft by id, then verifies the caller owns its Program.
 * Returns NOT_FOUND if either the draft does not exist or the program is
 * not owned by the caller — same non-disclosure rule as loadOwnedProgram.
 */
async function loadOwnedDraftOrThrow(
  userId: string,
  draftId: string,
): Promise<ProgramDraftRecord> {
  const draft = await findDraftById(draftId);
  if (!draft) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
  }
  await loadOwnedProgramOrThrow(userId, draft.programId);
  return draft;
}

function assertActive(draft: ProgramDraftRecord): void {
  if (draft.status !== "ACTIVE") {
    throw new DraftNotActiveError({
      draftId: draft.id,
      draftStatus: draft.status,
    });
  }
}

/**
 * Creates a new ACTIVE draft on a Program the caller owns.
 *
 * Two modes, matching phases/phase-04-builder-and-commit.md's deliverable:
 *   - from scratch: baseVersionId omitted → structure starts empty.
 *   - from a base version: baseVersionId set → structure is a copy of that
 *     version's snapshot. The version must belong to the same Program.
 *
 * The structure is stored server-side rather than passed by the client, so
 * the initial content is authoritative and cannot be spoofed.
 */
export async function createMyDraft(
  userId: string,
  programId: string,
  input: { label: string; baseVersionId?: string | null },
): Promise<ProgramDraftRecord> {
  await loadOwnedProgramOrThrow(userId, programId);

  let structure: ProgramStructure = EMPTY_STRUCTURE;
  let baseVersionId: string | null = null;

  if (input.baseVersionId != null) {
    const base = await findVersionById(input.baseVersionId);
    if (!base || base.programId !== programId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Base version not found for this Program",
      });
    }
    structure = base.structureSnapshot as ProgramStructure;
    baseVersionId = base.id;
  }

  return createDraft({
    programId,
    baseVersionId,
    label: input.label,
    structure,
  });
}

export async function getMyDraft(
  userId: string,
  draftId: string,
): Promise<ProgramDraftRecord> {
  return loadOwnedDraftOrThrow(userId, draftId);
}

export async function listMyDrafts(
  userId: string,
  programId: string,
): Promise<ProgramDraftRecord[]> {
  await loadOwnedProgramOrThrow(userId, programId);
  return listActiveDraftsByProgram(programId);
}

/**
 * Overwrites a draft's structure. Only ACTIVE drafts are writable — a
 * COMMITTED draft is an immutable record of what was proposed at commit time.
 */
export async function updateMyDraftStructure(
  userId: string,
  draftId: string,
  structure: ProgramStructure,
): Promise<ProgramDraftRecord> {
  const draft = await loadOwnedDraftOrThrow(userId, draftId);
  assertActive(draft);
  return updateDraftStructure(draftId, structure);
}

/**
 * Hard-deletes an ACTIVE draft. Rejected on a COMMITTED draft — the draft
 * row is the historical record of what was proposed, and deleting it would
 * sever that provenance even though the schema would technically allow it.
 */
export async function discardMyDraft(
  userId: string,
  draftId: string,
): Promise<ProgramDraftRecord> {
  const draft = await loadOwnedDraftOrThrow(userId, draftId);
  assertActive(draft);
  return discardDraftRepo(draftId);
}

// Re-exported so routers can describe the shape they return without importing
// from @training/db directly. Keeps the router's import list small.
export type { ProgramDraftRecord, ProgramVersionRecord };