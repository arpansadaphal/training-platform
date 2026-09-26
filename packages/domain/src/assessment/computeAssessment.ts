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
//        Strengths        = axes whose severity is NONE (in good status).
//        BiggestOpportunity = argmax(leverage) among axes NOT in good status.
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

import type { Analysis, GoalProfileConfig, Leverage, Severity } from "../analysis/types";
import { actionTemplateFor } from "./actionTemplates";
import { rollUpLeverage } from "./rollup";
import type {
  ActionSuggestion,
  AssessedAxis,
  Assessment,
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

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

interface ClassifiedAxes {
  readonly strengths: readonly AssessedAxis[];
  readonly attentionAreas: readonly AssessedAxis[];
  readonly biggestOpportunity: AssessedAxis | null;
  readonly actions: readonly ActionSuggestion[];
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
  // Strengths: axes in good status. "Good status" is `severity === NONE` —
  // the axis is in-band and needs nothing. 06-assessment-engine.md also
  // mentions "high-weight" axes here, but the worked-example fixture's Back
  // axis is `severity NONE, weight LOW` and is a Strength, so the operative
  // qualifier is status, not weight. Documented as a deliberate reading.
  const strengths: AssessedAxis[] = [];
  const notGood: AssessedAxis[] = [];
  for (const axis of assessedAxes) {
    if (axis.severity === "NONE") strengths.push(axis);
    else notGood.push(axis);
  }

  // Biggest Opportunity: argmax(leverage) among axes NOT in good status.
  // First-wins on ties, in the original axis order — deterministic.
  let biggestOpportunity: AssessedAxis | null = null;
  let biggestRank = -1;
  for (const axis of notGood) {
    const r = LEVERAGE_RANK[axis.leverage];
    if (r > biggestRank) {
      biggestRank = r;
      biggestOpportunity = axis;
    }
  }

  // Attention areas: remaining not-good axes whose severity clears the
  // profile's materiality threshold. The Biggest Opportunity is excluded —
  // it is already surfaced under its own field (06 step 4 vs. step 6 in the
  // worked example: Chest is Biggest Opportunity, Recovery is Attention).
  const materialityRank = SEVERITY_RANK[config.materialitySeverityThreshold];
  const attentionAreas = notGood.filter((axis) => {
    if (axis === biggestOpportunity) return false;
    return SEVERITY_RANK[axis.severity] >= materialityRank;
  });

  // Actions: one per surfaced axis (biggest opportunity first, then
  // attention areas), deduplicated by rootCauseKey. Ordering the biggest
  // opportunity first means that when two axes share a rootCauseKey (e.g.
  // "chest volume Low" and "chest frequency Low" both emitting
  // `volume:add-chest`), the surviving action's `relatedAxis` is the one
  // the narrative headlines as the priority. The dedup collapses
  // volume-side and frequency-side fixes into a single action — see
  // actionTemplates.ts.
  const candidates: AssessedAxis[] = [
    ...(biggestOpportunity ? [biggestOpportunity] : []),
    ...attentionAreas,
  ];
  const seen = new Set<string>();
  const actions: ActionSuggestion[] = [];
  for (const axis of candidates) {
    const template = actionTemplateFor(axis, config.goalProfileKey);
    if (!template) continue;
    if (seen.has(template.rootCauseKey)) continue;
    seen.add(template.rootCauseKey);
    actions.push({
      relatedAxis: axis,
      description: template.description,
      rootCauseKey: template.rootCauseKey,
    });
  }

  return { strengths, attentionAreas, biggestOpportunity, actions };
}

// ---------------------------------------------------------------------------
// Summary sentence
// ---------------------------------------------------------------------------

function buildOverallSummary(
  strengths: readonly AssessedAxis[],
  attentionAreas: readonly AssessedAxis[],
  biggestOpportunity: AssessedAxis | null,
): string {
  if (strengths.length === 0 && attentionAreas.length === 0 && !biggestOpportunity) {
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
  if (biggestOpportunity) {
    const label = biggestOpportunity.scopeKey
      ? `${biggestOpportunity.axisType}:${biggestOpportunity.scopeKey}`
      : biggestOpportunity.axisType;
    parts.push(`biggest opportunity on ${label}`);
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
      };

  const inner: Assessment = {
    programVersionId: analysis.programVersionId,
    goalId: options.goalId,
    overallSummary: buildOverallSummary(
      classified.strengths,
      classified.attentionAreas,
      classified.biggestOpportunity,
    ),
    strengths: classified.strengths,
    attentionAreas: classified.attentionAreas,
    biggestOpportunity: classified.biggestOpportunity,
    actions: classified.actions,
    thresholdsValidated: overallValidated,
    computedAt: analysis.computedAt,
    allAssessedAxes: rollUp.assessedAxes,
    fitScoreProjection: config.fitScoreProjection,
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