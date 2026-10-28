// apps/web/components/assessment/labels.ts
//
// Phase A: human-readable text for engine values. Display only — every function here reads an
// AssessedAxis (or a band name) the engine already produced and returns words for it. Nothing here
// computes a band, a severity or a leverage.
//
// Band numbers in the "what this means" lines are read from the goal profile's statusBands, so the copy
// cannot drift from the thresholds the engine actually used.

import {
  HYPERTROPHY_CONFIG,
  type AssessedAxis,
  type AxisType,
  type FitScoreBand,
} from "@training/domain";

export const AXIS_NAMES: Readonly<Record<AxisType, string>> = {
  VOLUME: "Weekly volume",
  FREQUENCY: "Frequency",
  EXERCISE_SELECTION_BALANCE: "Exercise selection",
  PROGRESSION_SOUNDNESS: "Effort & rep ranges",
  RECOVERY_COST: "Recovery cost",
};

/** "rear delts" -> "Rear delts". Scope keys are muscle-group names since Phase 10.5. */
function scopeName(scopeKey: string): string {
  return scopeKey.charAt(0).toUpperCase() + scopeKey.slice(1);
}

/** "Weekly volume · Chest", or "Recovery cost" for program-wide axes. */
export function axisLabel(axis: Pick<AssessedAxis, "axisType" | "scopeKey">): string {
  const name = AXIS_NAMES[axis.axisType] ?? axis.axisType;
  return axis.scopeKey ? `${name} · ${scopeName(axis.scopeKey)}` : name;
}

export function fitBandLabel(band: FitScoreBand): string {
  return band.replace("_", " ");
}

/** Trims to one decimal: 7.5 -> "7.5", 6 -> "6", 4.4999 -> "4.5". */
function num(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The metric with its unit, e.g. "6 hard sets / week". */
export function metricText(axis: Pick<AssessedAxis, "axisType" | "metricValue">): string {
  const value = axis.metricValue;
  if (typeof value !== "number") return String(value);
  switch (axis.axisType) {
    case "VOLUME":
      return `${num(value)} hard sets / week`;
    case "FREQUENCY":
      return value === 0
        ? "No session with 2+ hard sets"
        : `${num(value)}× the sessions this volume needs`;
    case "EXERCISE_SELECTION_BALANCE": {
      const required = HYPERTROPHY_CONFIG.requiredMovementPatterns?.length ?? 6;
      return `${Math.round(value * required)} of ${required} main movement patterns`;
    }
    case "PROGRESSION_SOUNDNESS":
      return value === 0 ? "No issues" : plural(value, "issue", "issues");
    case "RECOVERY_COST":
      return `Recovery index ${num(value)}`;
    default:
      return num(value);
  }
}

/** [lower, upper) of a band in the shipped profile, or null bounds when unbounded or not found. */
function bounds(axisType: AxisType, band: string): { lo: number | null; hi: number | null } {
  const def = HYPERTROPHY_CONFIG.statusBands[axisType]?.find((b) => b.status === band);
  return { lo: def?.lowerBound ?? null, hi: def?.upperBound ?? null };
}

/** One plain sentence on what the band means for this axis. Empty when there is nothing useful to say. */
export function meaningText(axis: Pick<AssessedAxis, "axisType" | "status">): string {
  const band = axis.status.band;
  if (band === "N/A") return "Not assessed for this goal.";
  const { lo, hi } = bounds(axis.axisType, band);

  switch (axis.axisType) {
    case "VOLUME":
      if (band === "Low")
        return `Under ${hi} hard sets a week: below the range where growth is reliable for a trained lifter.`;
      if (band === "Adequate")
        return `Within ${lo}–${hi} hard sets a week, the range the evidence supports.`;
      if (band === "High")
        return `${lo}–${hi} hard sets a week: returns diminish but stay positive. Information, not a problem.`;
      if (band === "Excessive")
        return `${lo}+ hard sets a week is past the well-studied range. Not a harm threshold.`;
      return "";
    case "FREQUENCY":
      if (band === "Low")
        return "This muscle's weekly sets aren't spread over enough sessions with 2+ hard sets each.";
      if (band === "Adequate") return "Weekly sets are spread over enough sessions.";
      if (band === "High") return "Spread over more sessions than the volume needs. Informational only.";
      return "";
    case "EXERCISE_SELECTION_BALANCE":
      if (band === "Balanced")
        return "Covers squat, hinge, and horizontal and vertical push and pull, with at most one missing.";
      return "Two or more of squat, hinge, and horizontal and vertical push and pull are missing.";
    case "PROGRESSION_SOUNDNESS":
      if (band === "Sound") return "Effort, rep ranges and %1RM loads pass the engine's checks.";
      return "At least one check failed. Most often: target effort (RPE or RIR) isn't set on enough exercises.";
    case "RECOVERY_COST":
      if (band === "Low") return "Light estimated fatigue across the week.";
      if (band === "Moderate") return "Moderate estimated fatigue across the week.";
      if (band === "High") return "Heavy estimated fatigue across the week. Worth watching.";
      if (band === "Excessive") return "Very heavy estimated fatigue across the week.";
      return "";
    default:
      return "";
  }
}
