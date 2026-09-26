// packages/api/src/services/referenceDataService.ts
//
// Assembles the pure-domain ExerciseReferenceData the Analysis engine
// consumes, from the persistence-layer reads. This is the only place in
// packages/api that knows the DB rows and the domain shape are structurally
// compatible — the domain never imports from @training/db.
//
// No caching in Phase 4: the reference data is a few hundred rows, changes
// only when the seed runs, and a stale read would be worse than the cost of
// reading fresh each commit. Revisit if profiling shows it matters.

import type { ExerciseReferenceData } from "@training/domain";
import {
  listExercises,
  listMuscleGroups,
  listAllInvolvements,
} from "@training/db";

/**
 * Returns the reference data shaped exactly as the Analysis engine expects.
 *
 * The DB records and domain reference types share field names and structural
 * types (MovementPattern is a string-literal union on both sides, equipment
 * is string | null on both, involvementFactor has already been converted
 * from Prisma Decimal to number in the repository layer), so this function
 * is a straight re-shaping rather than a mapping.
 */
export async function loadExerciseReferenceData(): Promise<ExerciseReferenceData> {
  const [exercises, muscleGroups, involvements] = await Promise.all([
    listExercises(),
    listMuscleGroups(),
    listAllInvolvements(),
  ]);

  return {
    exercises,
    muscleGroups,
    involvements,
  };
}