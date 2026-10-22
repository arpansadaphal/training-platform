// tRPC router for the Progress view and the post-workout summary (Phase A3a).
//
// Read-only. The numbers and copy come from @training/domain's progress/
// functions; see services/progressService.ts for the loading layer.

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getProgressForUser, getSessionSummary } from "../services/progressService";

export const progressRouter = router({
  getForUser: protectedProcedure.query(({ ctx }) => getProgressForUser(ctx.user.id)),
  getSessionSummary: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(({ ctx, input }) => getSessionSummary(ctx.user.id, input.sessionId)),
});
