// tRPC router for ProgramDraft.
//
// Thin by design: input validation via Zod, authorization + orchestration
// delegated to draftService. No business rules live here.

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  createMyDraft,
  getMyDraft,
  listMyDrafts,
  updateMyDraftStructure,
  discardMyDraft,
} from "../services/draftService";
import { programStructureSchema } from "../schemas/programStructure";

const draftIdSchema = z.string().min(1);
const programIdSchema = z.string().min(1);
const draftLabelSchema = z.string().trim().min(1).max(120);

export const draftRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        programId: programIdSchema,
        label: draftLabelSchema,
        baseVersionId: z.string().min(1).nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      createMyDraft(ctx.user.id, input.programId, {
        label: input.label,
        baseVersionId: input.baseVersionId ?? null,
      }),
    ),

  get: protectedProcedure
    .input(z.object({ draftId: draftIdSchema }))
    .query(({ ctx, input }) => getMyDraft(ctx.user.id, input.draftId)),

  listForProgram: protectedProcedure
    .input(z.object({ programId: programIdSchema }))
    .query(({ ctx, input }) => listMyDrafts(ctx.user.id, input.programId)),

  updateStructure: protectedProcedure
    .input(
      z.object({
        draftId: draftIdSchema,
        structure: programStructureSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      updateMyDraftStructure(ctx.user.id, input.draftId, input.structure),
    ),

  discard: protectedProcedure
    .input(z.object({ draftId: draftIdSchema }))
    .mutation(({ ctx, input }) => discardMyDraft(ctx.user.id, input.draftId)),
});