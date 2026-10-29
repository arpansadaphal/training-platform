// packages/domain/src/assessment/findings.ts
//
// ARCH-063 / B2. Turns the ranked list of not-good axes into findings: one entry per underlying problem, not one
// per axis. Before this, a program with no leg work produced nine cards (four VOLUME Lows, four FREQUENCY "no
// exposure" cards for the same four muscles, and a hidden Exercise-selection gap). The axes are not changed or
// dropped here; they stay in `allAssessedAxes`, which is what the Fit band reads (invariant 8). Only what is
// SURFACED is grouped.
//
// Composition, in this order (each step consumes the axes it explains, so nothing is said twice):
//   A. A body region whose every in-scope muscle is at 0 sets: one REGION finding ("No lower-body training").
//      It also absorbs any whole-pattern group that explains only that region's muscles (no squat, no hinge).
//   B. A whole missing pattern group (no pulling, no hinge, no squat) that explains VOLUME Lows: one PATTERN
//      finding, led by the explained muscle with the largest deficit.
//   C. Two or more remaining VOLUME Lows in one region: one REGION finding ("Lower-body volume is low").
//   D. A whole missing pattern group that explains no VOLUME Low (no overhead press): one PATTERN finding led by
//      the Exercise-selection axis, which also names the other required patterns still missing.
//   E. A FREQUENCY "no exposure" axis for a muscle that already has a VOLUME Low: dropped (restores the
//      de-duplication E6 lost). A FREQUENCY Low that says something else (volume is fine, but spread too thin)
//      stays.
//   F. Every other not-good axis: one AXIS finding.
// The result is ordered by the rank of each finding's lead axis (`compareRanked` in computeAssessment.ts).
//
// Band names ("Low") are the ones the shipped profile and actionTemplates.ts already assume.

import type { GoalProfileConfig, MovementPattern } from "../analysis/types";
import { absentPatternGaps } from "./patternGaps";
import type { AssessedAxis, AssessmentFinding, FindingMember } from "./types";

const LOW_BAND = "Low";

/** `VOLUME:calves`; the bare axis type for a program-wide axis. The label the summary sentence has always used. */
export const axisKey = (axis: AssessedAxis): string =>
  axis.scopeKey ? `${axis.axisType}:${axis.scopeKey}` : axis.axisType;

/**
 * @param assessedAxes  the full roll-up, in Analysis order (VOLUME axes of Adequate muscles are needed to
 *                      decide whether a whole region is at 0 sets)
 * @param ranked        the not-good axes, best candidate first
 */
