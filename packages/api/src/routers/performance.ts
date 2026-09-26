// tRPC router for PerformanceRecord (logged sets).
//
// logSet and logBatch are distinct procedures, not one with an optional
// array — the phase file names both explicitly (single logSet for one-off
// corrections, logBatch for logging a whole exercise's sets without N
// round-trips). Do not collapse them.
//
// Deviation honesty: no field is range-checked against the prescription.
// Validation here is type-shape and non-negativity only, so a client can't
// store physically impossible values (negative reps, negative load). A
// deviation from the prescription is not an error — it is the input Review
// exists to surface.
//
// Decimal handling: actualLoad and actualRpe travel as `number | null` on
// the wire. The repository converts Prisma.Decimal → number at the
// packages/db boundary (Phase 6 convention).

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { logSet, logBatch, listMyRecordsForSession } from "../services/performanceService";

const sessionIdSchema = z.string().min(1);
const prescriptionIdSchema = z.string().min(1);

const logSetFieldsSchema = z.object({
  exercisePrescriptionId: prescriptionIdSchema,
  setIndex: z.number().int().nonnegative(),
  // Optional/nullable — a user may log only reps, only load, only RPE, or
  // some subset. Presence is not required by the schema; the honesty
  // requirement is about NOT rejecting what the user enters, not about
  // requiring every field.
  actualReps: z.number().int().nonnegative().nullable().optional(),
  actualLoad: z.number().nonnegative().nullable().optional(),
  // No bounds on RPE: different practitioners use different scales, and
  // inventing a range here would be a numeric-threshold decision the freeze
  // reserves for [SCIENTIFIC INPUT REQUIRED].
  actualRpe: z.number().nullable().optional(),
});

export const performanceRouter = router({
  logSet: protectedProcedure
    .input(
      z.object({
        sessionId: sessionIdSchema,
        entry: logSetFieldsSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      logSet(ctx.user.id, input.sessionId, input.entry),
    ),

  logBatch: protectedProcedure
    .input(
      z.object({
        sessionId: sessionIdSchema,
        entries: z.array(logSetFieldsSchema),
      }),
    )
    .mutation(({ ctx, input }) =>
      logBatch(ctx.user.id, input.sessionId, { entries: input.entries }),
    ),

  listForSession: protectedProcedure
    .input(z.object({ sessionId: sessionIdSchema }))
    .query(({ ctx, input }) =>
      listMyRecordsForSession(ctx.user.id, input.sessionId),
    ),
});