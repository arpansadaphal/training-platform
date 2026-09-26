// tRPC router for workout Session.
//
// getOrCreateNext is a MUTATION, not a query, even though its name reads
// like a read: on the first call for a new block it creates a Session row.
// Calling it as a query would make the operation non-idempotent under
// React Query's retry semantics.
//
// getContext is a query (added beyond the phase file's named procedures;
// see the Phase 6 close-out note) — the session-detail RSC page needs the
// session plus its structural context (block, workout day, prescriptions,
// program) in one read.
//
// Phase 7 addition: getCurrentSession — a READ-ONLY sibling of
// getOrCreateNext. Returns the current PLANNED / IN_PROGRESS Session for a
// block, or null. Never creates. The landing screen uses it (via
// program.getIdentitySummary) so a page render never has the side effect of
// creating a Session.
//
// Status-transition validation lives in sessionService; the router only
// shapes inputs.

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  getOrCreateNext,
  getSessionContext,
  getCurrentSession,
  markStarted,
  markCompleted,
  markSkipped,
} from "../services/sessionService";

const programIdSchema = z.string().min(1);
const sessionIdSchema = z.string().min(1);
const trainingBlockIdSchema = z.string().min(1);

export const sessionRouter = router({
  getOrCreateNext: protectedProcedure
    .input(z.object({ programId: programIdSchema }))
    .mutation(({ ctx, input }) =>
      getOrCreateNext(ctx.user.id, input.programId),
    ),

  getContext: protectedProcedure
    .input(z.object({ sessionId: sessionIdSchema }))
    .query(({ ctx, input }) =>
      getSessionContext(ctx.user.id, input.sessionId),
    ),

  // === PHASE 7 ADDITION ===
  /**
   * Read-only sibling of getOrCreateNext. Returns the current PLANNED or
   * IN_PROGRESS Session for a TrainingBlock, or null. Never creates.
   */
  getCurrentSession: protectedProcedure
    .input(z.object({ trainingBlockId: trainingBlockIdSchema }))
    .query(({ ctx, input }) =>
      getCurrentSession(ctx.user.id, input.trainingBlockId),
    ),

  markStarted: protectedProcedure
    .input(z.object({ sessionId: sessionIdSchema }))
    .mutation(({ ctx, input }) =>
      markStarted(ctx.user.id, input.sessionId),
    ),

  markCompleted: protectedProcedure
    .input(z.object({ sessionId: sessionIdSchema }))
    .mutation(({ ctx, input }) =>
      markCompleted(ctx.user.id, input.sessionId),
    ),

  markSkipped: protectedProcedure
    .input(z.object({ sessionId: sessionIdSchema }))
    .mutation(({ ctx, input }) =>
      markSkipped(ctx.user.id, input.sessionId),
    ),
});