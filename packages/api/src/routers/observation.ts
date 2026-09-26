// tRPC router for Observation.
//
// An Observation may attach to a Session, to a TrainingBlock, or stand
// alone — both FKs are nullable in the schema, and the service permits
// standalone observations deliberately (see observationService's header).
//
// structuredFields is opaque JSON on the wire: a record of unknown values
// describing sleep / stress / soreness / etc. The domain does not shape it
// in Phase 6; a future phase may give it a typed shape without changing
// the storage column.

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  createMyObservation,
  listMyObservationsForBlock,
  listMyObservationsForSession,
} from "../services/observationService";

const sessionIdSchema = z.string().min(1);
const trainingBlockIdSchema = z.string().min(1);

export const observationRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        sessionId: sessionIdSchema.nullable().optional(),
        trainingBlockId: trainingBlockIdSchema.nullable().optional(),
        content: z.string().trim().min(1).max(4000),
        // Object-shaped or omitted. A scalar would be technically storable
        // in a Json column but is not what "structured fields" means here
        // (the docs describe named ratings); requiring an object catches a
        // client bug early.
        structuredFields: z.record(z.unknown()).nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      createMyObservation(ctx.user.id, {
        sessionId: input.sessionId ?? null,
        trainingBlockId: input.trainingBlockId ?? null,
        content: input.content,
        structuredFields: input.structuredFields ?? undefined,
      }),
    ),

  listForBlock: protectedProcedure
    .input(z.object({ blockId: trainingBlockIdSchema }))
    .query(({ ctx, input }) =>
      listMyObservationsForBlock(ctx.user.id, input.blockId),
    ),

  listForSession: protectedProcedure
    .input(z.object({ sessionId: sessionIdSchema }))
    .query(({ ctx, input }) =>
      listMyObservationsForSession(ctx.user.id, input.sessionId),
    ),
});