// tRPC router for ProgramVersion.
//
// Two mutation paths, both routed through commitFromMutation (invariant 2):
//
//   - commitFromDraft   — the Builder's manual "Commit" button.
//   - commitFromSimulation — the manual "Apply this change" button after a
//                            simulation. Phase 5's second and LAST call site.
//
// get and listForProgram are read-only and return enough for the UI (and
// Phase 7's Review) to render the version history and the assessment that was
// actually shown at commit time.
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
import {
  commitFromDraft,
  commitFromSimulation,
} from "../services/programVersionService";
import { loadOwnedProgramOrThrow } from "../services/loadOwnedProgram";

const draftIdSchema = z.string().min(1);
const simulationIdSchema = z.string().min(1);
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

  /**
   * Second and final call site of commitFromMutation. The service re-verifies
   * staleness (invariant 6) inside commitFromMutation against the
   * Simulation's baseVersionId; a stale simulation raises
   * StaleSimulationError (CONFLICT), an already-applied one raises
   * SimulationAlreadyAppliedError (PRECONDITION_FAILED). Both project their
   * structured payloads onto error.data.cause via the errorFormatter.
   */
  commitFromSimulation: protectedProcedure
    .input(z.object({ simulationId: simulationIdSchema }))
    .mutation(({ ctx, input }) =>
      commitFromSimulation(ctx.user.id, input.simulationId),
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