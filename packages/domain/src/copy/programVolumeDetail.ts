// packages/domain/src/copy/programVolumeDetail.ts
//
// ARCH-065 / Fix 3a (the /check stranger audit). "Your program is under-dosed overall: 24 hard sets per week across the
// body" is true and a coach would not stop there. The next sentence a coach says is WHICH muscles are behind it and how
// the sets are spread: "Chest, quads and hamstrings get 3 hard sets a week; side delts and rear delts 1.5; calves 0."
//
// Display copy only. Every number is one the engine already measured: the VOLUME axes the whole-program finding
// absorbed (muscles a region or pattern finding already explains keep their own finding and are not repeated) and the
// FREQUENCY axes' metric. It computes no band, severity or leverage, and states where numbers sit, never what they will
// do for the lifter (invariants 9 and 10).
//
// The frequency clause is the engine's own definition: a FREQUENCY metric of at most 1 on every muscle means no muscle
// has two sessions with 2 or more fractional hard sets, so "No muscle gets 2 or more hard sets on more than one day."

import type { GoalProfileConfig } from "../analysis/types";
import type { AssessedAxis, Assessment } from "../assessment/types";
import { joinList } from "./findingSentence";

const num = (n: number): string => String(Math.round(n * 10) / 10);
const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The muscles the whole-program volume finding absorbed, lowest first, or null when there is no such finding. */
export function programVolumeDetail(assessment: Assessment, config: GoalProfileConfig): string | null {
  const findings = assessment.findings ?? [];
  const hasProgramFinding = findings.some(
    (f) => f.lead.axisType === "PROGRAM_STRUCTURE" && f.lead.scopeKey === "total-volume",
  );
  if (!hasProgramFinding) return null;

  const explained = new Set(findings.flatMap((f) => f.members.map((m) => m.muscle)));
  const priority = (muscle: string): number => {
    const at = config.musclePriority?.indexOf(muscle) ?? -1;
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };
  const lows = assessment.allAssessedAxes
    .filter(
      (a: AssessedAxis) =>
        a.axisType === "VOLUME" &&
        a.status.band === "Low" &&
        a.scopeKey !== null &&
        !explained.has(a.scopeKey) &&
        typeof a.metricValue === "number",
    )
    .map((a) => ({ muscle: a.scopeKey as string, sets: Math.round((a.metricValue as number) * 10) / 10 }));
  if (lows.length === 0) return null;

  // Group muscles at the same number of sets, the most-trained group first; inside a group, the profile's priority.
  const groups = new Map<number, string[]>();
  for (const low of lows) groups.set(low.sets, [...(groups.get(low.sets) ?? []), low.muscle]);
  const ordered = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([sets, muscles]) => ({
      sets,
      muscles: muscles.sort((a, b) => priority(a) - priority(b) || a.localeCompare(b)),
    }));

  const [first, ...rest] = ordered as [(typeof ordered)[number], ...typeof ordered];
  const clauses = [
    `${capitalise(joinList(first.muscles))} get ${num(first.sets)} hard ${first.sets === 1 ? "set" : "sets"} a week`,
    ...rest.map((g) => `${joinList(g.muscles)} ${num(g.sets)}`),
  ];
  let text = `${clauses.join("; ")}.`;

  const frequencies = assessment.allAssessedAxes.filter(
    (a) => a.axisType === "FREQUENCY" && typeof a.metricValue === "number",
  );
  if (frequencies.length > 0 && frequencies.every((a) => (a.metricValue as number) <= 1)) {
    text += " No muscle gets 2 or more hard sets on more than one day.";
  }
  return text;
}
