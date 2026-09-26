// packages/api/src/routers/review.ts
//
// tRPC router for Phase 7 Review. Thin by design: input validation via Zod,
// orchestration delegated to reviewService. No business rules live here.
//
// review.get is the default view — reads the COMMIT-time AssessmentSnapshot
// (ARCH-015). review.recomputeAssessment is the opt-in "recompute with
// current thresholds" path — a live engine pass, persisted nowhere. The two
// are deliberately separate procedures so the UI cannot blend them by
// accident.

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getReview, recomputeAssessment } from "../services/reviewService";

const trainingBlockIdSchema = z.string().min(1);

export const reviewRouter = router({
  get: protectedProcedure
    .input(z.object({ trainingBlockId: trainingBlockIdSchema }))
    .query(({ ctx, input }) => getReview(ctx.user.id, input.trainingBlockId)),

  // Deliberately a `.query`, not a `.mutation`: it persists nothing. If UX
  // convention prefers mutation-shaped invalidation for a "recompute"
  // button, change to `.mutation` — the service is identical.
  recomputeAssessment: protectedProcedure
    .input(z.object({ trainingBlockId: trainingBlockIdSchema }))
    .query(({ ctx, input }) =>
      recomputeAssessment(ctx.user.id, input.trainingBlockId),
    ),
});