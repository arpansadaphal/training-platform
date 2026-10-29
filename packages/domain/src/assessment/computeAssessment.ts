// packages/domain/src/assessment/computeAssessment.ts
//
// computeAssessment — the pure entry point that turns an Analysis plus a
// GoalProfileConfig into an AssessmentResult (VALIDATED or UNVALIDATED).
//
// Algorithm (06-assessment-engine.md):
//   1. Roll up every axis to a Leverage via `rollUpLeverage`. If any axis
//      cannot resolve, the result is UNVALIDATED with the roll-up's reason;
//      classification is *not* run on the partial set (see `classifyAxes`
//      doc comment).
//   2. If the profile is not `validated: true`, the result is UNVALIDATED
//      regardless of whether the roll-up succeeded — a fully computed
//      assessment on an unvalidated profile still carries the "provisional"
//      signal via the union kind.
//   3. Otherwise, classify:
//        Strengths        = axes whose severity is NONE AND whose axis type
//                           is listed in `config.strengthEligibleAxes`.
//        BiggestOpportunity = the first-ranked axis NOT in good status, EXCLUDING axes whose
//                           leverage is NONE (see E1). Ranking: see `compareRanked` (B1).
//        AttentionAreas   = other axes whose severity clears the profile's
//                           materiality threshold, excluding the Biggest
//                           Opportunity.
//        Actions          = one deterministic template per attention area +
//                           biggest opportunity, deduped by rootCauseKey.
//
// Determinism: given the same Analysis + config, the returned
// AssessmentResult is byte-for-byte equal across runs. The only time source
// is `analysis.computedAt` — nothing here reads `new Date()`.
//
// No numeric thresholds. No weighted sums. Ordinal comparisons against
// config-supplied enums only.
//
// Phase 10.2 fixes:
//   E1 — Biggest Opportunity no longer selects an axis whose leverage is
//        NONE. Previously the running rank started at -1, so the first
//        not-good axis won even when its leverage was NONE (e.g. a MINOR
//        severity on a LOW weight axis). Now such axes are excluded; if no
//        not-good axis reaches LOW leverage, biggestOpportunity is null.
//   E2 — Strengths no longer list every NONE-severity axis. FREQUENCY and
//        RECOVERY_COST can be NONE ("once weekly is fine", "recovery cost
//        is low") without being achievements for a hypertrophy goal. The
//        config now supplies `strengthEligibleAxes`.

import type {
  Analysis,
  AxisType,
  GoalProfileConfig,
  Leverage,
  Severity,
  Weight,
} from "../analysis/types";
import { actionForFinding } from "./actionTemplates";
import { composeFindings } from "./findings";
import { rollUpLeverage } from "./rollup";
import type {
  ActionSuggestion,
  AssessedAxis,
  Assessment,
  AssessmentFinding,
  AssessmentResult,
  ComputeAssessmentOptions,
} from "./types";

// ---------------------------------------------------------------------------
// Ordinal ranking (comparison-only — no magnitudes)
// ---------------------------------------------------------------------------

// Local ordinal rankings, used *only* for comparison (argmax / >=). These
// are NOT a weighted sum and NOT a numeric→categorical mapping. The enum
// values themselves (NONE/MINOR/MODERATE/MAJOR, etc.) are config-supplied;
// this just asserts a total order over them so `>=` and `argmax` are
// well-defined. If a future Severity or Leverage value is added, its rank
// must be inserted here — the exhaustiveness is enforced by the Record type.

const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  NONE: 0,
  MINOR: 1,
  MODERATE: 2,
  MAJOR: 3,
};

const LEVERAGE_RANK: Readonly<Record<Leverage, number>> = {
  NONE: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
};

const WEIGHT_RANK: Readonly<Record<Weight, number>> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

