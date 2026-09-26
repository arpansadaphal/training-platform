// packages/domain/src/analysis/frequency.ts
//
// Frequency axis — per-muscle-group count of distinct WorkoutDays per week
// whose prescriptions touch that muscle group.
//
// 05-analysis-engine.md mentions "a minimum involvement threshold, itself
// part of the GoalProfile config". The config surface does not yet expose one,
// so Phase 2 uses the conservative default `involvementFactor > 0` — i.e. any
// non-zero involvement counts. Adding a configurable threshold later is a
// purely additive change to this function.

import type { ProgramStructure } from "../types";
import type {
  AnalysisAxisResult,
  ExerciseReferenceData,
  GoalProfileConfig,
} from "./types";
import { resolveBand } from "./bandResolution";

const MIN_INVOLVEMENT_FOR_FREQUENCY = 0; // see module header

export function computeFrequencyAxis(
  structure: ProgramStructure,
  referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
): AnalysisAxisResult[] {
  const bands = config.statusBands.FREQUENCY;

  // exerciseId -> Set<muscleGroupId> (only non-zero involvement)
  const musclesByExercise = new Map<string, Set<string>>();
  for (const inv of referenceData.involvements) {
    if (inv.involvementFactor <= MIN_INVOLVEMENT_FOR_FREQUENCY) continue;
    let set = musclesByExercise.get(inv.exerciseId);
    if (!set) {
      set = new Set();
      musclesByExercise.set(inv.exerciseId, set);
    }
    set.add(inv.muscleGroupId);
  }

  const results: AnalysisAxisResult[] = [];

  for (const muscleGroup of referenceData.muscleGroups) {
    const daysTouched = new Set<string>();

    for (const day of structure.workoutDays) {
      const touchesThisDay = day.prescriptions.some((p) => {
        const set = musclesByExercise.get(p.exerciseId);
        return set !== undefined && set.has(muscleGroup.id);
      });
      if (touchesThisDay) daysTouched.add(day.id);
    }

    const metricValue = daysTouched.size;
    results.push({
      axisType: "FREQUENCY",
      scopeKey: muscleGroup.id,
      metricValue,
      status: resolveBand(metricValue, bands),
    });
  }

  return results;
}