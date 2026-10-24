// packages/domain/src/copy/axisSentence.ts
//
// Phase A3a.1: one plain sentence that leads a volume or frequency finding.
// Display copy only: it reads an AssessedAxis the engine already produced and
// the profile's own band bounds, and computes no band, severity or leverage.
// The numbers stay on the card under it.
//
// Tone matches the progress verdict lines: informational, directive without
// being pushy. Invariant 9 (no outcome claims) and 10 (no diagnosis) apply:
// the sentence says where a number sits against a stated range, never what
// the number will do for the lifter.

import type { AxisBandDefinition } from "../analysis/types";

export interface AxisSentenceInput {
  axisType: string;
  /** Muscle-group name for VOLUME and FREQUENCY ("chest", "rear delts"). */
  scopeKey: string | null;
  metricValue: number | string;
  status: { band: string };
}

function num(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function sets(n: number): string {
  return `${num(n)} hard ${n === 1 ? "set" : "sets"} per week`;
}

function muscleName(scopeKey: string | null): string {
  if (!scopeKey) return "This muscle";
  return scopeKey.charAt(0).toUpperCase() + scopeKey.slice(1);
}

function bandBounds(bands: readonly AxisBandDefinition[], band: string): { lo: number | null; hi: number | null } {
  const def = bands.find((b) => b.status === band);
  return { lo: def?.lowerBound ?? null, hi: def?.upperBound ?? null };
}

/**
 * The leading sentence for a VOLUME or FREQUENCY finding, or null for any
 * other axis (those keep their current presentation) and for a band that
 * has nothing useful to say.
 *
 * `bands` is the goal profile's status bands for this axis type, so the
 * numbers in the sentence are the thresholds the engine actually used.
 */
export function axisSentence(
  axis: AxisSentenceInput,
  bands: readonly AxisBandDefinition[],
): string | null {
  const band = axis.status.band;
  if (band === "N/A" || typeof axis.metricValue !== "number") return null;
  const value = axis.metricValue;
  const muscle = muscleName(axis.scopeKey);

  if (axis.axisType === "VOLUME") {
    const adequate = bandBounds(bands, "Adequate");
    const range =
      adequate.lo !== null && adequate.hi !== null ? `${num(adequate.lo)}–${num(adequate.hi)}` : null;
    switch (band) {
      case "Low": {
        const short = adequate.lo === null ? null : Math.max(1, Math.ceil(adequate.lo - value));
        return (
          `${muscle} volume is low: ${sets(value)} is under ` +
          (range ? `the ${range} range the evidence supports.` : "the supported range.") +
          (short === null ? "" : ` Consider adding ${short} more ${short === 1 ? "set" : "sets"} per week.`)
        );
      }
      case "Adequate":
        return (
          `${muscle} volume is in range: ${sets(value)} sits ` +
          (range ? `within the ${range} the evidence supports.` : "within the supported range.")
        );
      case "High":
        return (
          `${muscle} volume is on the high side: ${sets(value)} is above ` +
          (range ? `the ${range} range, ` : "the supported range, ") +
          "where returns diminish but stay positive. This is information, not a problem."
        );
      case "Excessive":
        return (
          `${muscle} volume is past the well-studied range: ${sets(value)}. ` +
          "That describes the evidence available, not a harm threshold."
        );
      default:
        return null;
    }
  }

  if (axis.axisType === "FREQUENCY") {
    switch (band) {
      case "Low":
        return value === 0
          ? `${muscle} has no session with 2 or more hard sets. Consider putting at least 2 hard sets for it in one session.`
          : `${muscle} frequency is low: its weekly sets are spread over fewer sessions than that volume needs. Consider splitting them across more sessions per week.`;
      case "Adequate":
        return `${muscle} frequency is in range: its weekly sets are spread over enough sessions.`;
      case "High":
        return `${muscle} is spread over more sessions than its volume needs. This is information, not a problem.`;
      default:
        return null;
    }
  }

  return null;
}
