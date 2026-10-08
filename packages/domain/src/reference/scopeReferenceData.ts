// packages/domain/src/reference/scopeReferenceData.ts
//
// Pure scoping function for ExerciseReferenceData. Phase 10.2 / E3.

import type { ExerciseReferenceData } from "../analysis/types";

export function scopeReferenceDataToGoal(
  referenceData: ExerciseReferenceData,
  relevantMuscleGroupNames: readonly string[],
): ExerciseReferenceData {
  if (relevantMuscleGroupNames.length === 0) {
    throw new Error(
      "scopeReferenceDataToGoal: relevantMuscleGroupNames is empty. " +
        "An empty scope would produce an assessment with no assessable axes.",
    );
  }

  const nameSet = new Set(relevantMuscleGroupNames);
  const filtered = referenceData.muscleGroups.filter((m) => nameSet.has(m.name));

  if (filtered.length === 0) {
    throw new Error(
      "scopeReferenceDataToGoal: none of the requested muscle-group names " +
        `matched the loaded reference data. Requested: ` +
        `[${relevantMuscleGroupNames.join(", ")}].`,
    );
  }

  if (filtered.length !== relevantMuscleGroupNames.length) {
    const matched = new Set(filtered.map((m) => m.name));
    const missing = relevantMuscleGroupNames.filter((n) => !matched.has(n));
    throw new Error(
      `scopeReferenceDataToGoal: ${missing.length} requested muscle-group ` +
        `name(s) not found in the loaded reference data: [${missing.join(", ")}].`,
    );
  }

  return {
    exercises: referenceData.exercises,
    muscleGroups: filtered,
    involvements: referenceData.involvements,
  };
}