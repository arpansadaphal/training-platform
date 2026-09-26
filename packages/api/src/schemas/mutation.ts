// packages/api/src/schemas/mutation.ts
//
// Zod schema for the MutationSpec discriminated union. Mirrors
// packages/domain/src/mutation/types.ts op-for-op; a change to that union
// must change this file in the same PR, or the API surface silently diverges
// from the domain.
//
// Import risk flagged in the Phase 5 kickoff: `programStructureSchema` is
// assumed to exist at ./programStructure and to describe
// `{ workoutDays: [...] }` with prescription/day sub-shapes matching the
// domain's ProgramStructure. The sub-schemas (workoutDayStructureSchema,
// exercisePrescriptionStructureSchema, loadSchemeSchema) are defined here
// because the existing programStructure.ts does not export them. If it does
// — in a future refactor — the local definitions become imports and this
// comment is deleted.

import { z } from "zod";
import { programStructureSchema } from "./programStructure";

/**
 * LoadScheme discriminated union — mirrors the domain's LoadScheme exactly.
 * Every member is a closed object with a literal `type` discriminant; Zod's
 * discriminatedUnion gives a clear parse error on a wrong `type` value.
 */
const loadSchemeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PERCENT_1RM"), percent: z.number() }),
  z.object({ type: z.literal("RPE_BASED"), rpe: z.number() }),
  z.object({
    type: z.literal("FIXED_WEIGHT"),
    weight: z.number(),
    unit: z.union([z.literal("kg"), z.literal("lb")]),
  }),
  z.object({ type: z.literal("BODYWEIGHT") }),
]);

const exercisePrescriptionStructureSchema = z.object({
  id: z.string().min(1),
  orderIndex: z.number().int().nonnegative(),
  exerciseId: z.string().min(1),
  targetSets: z.number().int().nonnegative(),
  targetRepsLow: z.number().int().nonnegative(),
  targetRepsHigh: z.number().int().nonnegative(),
  targetRpe: z.number().optional(),
  loadScheme: loadSchemeSchema,
});

const workoutDayStructureSchema = z.object({
  id: z.string().min(1),
  orderIndex: z.number().int().nonnegative(),
  name: z.string(),
  prescriptions: z.array(exercisePrescriptionStructureSchema),
});

/**
 * The full MutationSpec union.
 *
 * Using discriminatedUnion on `op` (rather than a plain union of objects)
 * means a caller who sends `{ op: "ADD_WORKOUT_DAY" }` without a `day`
 * field gets a clear "day: required" error at the right path, not a generic
 * "input did not match any variant".
 */
export const mutationSpecSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("ADD_WORKOUT_DAY"),
    day: workoutDayStructureSchema,
  }),
  z.object({
    op: z.literal("REMOVE_WORKOUT_DAY"),
    workoutDayId: z.string().min(1),
  }),
  z.object({
    op: z.literal("ADD_EXERCISE_PRESCRIPTION"),
    workoutDayId: z.string().min(1),
    prescription: exercisePrescriptionStructureSchema,
  }),
  z.object({
    op: z.literal("REMOVE_EXERCISE_PRESCRIPTION"),
    prescriptionId: z.string().min(1),
  }),
  z.object({
    op: z.literal("MODIFY_EXERCISE_PRESCRIPTION"),
    prescriptionId: z.string().min(1),
    // Partial — same field set as the full prescription, all optional.
    // `id` and `orderIndex` are excluded deliberately: applyMutation pins
    // `id` back to the original and normalizeStructure renumbers
    // `orderIndex`, so accepting them here would only confuse a caller who
    // thought they meant something.
    changes: exercisePrescriptionStructureSchema
      .omit({ id: true, orderIndex: true })
      .partial(),
  }),
  z.object({
    op: z.literal("REORDER_EXERCISE_PRESCRIPTIONS"),
    workoutDayId: z.string().min(1),
    orderedIds: z.array(z.string().min(1)),
  }),
  z.object({
    op: z.literal("REPLACE_STRUCTURE"),
    structure: programStructureSchema,
  }),
]);

export type MutationSpecInput = z.infer<typeof mutationSpecSchema>;