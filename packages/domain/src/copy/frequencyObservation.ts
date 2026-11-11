// packages/domain/src/copy/frequencyObservation.ts
//
// The "Program observation" on /check (ARCH-068): when most muscles get one exposure a week, say so, in plain words, with
// what it means for THIS program. Display copy only, and deliberately unscored:
//
//   - It is never a finding, a strength, an attention area, the biggest opportunity or part of the Fit band. Weights,
//     bands, severity and leverage are untouched (invariant 8); calibration and coach parity cannot move.
//   - It does not say once a week is a defect. The profile's Tier 1-2 claim is that frequency has no independent effect
//     on growth once weekly volume is equal (Schoenfeld 2019; Pelland 2026). What it states is the fact, and the two
//     things that do follow from it: how much one session carries, and whether the week reaches the whole-program floor.
//
// The counts are the FREQUENCY axis's own (`muscleExposures`), and the total is the engine's PROGRAM_STRUCTURE total,
// so a number here is the number the analysis used. A structure run more than once a week (AnalysisContext.daysPerWeek)
// has more exposures and so does not fire.

import { muscleExposures, DEFAULT_FREQUENCY_DISTRIBUTION } from "../analysis/frequency";
import { runsPerWeek } from "../analysis/runsPerWeek";
import type { Analysis, AnalysisContext, ExerciseReferenceData, GoalProfileConfig } from "../analysis/types";
import type { ProgramStructure } from "../types";

/**
 * Share of the muscles the program trains (at least one exposure) that must have exactly one exposure a week for the
 * observation to appear. The denominator is the trained muscles, not all of the profile's: a bro split that skips side
 * delts, hamstrings and calves is the clearest once-a-week program there is, and counting those three untrained muscles
 * would drop it to 8 of 11 and hide the note exactly where it is needed.
 */
export const ONCE_A_WEEK_SHARE = 0.8;

export type FrequencyVariant = "CAP_EXCEEDED" | "UNDER_FLOOR" | "IN_RANGE";

export interface FrequencyObservation {
  readonly variant: FrequencyVariant;
  readonly heading: string;
  readonly text: string;
}

export const FREQUENCY_OBSERVATION_HEADING = "Program observation";

const num = (n: number): string => String(Math.round(n * 10) / 10);

/** How widely it holds, so the first sentence is never stronger than the count behind it. */
export type OnceScope = "ALL" | "ALL_TRAINED" | "MOST";

const lead = (scope: OnceScope): string =>
  scope === "ALL"
    ? "Every muscle is trained once a week."
    : scope === "ALL_TRAINED"
      ? "Every muscle you train is trained once a week."
      : "Most muscles are trained once a week.";

export const FREQUENCY_COPY = {
  capExceeded: (scope: OnceScope, muscle: string, sets: number): string =>
    `${lead(scope)} Your ${muscle} gets ${num(sets)} sets, all in one session — that's over what a single session can productively use. Splitting each muscle across two sessions lets you keep the volume without one session carrying that much.`,
  underFloor: (scope: OnceScope, total: number): string =>
    `${lead(scope)} Your total is ${num(total)} sets, under the general floor — the fix is to add a second training day, not to add more sets to your current days.`,
  inRange: (scope: OnceScope): string =>
    `${lead(scope)} Your volume is in range, so this is informational — most programs work well at two sessions per muscle per week, but one session is not disqualifying if the per-session volume is right.`,
} as const;

/** Every sentence, for the copy lint. */
export function allFrequencyObservationCopy(): string[] {
  return [
    FREQUENCY_OBSERVATION_HEADING,
    ...(["ALL", "ALL_TRAINED", "MOST"] as const).flatMap((scope) => [
      FREQUENCY_COPY.capExceeded(scope, "chest", 12),
      FREQUENCY_COPY.underFloor(scope, 24),
      FREQUENCY_COPY.inRange(scope),
    ]),
  ];
}

export function frequencyObservation(
  analysis: Analysis,
  structure: ProgramStructure,
  referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
  context?: AnalysisContext,
): FrequencyObservation | null {
  const runs = runsPerWeek(structure, context);
  const muscles = muscleExposures(structure, referenceData, config, runs);
  if (muscles.length === 0) return null;

  const trained = muscles.filter((m) => m.exposures >= 1);
  const once = trained.filter((m) => m.exposures === 1);
  if (trained.length === 0 || once.length / trained.length < ONCE_A_WEEK_SHARE - 1e-9) return null;
  const all: OnceScope = once.length === muscles.length ? "ALL" : once.length === trained.length ? "ALL_TRAINED" : "MOST";

  // Variant A: a muscle's whole dose lands in one session and is over the per-session cap.
  const cap = (config.frequencyDistribution ?? DEFAULT_FREQUENCY_DISTRIBUTION).perSessionSetCap;
  const over = once.filter((m) => m.maxSessionSets > cap + 1e-9).sort((a, b) => b.maxSessionSets - a.maxSessionSets)[0];
  if (over) {
    return {
      variant: "CAP_EXCEEDED",
      heading: FREQUENCY_OBSERVATION_HEADING,
      text: FREQUENCY_COPY.capExceeded(all, over.muscle, over.maxSessionSets),
    };
  }

  // Variant B: the week is under the profile's whole-program floor (the engine's own total).
  const floor = config.programStructure?.minWeeklySets;
  const total = analysis.axisResults.find((a) => a.axisType === "PROGRAM_STRUCTURE" && a.scopeKey === "total-volume");
  if (floor !== undefined && total && typeof total.metricValue === "number" && total.metricValue < floor) {
    return {
      variant: "UNDER_FLOOR",
      heading: FREQUENCY_OBSERVATION_HEADING,
      text: FREQUENCY_COPY.underFloor(all, total.metricValue),
    };
  }

  return { variant: "IN_RANGE", heading: FREQUENCY_OBSERVATION_HEADING, text: FREQUENCY_COPY.inRange(all) };
}