// ---------------------------------------------------------------------------
// Ranking (ARCH-063 / B1)
// ---------------------------------------------------------------------------
//
// Before B1 the headline was the first axis, in axis order, with the highest leverage. Production loads muscle
// groups sorted by name, so among tied Lows the headline was alphabetical ("biceps" for a program with no pulling
// at all). Now every not-good axis is ranked by one lexicographic key, so the order is total and deterministic:
//
//   1. leverage, highest first                         (unchanged)
//   2. axis weight, highest first                      (separates axis TYPES that tie on leverage; the weights
//                                                       are already ordered by evidence strength)
//   3. axis type, in the order the Analysis lists them (VOLUME, FREQUENCY, SELECTION, PROGRESSION, RECOVERY)
//   4. deficit, largest first                          (only ever compared within one axis type, see below)
//   5. the profile's `musclePriority`, earlier first   (Tier 3: breaks a deficit tie between muscles)
//   6. original axis order
//
// Deficit is how far the metric sits from the nearest band the profile calls good (severity NONE), read from the
// profile's own band bounds. It is a tie-break key, not a threshold: it never creates, moves or re-grades a band,
// a severity or a leverage, and it is never summed or averaged.

interface RankedAxis {
  readonly axis: AssessedAxis;
  readonly index: number;
  readonly typeOrder: number;
  readonly deficit: number;
  readonly priority: number;
}

/**
 * Distance from `axis.metricValue` to the nearest band whose severity is NONE; 0 when the metric is not a
 * number, when no such band exists, or when it already sits inside one. A VOLUME Low is `lowerBound - value`
 * of the Adequate band; an Excessive one is `value - upperBound` of the High band. Rounded so that two equal
 * deficits computed from different floats still compare equal.
 */
function deficitOf(axis: AssessedAxis, config: GoalProfileConfig): number {
  if (typeof axis.metricValue !== "number") return 0;
  const value = axis.metricValue;
  const severityRow = config.severityMap[axis.axisType] ?? {};
  let nearest = Number.POSITIVE_INFINITY;
  for (const band of config.statusBands[axis.axisType] ?? []) {
    if (severityRow[band.status] !== "NONE") continue;
    const { lowerBound: lo, upperBound: hi } = band;
    if (lo === null && hi === null) continue; // placeholder band (N/A): no real extent
    const distance = lo !== null && value < lo ? lo - value : hi !== null && value >= hi ? value - hi : 0;
    if (distance < nearest) nearest = distance;
  }
  return Number.isFinite(nearest) ? Math.round(nearest * 1e6) / 1e6 : 0;
}

/** Position in `config.musclePriority`; a name not listed ranks after every listed one; no list ranks all equal. */
function priorityOf(axis: AssessedAxis, config: GoalProfileConfig): number {
  const list = config.musclePriority;
  if (list === undefined) return 0;
  const at = axis.scopeKey === null ? -1 : list.indexOf(axis.scopeKey);
  return at < 0 ? list.length : at;
}

