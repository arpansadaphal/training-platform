// tRPC router for TrainingBlock activation and lookup.
//
// Thin by design: input validation via Zod, authorization + orchestration
// delegated to trainingService. No business rules live here (three-layer
// rule). Notably, activateVersion is NOT a commit — it points
// Program.activeVersionId at an EXISTING committed ProgramVersion. The
// commit path (which also opens a block, per ARCH-039) lives in
// programVersion.commitFromDraft / commitFromSimulation.

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { activateVersion, getCurrentBlock } from "../services/trainingService";

const programVersionIdSchema = z.string().min(1);
const programIdSchema = z.string().min(1);

export const trainingRouter = router({
  /**
   * Makes an existing committed version the Program's active version, and
   * opens a new TrainingBlock for it. Closes the prior block (if any) using
   * the same COMPLETED/ABANDONED resolution as the commit path.
   *
   * Errors:
   *   - NOT_FOUND           — version does not exist, or the caller does not
   *                           own the Program the version belongs to.
   *   - PRECONDITION_FAILED — the Program is archived.
   */
  activateVersion: protectedProcedure
    .input(z.object({ programVersionId: programVersionIdSchema }))
    .mutation(({ ctx, input }) =>
      activateVersion(ctx.user.id, input.programVersionId),
    ),

  /**
   * The Program's currently-ACTIVE TrainingBlock, or null.
   * Used by /train to decide between "Start training" and "Activate a
   * version first".
   */
  getCurrentBlock: protectedProcedure
    .input(z.object({ programId: programIdSchema }))
    .query(({ ctx, input }) => getCurrentBlock(ctx.user.id, input.programId)),
});