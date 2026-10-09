// packages/domain/src/analysis/recoveryCost.ts
//
// Recovery Cost: program-wide aggregate fatigue signal.
//
// *** PROVISIONAL MODEL, NOT A MEASUREMENT ***
//
// E9 formula:
//     totalRecoveryCost = sum over all prescriptions of targetSets x intensityWeight(prescription)
//   intensityWeight = RPE / 10, where RPE is (in order) targetRpe, an RPE_BASED load scheme's rpe, else
//   the assumed RPE (10 - assumedRirWhenUndefined, i.e. 8 -> 0.8). PERCENT_1RM, FIXED_WEIGHT and
//   BODYWEIGHT prescriptions with no stated effort therefore weigh 0.8 (previously percent / 1.0 / 1.0).
//   The percent value is no longer used here, so its unit cannot distort this axis.
//
// Recovery does NOT multiply by hardSetCredit: RPE / 10 already scales cost by effort, and a set at RPE 5
// still costs something (0.5), whereas a zero-credit set would vanish from the total.
//
// The calculator is injectable: ComputeAnalysisOptions.recoveryCostCalculator (see computeAnalysis.ts).
// Spacing between sessions is DEFERRED: ProgramStructure has no schedule data.
// Band cutoffs are NEVER set here; resolveBand returns UNVALIDATED when the config's bands are null.

import type { ExercisePrescriptionStructure, ProgramStructure } from "../types";
import type {
  AnalysisAxisResult,
  ExerciseReferenceData,
  GoalProfileConfig,
  RecoveryCostCalculator,
} from "./types";
import { resolveBand } from "./bandResolution";
import { prescribedRir, resolveHardSetCreditConfig } from "./hardSetCredit";

/** Per-set fatigue weight in [0, 1]. */
export function intensityWeight(
  p: ExercisePrescriptionStructure,
  config?: Pick<GoalProfileConfig, "hardSetCredit">,
): number {
  const rpe = 10 - prescribedRir(p, resolveHardSetCreditConfig(config));
  return Math.min(1, Math.max(0, rpe / 10));
}

export const provisionalRecoveryCostCalculator: RecoveryCostCalculator = {
  compute(structure, _referenceData, config) {
    let total = 0;
    for (const day of structure.workoutDays) {
      for (const p of day.prescriptions) {
        total += p.targetSets * intensityWeight(p, config);
      }
    }
    return total;
  },
};

export function computeRecoveryCostAxis(
  structure: ProgramStructure,
  referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
  calculator: RecoveryCostCalculator = provisionalRecoveryCostCalculator,
): AnalysisAxisResult {
  const metricValue = calculator.compute(structure, referenceData, config);
  return {
    axisType: "RECOVERY_COST",
    scopeKey: null,
    metricValue,
    status: resolveBand(metricValue, config.statusBands.RECOVERY_COST),
  };
}