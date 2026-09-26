// tRPC router for ProgramVersion.
//
// commitFromDraft is the Builder's "Commit" button — the MANUAL_COMMIT path
// into the single commit function. get and listForProgram are read-only and
// return enough for the UI (and Phase 7's Review) to render the version
// history and the assessment that was actually shown at commit time.
//
// Per ARCH-011, the commit function is defined in
// packages/api/src/services/programVersionService.ts and is never imported
// from packages/ai. That boundary is enforced by a test in packages/ai.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  findVersionById,
  listVersionsByProgram,
  findLatestAssessmentSnapshotForVersion,
  type AssessmentSnapshotRecord,
  type ProgramVersionRecord,
} from "@training/db";
import { router, protectedProcedure } from "../trpc";
import { commitFromDraft } from "../services/programVersionService";
import { loadOwnedProgramOrThrow } from "../services/loadOwnedProgram";

const draftIdSchema = z.string().min(1);
const versionIdSchema = z.string().min(1);
const programIdSchema = z.string().min(1);

export interface VersionWithSnapshot {
  version: ProgramVersionRecord;
  /** The most recent AssessmentSnapshot for this version, or null if none. */
  snapshot: AssessmentSnapshotRecord | null;
}

export const programVersionRouter = router({
  commitFromDraft: protectedProcedure
    .input(z.object({ draftId: draftIdSchema }))
    .mutation(({ ctx, input }) =>
      commitFromDraft(ctx.user.id, input.draftId),
    ),

  get: protectedProcedure
    .input(z.object({ versionId: versionIdSchema }))
    .query(async ({ ctx, input }): Promise<VersionWithSnapshot> => {
      const version = await findVersionById(input.versionId);
      if (!version) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }
      // Ownership via the program the version belongs to. A caller who is not
      // the program's owner receives NOT_FOUND (same non-disclosure rule as
      // elsewhere) — do not reveal that another user's version exists.
      await loadOwnedProgramOrThrow(ctx.user.id, version.programId);

      const snapshot = await findLatestAssessmentSnapshotForVersion(version.id);
      return { version, snapshot };
    }),

  listForProgram: protectedProcedure
    .input(z.object({ programId: programIdSchema }))
    .query(async ({ ctx, input }): Promise<ProgramVersionRecord[]> => {
      await loadOwnedProgramOrThrow(ctx.user.id, input.programId);
      return listVersionsByProgram(input.programId);
    }),
});