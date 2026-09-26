// packages/domain/src/analysis/recoveryCost.ts
//
// Recovery Cost — program-wide aggregate fatigue signal.
//
// *** PROVISIONAL, STRUCTURAL-ONLY PLACEHOLDER ***
//
// 05-analysis-engine.md explicitly flags that Recovery Cost's underlying
// formula may need inputs the ProgramStructure does not carry (training age,
// bodyweight, sleep, etc.). Phase 2 does NOT try to resolve that. It implements
// a swappable calculator interface with the simplest monotonic-in-volume-and-
// intensity placeholder, and it is deliberately not presented as validated.
//
// Placeholder formula:
//     totalRecoveryCost = Σ over all prescriptions of
//         targetSets × intensityWeight(loadScheme)
//   where
//     PERCENT_1RM  -> percent          (already 0..1 in practice)
//     RPE_BASED    -> rpe / 10         (normalized to 0..1)
//     FIXED_WEIGHT -> 1.0              (unknown load, treated as full unit)
//     BODYWEIGHT   -> 1.0              (bodyweight loads, treated as full unit)
//
// Properties the phase-02 tests assert, without claiming scientific validity:
//   - monotonic non-decreasing in targetSets
//   - monotonic non-decreasing in intensity weight
//   - deterministic (same input -> same output)
//
// The numeric band cutoffs are NEVER set here. `resolveBand` returns
// UNVALIDATED whenever the config's RECOVERY_COST bands are null.

import type { LoadScheme, ProgramStructure } from "../types";
import type {
  AnalysisAxisResult,
  ExerciseReferenceData,
  GoalProfileConfig,
  RecoveryCostCalculator,
} from "./types";
import { resolveBand } from "./bandResolution";

function intensityWeight(scheme: LoadScheme): number {
  switch (scheme.type) {
    case "PERCENT_1RM":
      return scheme.percent;
    case "RPE_BASED":
      return scheme.rpe / 10;
    case "FIXED_WEIGHT":
      return 1;
    case "BODYWEIGHT":
      return 1;
  }
}

export const provisionalRecoveryCostCalculator: RecoveryCostCalculator = {
  compute(structure) {
    let total = 0;
    for (const day of structure.workoutDays) {
      for (const p of day.prescriptions) {
        total += p.targetSets * intensityWeight(p.loadScheme);
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
  const metricValue = calculator.compute(structure, referenceData);
  return {
    axisType: "RECOVERY_COST",
    scopeKey: null,
    metricValue,
    status: resolveBand(metricValue, config.statusBands.RECOVERY_COST),
  };
}