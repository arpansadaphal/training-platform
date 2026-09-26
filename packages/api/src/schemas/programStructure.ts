// packages/api/src/schemas/programStructure.ts
//
// Zod schema mirroring the domain's ProgramStructure. Lives in packages/api
// (not packages/domain) because input validation is a router-layer concern,
// not a domain concern — the domain trusts its callers and asserts internally
// what it needs (see applyMutation's invariant checks).
//
// The schema is intentionally strict on shape and permissive on quantity:
//   - Every field the domain type declares is required here, so the wire
//     contract cannot drift from ProgramStructure without a test failure.
//   - Numeric bounds (targetSets, reps) are checked for sign / integrality
//     because negative sets would flow through the engine and produce a
//     nonsensical Assessment. Upper bounds are not enforced — that's a
//     UX concern, not a correctness one, and any upper limit would be a
//     fabricated threshold ([SCIENTIFIC INPUT REQUIRED]).
//   - `loadScheme` is a discriminated union so the four variants stay in
//     lockstep with the domain's LoadScheme type.

import { z } from "zod";

const loadSchemeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("PERCENT_1RM"),
    percent: z.number().min(0).max(200),
  }),
  z.object({
    type: z.literal("RPE_BASED"),
    rpe: z.number().min(1).max(10),
  }),
  z.object({
    type: z.literal("FIXED_WEIGHT"),
    weight: z.number().min(0),
    unit: z.union([z.literal("kg"), z.literal("lb")]),
  }),
  z.object({
    type: z.literal("BODYWEIGHT"),
  }),
]);

const exercisePrescriptionSchema = z.object({
  id: z.string().min(1),
  orderIndex: z.number().int().nonnegative(),
  exerciseId: z.string().min(1),
  targetSets: z.number().int().min(1),
  targetRepsLow: z.number().int().min(1),
  targetRepsHigh: z.number().int().min(1),
  targetRpe: z.number().min(1).max(10).optional(),
  loadScheme: loadSchemeSchema,
});

const workoutDaySchema = z.object({
  id: z.string().min(1),
  orderIndex: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(120),
  prescriptions: z.array(exercisePrescriptionSchema),
});

export const programStructureSchema = z.object({
  workoutDays: z.array(workoutDaySchema),
});

export type ProgramStructureInput = z.infer<typeof programStructureSchema>;