function compareRanked(a: RankedAxis, b: RankedAxis): number {
  return (
    LEVERAGE_RANK[b.axis.leverage] - LEVERAGE_RANK[a.axis.leverage] ||
    WEIGHT_RANK[b.axis.weight] - WEIGHT_RANK[a.axis.weight] ||
    a.typeOrder - b.typeOrder ||
    b.deficit - a.deficit ||
    a.priority - b.priority ||
    a.index - b.index
  );
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

interface ClassifiedAxes {
  readonly strengths: readonly AssessedAxis[];
  readonly attentionAreas: readonly AssessedAxis[];
  readonly biggestOpportunity: AssessedAxis | null;
  readonly actions: readonly ActionSuggestion[];
  /** B2: the surfaced findings, headline first. `biggestOpportunity` / `attentionAreas` are their lead axes. */
  readonly findings: readonly AssessmentFinding[];
  /** The headline finding's name for the summary sentence; null when there is no headline. */
  readonly headlineLabel: string | null;
}

/**
 * Classify a *fully rolled-up* set of axes into the four surfaced categories.
 *
 * Important: this function is only called when `rollUpLeverage` returned OK
 * AND `config.validated === true`. Calling it on a partial roll-up would
 * produce a narrative that silently omits whichever axes failed to resolve —
 * exactly the failure mode invariant 8 forbids. The caller is responsible
 * for the guard; see `computeAssessment`.
 */
function classifyAxes(
  assessedAxes: readonly AssessedAxis[],
  config: GoalProfileConfig,
): ClassifiedAxes {
  // Strengths (E2 fix): a NONE-severity axis is a Strength only if its axis
  // type is listed in `strengthEligibleAxes`. FREQUENCY and RECOVERY_COST
  // are deliberately excluded — "once-weekly frequency" and "low recovery
  // cost" are not accomplishments for hypertrophy. Axes that are NONE but
  // not eligible are dropped from both lists: not a Strength, not a
  // problem. They remain visible in `allAssessedAxes` for the Fit Score.
  const eligible = new Set<AxisType>(config.strengthEligibleAxes);
  const typeOrder = new Map<AxisType, number>();
  assessedAxes.forEach((axis, index) => {
    if (!typeOrder.has(axis.axisType)) typeOrder.set(axis.axisType, index);
  });
  const strengths: AssessedAxis[] = [];
  const ranked: RankedAxis[] = [];
  assessedAxes.forEach((axis, index) => {
    if (axis.severity === "NONE") {
      if (eligible.has(axis.axisType)) strengths.push(axis);
      // else: silently dropped — not a Strength, not a problem.
    } else {
      ranked.push({
        axis,
        index,
        typeOrder: typeOrder.get(axis.axisType) ?? index,
        deficit: deficitOf(axis, config),
        priority: priorityOf(axis, config),
      });
    }
  });
  // B1: not-good axes, best candidate first. Strengths keep the Analysis order.
  const notGood: AssessedAxis[] = ranked.sort(compareRanked).map((r) => r.axis);

  // B2: one finding per underlying problem (see findings.ts). A region with several Lows is one finding; a
  // missing pattern group is one; a FREQUENCY "no exposure" for a muscle that already has a VOLUME Low is
  // dropped. The axes stay in allAssessedAxes; only what is SURFACED is grouped. `findings` is ordered by the
  // rank of each finding's lead axis.
  const found = composeFindings(assessedAxes, notGood, config);

  // Biggest Opportunity: the first-ranked finding, EXCLUDING one whose lead has NONE leverage (E1 fix). A MINOR
  // severity on a LOW weight axis maps to NONE in the leverage table; such an axis carries no leverage and
  // cannot be the headline. `found` is ordered by leverage first, so if its first lead has NONE leverage none
  // qualifies and the headline stays null. B1: ties on leverage are broken by weight, then deficit, then muscle
  // priority, not by axis order alone (alphabetical, for muscles in production).
  const first = found[0];
  const biggestFinding: AssessmentFinding | null =
    first !== undefined && LEVERAGE_RANK[first.lead.leverage] > LEVERAGE_RANK["NONE"] ? first : null;

  // Attention areas: the remaining findings whose lead severity clears the profile's materiality threshold. The
  // Biggest Opportunity is excluded; it is already surfaced under its own field.
  //
  // Phase 10.2 dedup: two findings that map to the same action root cause are ONE problem, not two. The seen set
  // is seeded with the headline's root cause so a duplicate of the headline never appears beside it. (E6 gave
  // FREQUENCY its own root cause, so a muscle's VOLUME Low and FREQUENCY "no exposure" no longer fold here;
  // composeFindings drops the zero-exposure one instead.)
  const materialityRank = SEVERITY_RANK[config.materialitySeverityThreshold];
  const rootCauseOf = (finding: AssessmentFinding): string =>
    actionForFinding(finding, config)?.rootCauseKey ?? finding.key;

  const seenRootCauses = new Set<string>();
  if (biggestFinding) seenRootCauses.add(rootCauseOf(biggestFinding));

  const attentionFindings: AssessmentFinding[] = [];
  for (const finding of found) {
    if (finding === biggestFinding) continue;
    if (SEVERITY_RANK[finding.lead.severity] < materialityRank) continue;
    const key = rootCauseOf(finding);
    if (seenRootCauses.has(key)) continue;
    seenRootCauses.add(key);
    attentionFindings.push(finding);
  }

  const surfaced: AssessmentFinding[] = [...(biggestFinding ? [biggestFinding] : []), ...attentionFindings];

  // Actions: one per surfaced finding (headline first, then attention areas), deduplicated by rootCauseKey.
  // Ordering the headline first means that when two findings share a rootCauseKey the surviving action's
  // `relatedAxis` is the one the narrative headlines as the priority.
  const seen = new Set<string>();
  const actions: ActionSuggestion[] = [];
  for (const finding of surfaced) {
    const template = actionForFinding(finding, config);
    if (!template) continue;
    if (seen.has(template.rootCauseKey)) continue;
    seen.add(template.rootCauseKey);
    actions.push({
      relatedAxis: finding.lead,
      description: template.description,
      rootCauseKey: template.rootCauseKey,
    });
  }

  return {
    strengths,
    attentionAreas: attentionFindings.map((f) => f.lead),
    biggestOpportunity: biggestFinding ? biggestFinding.lead : null,
    actions,
    findings: surfaced,
    headlineLabel: biggestFinding ? biggestFinding.key : null,
  };
}

// ---------------------------------------------------------------------------
// Summary sentence
// ---------------------------------------------------------------------------

function buildOverallSummary(
  strengths: readonly AssessedAxis[],
  attentionAreas: readonly AssessedAxis[],
  headlineLabel: string | null,
): string {
  if (strengths.length === 0 && attentionAreas.length === 0 && headlineLabel === null) {
    return "No material strengths, attention areas, or opportunities identified.";
  }
  const parts: string[] = [];
  if (strengths.length > 0) {
    parts.push(`${strengths.length} strength${strengths.length === 1 ? "" : "s"}`);
  }
  if (attentionAreas.length > 0) {
    parts.push(
      `${attentionAreas.length} attention area${attentionAreas.length === 1 ? "" : "s"}`,
    );
  }
  if (headlineLabel !== null) {
    parts.push(`biggest opportunity on ${headlineLabel}`);
  }
  return `Identified ${parts.join(", ")}.`;
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

export function computeAssessment(
  analysis: Analysis,
  config: GoalProfileConfig,
  options: ComputeAssessmentOptions,
): AssessmentResult {
  const rollUp = rollUpLeverage(analysis, config);

  const rollUpSucceeded = rollUp.kind === "OK";
  const overallValidated = rollUpSucceeded && config.validated;

  // Classification is only run when the whole roll-up succeeded. When it
  // didn't, the inner Assessment carries the partial assessed axes (for
  // inspection) but no classifications, so a consumer that unwraps the
  // union cannot mistake a partial result for a real one.
  const classified: ClassifiedAxes = rollUpSucceeded
    ? classifyAxes(rollUp.assessedAxes, config)
    : {
        strengths: [],
        attentionAreas: [],
        biggestOpportunity: null,
        actions: [],
        findings: [],
        headlineLabel: null,
      };

  const inner: Assessment = {
    programVersionId: analysis.programVersionId,
    goalId: options.goalId,
    overallSummary: buildOverallSummary(
      classified.strengths,
      classified.attentionAreas,
      classified.headlineLabel,
    ),
    strengths: classified.strengths,
    attentionAreas: classified.attentionAreas,
    biggestOpportunity: classified.biggestOpportunity,
    actions: classified.actions,
    findings: classified.findings,
    thresholdsValidated: overallValidated,
    computedAt: analysis.computedAt,
    allAssessedAxes: rollUp.assessedAxes,
    fitScoreProjection: config.fitScoreProjection,
    // Informational; copied through untouched. Nothing above reads it.
    ...(analysis.ratios ? { ratios: analysis.ratios } : {}),
  };

  if (overallValidated) {
    return { kind: "VALIDATED", assessment: inner };
  }

  const reason =
    rollUp.kind === "BLOCKED"
      ? rollUp.reason
      : `Goal profile "${config.goalProfileKey}" is not validated (${config.sourceNote}).`;

  return { kind: "UNVALIDATED", reason, assessment: inner };
}