// packages/domain/src/analysis/frequency.ts
//
// Frequency axis (E6, REFRAMED): how well a muscle's weekly dose is DISTRIBUTED across sessions.
//
//   metric = exposures / requiredExposures
//   requiredExposures = max(1, ceil(weeklyFractionalSets / perSessionSetCap))
//   exposure = a session in which the muscle receives >= minExposureSets fractional hard sets
//
// "Fractional hard sets" use the same credit as VOLUME: targetSets x hardSetCredit x involvementFactor.
// Bands (hypertrophy): Low < 1 (too few sessions for the dose, or no real exposure), Adequate 1 to < 4,
// High >= 4 (informational, severity NONE).
//
// Why: once weekly volume is controlled, frequency has a negligible independent effect on hypertrophy
// (Schoenfeld 2019; Pelland 2026), while per-session returns diminish (Remmert 2025 preprint). Raw
// "sessions per week" therefore stopped being the right question.
//
// Edge cases: a muscle with no weekly dose has zero exposures and requiredExposures 1, so the metric is 0
// (Low); VOLUME flags the same muscle, and the Low action text distinguishes the two cases.
// Replaces the old rule (distinct days with any involvementFactor > 0).

import type { ProgramStructure } from "../types";
import type {
  AnalysisAxisResult,
  ExerciseReferenceData,
  FrequencyDistributionConfig,
  GoalProfileConfig,
} from "./types";
import { resolveBand } from "./bandResolution";
import { creditedSets, resolveHardSetCreditConfig } from "./hardSetCredit";

export const DEFAULT_FREQUENCY_DISTRIBUTION: FrequencyDistributionConfig = {
  perSessionSetCap: 10,
  minExposureSets: 2,
};

const EPS = 1e-9;

/** Sessions needed so that no session carries more than `perSessionSetCap` fractional sets. Always >= 1. */
export function requiredExposures(weeklySets: number, perSessionSetCap: number): number {
  return Math.max(1, Math.ceil(weeklySets / perSessionSetCap - EPS));
}

export function computeFrequencyAxis(
  structure: ProgramStructure,
  referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
): AnalysisAxisResult[] {
  const bands = config.statusBands.FREQUENCY;
  const dist = config.frequencyDistribution ?? DEFAULT_FREQUENCY_DISTRIBUTION;
  if (!(dist.perSessionSetCap > 0)) {
    throw new Error("frequencyDistribution.perSessionSetCap must be greater than 0");
  }
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
    let weeklySets = 0;
    let exposures = 0;

    for (const day of structure.workoutDays) {
      let daySets = 0;
      for (const prescription of day.prescriptions) {
        const factor = involvementByExercise.get(prescription.exerciseId)?.get(muscleGroup.id);
        if (factor === undefined || factor <= 0) continue;
        daySets += creditedSets(prescription, credit) * factor;
      }
      weeklySets += daySets;
      if (daySets > 0 && daySets >= dist.minExposureSets - EPS) exposures += 1;
    }

    const metricValue = exposures / requiredExposures(weeklySets, dist.perSessionSetCap);
    results.push({
      axisType: "FREQUENCY",
      scopeKey: muscleGroup.id,
      metricValue,
      status: resolveBand(metricValue, bands),
    });
  }

  return results;
}