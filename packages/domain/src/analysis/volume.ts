// packages/domain/src/analysis/volume.ts
//
// Volume axis: per-muscle-group weekly HARD-SET volume.
//
// Formula (E5):
//   sum over all ExercisePrescriptions of
//     targetSets x hardSetCredit(prescription) x involvementFactor(exercise, muscleGroup)
// summed across every WorkoutDay. hardSetCredit is 1 / 0.5 / 0 by proximity to failure (hardSetCredit.ts);
// a prescription with no stated effort is assumed to be RIR 2 and earns full credit.
//
// Weekly assumption: the ProgramStructure is treated as one representative week (a microcycle). When the lifter
// says how many days a week they train and it differs from the days listed, the structure is a repeating cycle and
// the weekly total is multiplied by runsPerWeek (runsPerWeek.ts). The default of 1 changes nothing.

import type { ProgramStructure } from "../types";
import type {
  AnalysisAxisResult,
  ExerciseReferenceData,
  GoalProfileConfig,
} from "./types";
import { resolveBand } from "./bandResolution";
import { creditedSets, resolveHardSetCreditConfig } from "./hardSetCredit";

export function computeVolumeAxis(
  structure: ProgramStructure,
  referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
  runs: number = 1,
): AnalysisAxisResult[] {
  const bands = config.statusBands.VOLUME;
  const credit = resolveHardSetCreditConfig(config);

  // exerciseId -> muscleGroupId -> involvementFactor
  const involvementByExercise = new Map<string, Map<string, number>>();
  for (const inv of referenceData.involvements) {
    let byMuscle = involvementByExercise.get(inv.exerciseId);
    if (!byMuscle) {
      byMuscle = new Map();
      involvementByExercise.set(inv.exerciseId, byMuscle);
    }
    byMuscle.set(inv.muscleGroupId, inv.involvementFactor);
  }

  const results: AnalysisAxisResult[] = [];

  for (const muscleGroup of referenceData.muscleGroups) {
    let listedSets = 0;

    for (const day of structure.workoutDays) {
      for (const prescription of day.prescriptions) {
        const factor = involvementByExercise.get(prescription.exerciseId)?.get(muscleGroup.id);
        if (factor === undefined || factor <= 0) continue;
        listedSets += creditedSets(prescription, credit) * factor;
      }
    }
    const totalWeeklySets = listedSets * runs;

    results.push({
      axisType: "VOLUME",
      scopeKey: muscleGroup.name,
      metricValue: totalWeeklySets,
      status: resolveBand(totalWeeklySets, bands),
    });
  }

  return results;
}