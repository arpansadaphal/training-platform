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
  getLastTimeHints,
  getOrCreateNext,
  getSessionContext,
  getSessionPage,
  getCurrentSession,
  getTrainingOptions,
  startSpecificDay,
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

  // ARCH-056: train a chosen day; passed-over days are recorded as SKIPPED.
  startSpecificDay: protectedProcedure
    .input(z.object({ programId: programIdSchema, workoutDayId: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      startSpecificDay(ctx.user.id, input.programId, input.workoutDayId),
    ),

  // Read-only: the /train day picker's days, suggested day and pending session.
  getTrainingOptions: protectedProcedure
    .input(z.object({ programId: programIdSchema }))
    .query(({ ctx, input }) => getTrainingOptions(ctx.user.id, input.programId)),

  // Read-only, display-only "Last: 60 kg × 10" hints for a session's exercises.
  getLastTimeHints: protectedProcedure
    .input(z.object({ sessionId: sessionIdSchema }))
    .query(({ ctx, input }) => getLastTimeHints(ctx.user.id, input.sessionId)),

  // Everything the session page renders, in one call (two steps of reads).
  getPage: protectedProcedure
    .input(z.object({ sessionId: sessionIdSchema }))
    .query(({ ctx, input }) => getSessionPage(ctx.user.id, input.sessionId)),

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