export function composeFindings(
  assessedAxes: readonly AssessedAxis[],
  ranked: readonly AssessedAxis[],
  config: GoalProfileConfig,
): AssessmentFinding[] {
  const rankIndex = new Map<AssessedAxis, number>(ranked.map((axis, i) => [axis, i]));
  const rank = (axis: AssessedAxis): number => rankIndex.get(axis) ?? ranked.length;
  const byRank = (a: AssessedAxis, b: AssessedAxis): number => rank(a) - rank(b);

  const volume = new Map<string, AssessedAxis>();
  for (const axis of assessedAxes) {
    if (axis.axisType === "VOLUME" && axis.scopeKey !== null) volume.set(axis.scopeKey, axis);
  }
  // A VOLUME Low that is also a surfaced candidate (severity above NONE): only those can be absorbed.
  const isLow = (axis: AssessedAxis | undefined): axis is AssessedAxis =>
    axis !== undefined &&
    axis.axisType === "VOLUME" &&
    axis.status.band === LOW_BAND &&
    typeof axis.metricValue === "number" &&
    rankIndex.has(axis);
  const lowsOf = (muscles: readonly string[]): AssessedAxis[] =>
    muscles.map((m) => volume.get(m)).filter(isLow);

  const toMembers = (axes: readonly AssessedAxis[]): FindingMember[] =>
    axes.map((axis) => ({ muscle: axis.scopeKey ?? "", sets: Number(axis.metricValue) }));

  const consumed = new Set<AssessedAxis>();
  const findings: AssessmentFinding[] = [];

  const esb = assessedAxes.find((axis) => axis.axisType === "EXERCISE_SELECTION_BALANCE");
  const absentGroups = absentPatternGaps(esb?.facts?.missingPatterns, config);
  const absorbedGroups = new Set<string>();

  // A. a region with every in-scope muscle at 0 sets
  for (const region of config.regions ?? []) {
    const axes = lowsOf(region.muscles);
    const inScope = region.muscles.filter((m) => volume.has(m));
    if (inScope.length < 2 || axes.length !== inScope.length) continue;
    if (!axes.every((axis) => axis.metricValue === 0)) continue;
    const sorted = [...axes].sort(byRank);
    findings.push({
      kind: "REGION",
      key: `region:${region.key}`,
      lead: sorted[0] as AssessedAxis,
      members: toMembers(sorted),
      region: region.key,
      absent: true,
    });
    for (const axis of axes) consumed.add(axis);
    for (const group of absentGroups) {
      if (group.muscles.length > 0 && group.muscles.every((m) => region.muscles.includes(m))) {
        absorbedGroups.add(group.key);
      }
    }
  }

  // B. a whole missing pattern group that explains VOLUME Lows
  for (const group of absentGroups) {
    if (absorbedGroups.has(group.key)) continue;
    const axes = lowsOf(group.muscles).filter((axis) => !consumed.has(axis));
    if (axes.length === 0) continue;
    const sorted = [...axes].sort(byRank);
    findings.push({
      kind: "PATTERN",
      key: `pattern:${group.key}`,
      lead: sorted[0] as AssessedAxis,
      members: toMembers(sorted),
      patterns: [group.key],
      missingPatterns: [...group.patterns],
    });
    for (const axis of axes) consumed.add(axis);
    absorbedGroups.add(group.key);
  }

  // C. two or more remaining VOLUME Lows in one region
  for (const region of config.regions ?? []) {
    const axes = lowsOf(region.muscles).filter((axis) => !consumed.has(axis));
    if (axes.length < 2) continue;
    const sorted = [...axes].sort(byRank);
    findings.push({
      kind: "REGION",
      key: `region:${region.key}`,
      lead: sorted[0] as AssessedAxis,
      members: toMembers(sorted),
      region: region.key,
      absent: false,
    });
    for (const axis of axes) consumed.add(axis);
  }

  // D. a whole missing pattern group that explains no VOLUME Low: led by the Exercise-selection axis
  if (esb !== undefined && rankIndex.has(esb)) {
    const open = absentGroups.filter((group) => !absorbedGroups.has(group.key));
    if (open.length > 0) {
      const covered = new Set<MovementPattern>(
        absentGroups.filter((g) => absorbedGroups.has(g.key)).flatMap((g) => g.patterns),
      );
      findings.push({
        kind: "PATTERN",
        key: "pattern:gaps",
        lead: esb,
        members: [],
        patterns: open.map((g) => g.key),
        missingPatterns: (esb.facts?.missingPatterns ?? []).filter((p) => !covered.has(p)),
      });
      consumed.add(esb);
    } else if (absentGroups.length > 0) {
      consumed.add(esb); // every absent group is explained by a finding above
    }
  }

  // E. "no exposure" FREQUENCY for a muscle that already has a VOLUME Low is the same problem
  for (const axis of ranked) {
    if (axis.axisType !== "FREQUENCY" || axis.status.band !== LOW_BAND) continue;
    if (axis.metricValue !== 0 || axis.scopeKey === null) continue;
    if (isLow(volume.get(axis.scopeKey))) consumed.add(axis);
  }

  // F. everything else, one finding each
  for (const axis of ranked) {
    if (consumed.has(axis)) continue;
    findings.push({
      kind: "AXIS",
      key: axisKey(axis),
      lead: axis,
      members: [],
      ...(axis.axisType === "EXERCISE_SELECTION_BALANCE" && axis.facts?.missingPatterns
        ? { missingPatterns: axis.facts.missingPatterns }
        : {}),
    });
  }

  return findings.sort((a, b) => rank(a.lead) - rank(b.lead));
}
