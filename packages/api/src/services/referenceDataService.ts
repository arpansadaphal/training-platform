// packages/api/src/services/referenceDataService.ts
//
// Assembles the pure-domain ExerciseReferenceData the Analysis engine
// consumes, from the persistence-layer reads. This is the only place in
// packages/api that knows the DB rows and the domain shape are structurally
// compatible — the domain never imports from @training/db.
//
// Phase 10.2 / E3: the loader now REQUIRES a goalProfileKey and filters
// muscle groups to that goal's relevantMuscleGroups before returning.
// Making the argument required (not optional) is what forces every caller
// to see the same scoped data — simulate, commit, review recompute, and
// live analysis must all agree, and a forgotten filter in one path would
// silently produce a divergent assessment. TypeScript will point at every
// call site when this lands.
//
// The scoping is by name (MuscleGroup.name, which is @unique and stable),
// not by id (a cuid, unstable across environments). The pure scoping
// function lives in packages/domain so it can be unit-tested without a DB.

import {
  goalProfileRegistry,
  scopeReferenceDataToGoal,
  type ExerciseReferenceData,
} from "@training/domain";
import {
  listExercises,
  listMuscleGroups,
  listAllInvolvements,
} from "@training/db";

export interface LoadReferenceDataOptions {
  /**
   * Which goal profile's scope to apply. The registry must know this key —
   * an unknown key throws inside goalProfileRegistry.get, which is the
   * intended failure mode.
   */
  readonly goalProfileKey: string;
}

/**
 * Returns the reference data shaped exactly as the Analysis engine expects,
 * scoped to the goal's relevant muscle groups.
 *
 * The DB records and domain reference types share field names and structural
 * types, so the re-shaping is a straight pass-through; only muscleGroups
 * changes (filtered by the goal's scope).
 */
export async function loadExerciseReferenceData(
  options: LoadReferenceDataOptions,
): Promise<ExerciseReferenceData> {
  const { goalProfileKey } = options;
  const definition = goalProfileRegistry.get(goalProfileKey);

  const [exercises, muscleGroups, involvements] = await Promise.all([
    listExercises(),
    listMuscleGroups(),
    listAllInvolvements(),
  ]);

  return scopeReferenceDataToGoal(
    { exercises, muscleGroups, involvements },
    definition.relevantMuscleGroups,
  );
}