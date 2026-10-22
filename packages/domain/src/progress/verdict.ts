// packages/domain/src/progress/verdict.ts
//
// The Progress verdict: is this lift's top-set estimated 1RM moving over the
// last few sessions? Informational only. The copy states what the logs show,
// attributes no cause, and promises nothing (invariants 9 and 10).
//
// The verdict compares estimated 1RM (so added reps at the same weight count
// as movement); the chart and "last time" hint keep showing weight.

import type { ExerciseSessionRecord } from "./history";

export type ProgressVerdictKind =
  | "TRENDING_WELL"
  | "STALLED"
  | "DECLINING"
  | "INSUFFICIENT_DATA";

export interface ProgressVerdict {
  kind: ProgressVerdictKind;
  /** Signed percent change in estimated 1RM, oldest to newest in the window; null when insufficient. */
  changePercent: number | null;
  /** How many sessions the verdict looked at (at most WINDOW). */
  sessionsConsidered: number;
}

/** Sessions looked at. */
export const VERDICT_WINDOW = 4;
/** Fewest sessions that earn a verdict. */
export const VERDICT_MIN_SESSIONS = 3;
/** Percent change that separates movement from flat. */
export const VERDICT_THRESHOLD_PERCENT = 5;

/** `records` must be oldest-first, as buildExerciseHistory returns them. */
export function computeProgressVerdict(
  records: readonly ExerciseSessionRecord[],
): ProgressVerdict {
  const window = records.slice(-VERDICT_WINDOW);
  if (window.length < VERDICT_MIN_SESSIONS) {
    return {
      kind: "INSUFFICIENT_DATA",
      changePercent: null,
      sessionsConsidered: window.length,
    };
  }
  const first = window[0]!.estimated1RM;
  const last = window[window.length - 1]!.estimated1RM;
  const changePercent = ((last - first) / first) * 100;
  const kind: ProgressVerdictKind =
    changePercent >= VERDICT_THRESHOLD_PERCENT
      ? "TRENDING_WELL"
      : changePercent <= -VERDICT_THRESHOLD_PERCENT
        ? "DECLINING"
        : "STALLED";
  return { kind, changePercent, sessionsConsidered: window.length };
}

/**
 * One line for the Progress list and the dashboard. Name first, so plural or
 * mass-noun exercise names ("Dumbbell Curls") never fight a verb.
 */
export function progressVerdictLine(
  exerciseName: string,
  verdict: ProgressVerdict,
): string {
  const sessions = `your last ${verdict.sessionsConsidered} sessions`;
  const pct =
    verdict.changePercent === null
      ? 0
      : Math.round(Math.abs(verdict.changePercent));
  switch (verdict.kind) {
    case "TRENDING_WELL":
      return `${exerciseName}: up ${pct}% over ${sessions}.`;
    case "DECLINING":
      return `${exerciseName}: down ${pct}% over ${sessions}.`;
    case "STALLED":
      return `${exerciseName}: no change over ${sessions}.`;
    case "INSUFFICIENT_DATA": {
      if (verdict.sessionsConsidered === 0) {
        return `${exerciseName}: log a weight to see a trend.`;
      }
      const more = VERDICT_MIN_SESSIONS - verdict.sessionsConsidered;
      return `${exerciseName}: log ${more} more session${more === 1 ? "" : "s"} for a verdict.`;
    }
  }
}
