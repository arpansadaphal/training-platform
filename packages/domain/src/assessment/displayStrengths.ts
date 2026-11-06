// packages/domain/src/assessment/displayStrengths.ts
//
// ARCH-065 / Fix 4 (the /check stranger audit). The engine's `strengths` are every NONE-severity axis of an eligible
// type (ARCH-063's E2). On a program a stranger just pasted that reads as praise it has not earned: "Biceps: 6 hard sets,
// in range" is the very bottom of the range, and "Effort & rep ranges: Sound" praises effort the checker assumed
// (every pasted program is RPE 8). This is what the public checker SHOWS as a strength. It is display only:
// `Assessment.strengths`, every band, severity, leverage and the Fit projection are untouched (invariant 8), and nothing
// here is stored.
//
// The rule (Tier 3, a presentation convention, not a threshold the engine uses):
//   - VOLUME: at least 10 hard sets a week. HYPERTROPHY_CONFIG notes the 10-16 target band for action copy ("Target band
//     10-16 is action-copy only, not encoded here"); a muscle at 6-9 is Adequate, which is a pass, not a strength.
//   - EXERCISE_SELECTION_BALANCE: all of the required patterns covered. 5 of 6 is tolerated (Balanced) and is not praise.
//   - PROGRESSION_SOUNDNESS: never, when the effort was assumed rather than stated.
//   - Anything else an engine strength may be: shown as the engine has it.

import type { AssessedAxis } from "./types";

/** The start of the 10-16 target band the profile's volume comment names (Tier 3). */
export const EARNED_VOLUME_SETS = 10;

export interface DisplayStrengthOptions {
  /** True when effort was not stated by the lifter (a pasted routine): effort is never credited as a strength. */
  readonly effortAssumed?: boolean;
}

export function displayStrengths(
  strengths: readonly AssessedAxis[],
  options: DisplayStrengthOptions = {},
): AssessedAxis[] {
  return strengths.filter((axis) => {
    const value = typeof axis.metricValue === "number" ? axis.metricValue : null;
    switch (axis.axisType) {
      case "VOLUME":
        return value !== null && value >= EARNED_VOLUME_SETS;
      case "EXERCISE_SELECTION_BALANCE":
        return value !== null && value >= 1;
      case "PROGRESSION_SOUNDNESS":
        return options.effortAssumed !== true;
      default:
        return true;
    }
  });
}
