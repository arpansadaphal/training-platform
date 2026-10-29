// packages/domain/src/copy/findingSentence.ts
//
// ARCH-063 / B2. The sentence that leads a consolidated finding ("No lower-body training: quads, hamstrings,
// glutes and calves get 0 hard sets a week."). Display copy only: it reads a finding the engine already produced
// and the profile's own bands, and computes no band, severity or leverage. A single-axis VOLUME or FREQUENCY
// finding keeps its `axisSentence`; this returns null for it.
//
// Invariants 9 and 10 apply, as in axisSentence: the sentence states where numbers sit, never what they will do
// for the lifter, and says nothing about injury, cause or posture.

import { DEFAULT_PROGRESSION_RULES } from "../analysis/progressionSoundness";
import type { AxisBandDefinition, GoalProfileConfig } from "../analysis/types";
import type { AssessedAxis, AssessmentFinding } from "../assessment/types";

const num = (n: number): string => String(Math.round(n * 10) / 10);

/** "a", "a and b", "a, b and c". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function adequateRange(bands: readonly AxisBandDefinition[]): string | null {
  const adequate = bands.find((b) => b.status === "Adequate");
  return adequate && adequate.lowerBound !== null && adequate.upperBound !== null
    ? `${num(adequate.lowerBound)}–${num(adequate.upperBound)}`
    : null;
}

/** "calves 0 and hamstrings 4.5", or "quads and calves get 0" when every one is at 0. */
function setsClause(finding: AssessmentFinding): string {
  const allZero = finding.members.every((m) => m.sets === 0);
  const names = finding.members.map((m) => m.muscle);
  return allZero
    ? `${joinList(names)} get 0 hard sets a week`
    : `${joinList(finding.members.map((m) => `${m.muscle} ${num(m.sets)}`))} hard sets a week`;
}

const percent = (share: number): string => `${Math.round(share * 100)}%`;

/**
 * ARCH-063 / B3. What a failed progression check says, in the words the lifter reads. Each sentence states a
 * share the engine measured and what to do about it; none claims an outcome (invariant 9) or a cause
 * (invariant 10). Null for a check this module has no wording for.
 */
function progressionCheckSentence(
  check: { id: string; share?: number },
  config: GoalProfileConfig,
): string | null {
  const rules = config.progressionRules ?? DEFAULT_PROGRESSION_RULES;
  const share = check.share;
  switch (check.id) {
    case "NEAR_FAILURE":
      return share === undefined
        ? null
        : `${percent(share)} of your sets are to failure. Growth doesn't need failure — leave 1–2 reps in reserve on most sets.`;
    case "EFFORT_DEFINED":
      return share === undefined
        ? null
        : `Effort is stated on ${percent(share)} of your exercises. Set a target effort (RPE or reps in reserve) on the rest.`;
    case "FAR_FROM_FAILURE":
      return share === undefined
        ? null
        : `${percent(share)} of your sets are planned ${rules.farFromFailureMinRir} or more reps from failure, so they do not count as hard sets in this analysis.`;
    case "REP_RANGE":
      return share === undefined
        ? null
        : `Only ${percent(share)} of your sets are inside ${rules.acceptedRepRange[0]}–${rules.acceptedRepRange[1]} reps, the range this analysis is built on.`;
    case "PERCENT_1RM_FEASIBILITY":
      return "At least one prescription asks for more reps than its percentage of your max allows.";
    default:
      return null;
  }
}

/** The leading sentence for an Effort & rep ranges finding: one sentence per failed check, in check order. */
function progressionSentence(axis: AssessedAxis, config: GoalProfileConfig): string | null {
  const sentences = (axis.facts?.failedChecks ?? [])
    .map((c) => progressionCheckSentence(c, config))
    .filter((s): s is string => s !== null);
  return sentences.length === 0 ? null : sentences.join(" ");
}

/**
 * The leading sentence for a REGION or PATTERN finding, or for an Effort & rep ranges finding that knows which
 * checks failed. Null for every other AXIS finding (those keep their `axisSentence`) and for a finding the
 * profile cannot word.
 */
export function findingSentence(finding: AssessmentFinding, config: GoalProfileConfig): string | null {
  if (finding.kind === "REGION") {
    const region = config.regions?.find((r) => r.key === finding.region);
    if (!region || finding.members.length === 0) return null;
    if (finding.absent) {
      return `No ${region.adjective} training: ${setsClause(finding)}.`;
    }
    const range = adequateRange(config.statusBands.VOLUME);
    return (
      `${capitalise(region.adjective)} volume is low: ${setsClause(finding)}` +
      (range ? `, under the ${range} range the evidence supports.` : ".")
    );
  }

  if (finding.kind === "PATTERN") {
    // Led by explained muscles: "No pulling exercises: lats and upper back get 0 hard sets a week."
    if (finding.members.length > 0) {
      const group = config.wholePatternGaps?.find((g) => g.key === finding.patterns?.[0]);
      if (!group) return null;
      return `No ${group.name} exercises: ${setsClause(finding)}.`;
    }
    // Led by the Exercise-selection axis: no muscle to name, so name the patterns.
    const names = (finding.missingPatterns ?? [])
      .map((p) => config.patternPhrases?.[p]?.name)
      .filter((n): n is string => n !== undefined);
    if (names.length === 0) return null;
    return `No ${names.join(" or ")} exercise in the program.`;
  }

  if (finding.lead.axisType === "PROGRESSION_SOUNDNESS") return progressionSentence(finding.lead, config);
  return null;
}
