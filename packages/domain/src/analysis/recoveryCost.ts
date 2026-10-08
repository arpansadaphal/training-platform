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
//     PERCENT_1RM  -> percent, normalised to 0..1 (see E9 guard below)
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
//
// ARCH-052 (Phase 10.2 follow-up): the PERCENT_1RM branch is guarded against
// a unit ambiguity. LoadScheme.percent has no stated unit in the schema, and
// both 0.75 and 75 are plausible user-entered values for "75% of 1RM". The
// engine previously used the raw value as a 0..1 fraction, so an 80 input
// inflated recovery cost ~100× and flipped a Moderate program to Excessive.
// The guard below treats values in (0, 1] as fractions and values > 1 as
// percentages. This closes the observed G-pct(75) failure without changing
// behaviour for any correct 0..1 input, and preserves monotonicity.

import type { LoadScheme, ProgramStructure } from "../types";
import type {
  AnalysisAxisResult,
  ExerciseReferenceData,
  GoalProfileConfig,
  RecoveryCostCalculator,
} from "./types";
import { resolveBand } from "./bandResolution";

/**
 * Normalise a PERCENT_1RM `percent` value to a 0..1 fraction.
 *
 * - Values in (0, 1] are treated as fractions of 1RM already (0.75 -> 0.75).
 * - Values > 1 are treated as percentages (75 -> 0.75, 80 -> 0.8).
 * - 0 or negative values are passed through unchanged (invalid input, but
 *   not this function's job to reject; the deterministic engine reports a
 *   wrong number, not a crash, on nonsense input).
 *
 * The cutoff is inclusive at 1: `1` means 100% of 1RM, which is a valid
 * prescription and stays `1`.
 */
function normalisePercentOf1RM(percent: number): number {
  if (percent > 1) return percent / 100;
  return percent;
}

function intensityWeight(scheme: LoadScheme): number {
  switch (scheme.type) {
    case "PERCENT_1RM":
      return normalisePercentOf1RM(scheme.percent);
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