// tRPC router for Program CRUD.
//
// Routers are thin: input validation via Zod, authorization + orchestration
// delegated to programService. No business rules live here (three-layer rule).
//
// Phase 7 addition: getIdentitySummary — the /app landing screen's single
// aggregation read. Returns the user's primary Program, its current
// TrainingBlock, the current Session (if any), and three lifetime stats.
// Deliberately one procedure so the landing page renders in one round trip.

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  createMyProgram,
  listMyPrograms,
  getMyProgram,
  renameMyProgram,
  archiveMyProgram,
  getMyIdentitySummaryForUser,
} from "../services/programService";

const programNameSchema = z.string().trim().min(1).max(120);
const programIdSchema = z.string().min(1);

export const programRouter = router({
  create: protectedProcedure
    .input(z.object({ name: programNameSchema }))
    .mutation(({ ctx, input }) => createMyProgram(ctx.user.id, input.name)),

  listMine: protectedProcedure
    .input(
      z
        .object({ includeArchived: z.boolean().optional() })
        .optional(),
    )
    .query(({ ctx, input }) =>
      listMyPrograms(ctx.user.id, input?.includeArchived ?? false),
    ),

  get: protectedProcedure
    .input(z.object({ id: programIdSchema }))
    .query(({ ctx, input }) => getMyProgram(ctx.user.id, input.id)),

  rename: protectedProcedure
    .input(z.object({ id: programIdSchema, name: programNameSchema }))
    .mutation(({ ctx, input }) =>
      renameMyProgram(ctx.user.id, input.id, input.name),
    ),

  archive: protectedProcedure
    .input(z.object({ id: programIdSchema }))
    .mutation(({ ctx, input }) => archiveMyProgram(ctx.user.id, input.id)),

  // === PHASE 7 ADDITION ===
  /**
   * The /app landing screen's single aggregation read. See identityService.ts.
   */
  getIdentitySummary: protectedProcedure.query(({ ctx }) =>
    getMyIdentitySummaryForUser(ctx.user.id),
  ),
});