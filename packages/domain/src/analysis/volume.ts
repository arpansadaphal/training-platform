// packages/domain/src/analysis/volume.ts
//
// Volume axis — per-muscle-group weekly set volume.
//
// Formula (05-analysis-engine.md §"Analysis axes"):
//   sum over all ExercisePrescriptions of
//     targetSets × involvementFactor(exercise, muscleGroup)
// summed across every WorkoutDay in the ProgramStructure.
//
// Weekly assumption: the ProgramStructure is treated as one representative
// week (a microcycle). The source documents do not describe multi-week
// structures; if that ever changes, this assumption — and only this
// assumption — is what to revisit.
//
// Phase 10.2 / E14 (partially resolved): `scopeKey` on the axis result is
// the muscle-group NAME, not its id. Names are @unique and stable across
// environments; cuids are not, and they leaked into every user-facing
// surface (strengths cards, action descriptions, root cause keys, the
// overall summary). The internal involvement lookup still keys on
// muscleGroup.id — only the outward-facing scopeKey uses the name. This
// also makes the scoped-weight key format (`VOLUME:chest`) match what a
// config author would naturally write.

import type { ProgramStructure } from "../types";
import type {
  AnalysisAxisResult,
  ExerciseReferenceData,
  GoalProfileConfig,
} from "./types";
import { resolveBand } from "./bandResolution";

export function computeVolumeAxis(
  structure: ProgramStructure,
  referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
): AnalysisAxisResult[] {
  const bands = config.statusBands.VOLUME;

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
    let totalWeeklySets = 0;

    for (const day of structure.workoutDays) {
      for (const prescription of day.prescriptions) {
        const byMuscle = involvementByExercise.get(prescription.exerciseId);
        if (!byMuscle) continue;
        const factor = byMuscle.get(muscleGroup.id);
        if (factor === undefined || factor <= 0) continue;
        totalWeeklySets += prescription.targetSets * factor;
      }
    }

    results.push({
      axisType: "VOLUME",
      scopeKey: muscleGroup.name,
      metricValue: totalWeeklySets,
      status: resolveBand(totalWeeklySets, bands),
    });
  }

  return results;
}