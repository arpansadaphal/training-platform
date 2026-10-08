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
//        BiggestOpportunity = argmax(leverage) among axes NOT in good status,
//                           EXCLUDING axes whose leverage is NONE (see E1).
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
} from "../analysis/types";
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
  // Strengths (E2 fix): a NONE-severity axis is a Strength only if its axis
  // type is listed in `strengthEligibleAxes`. FREQUENCY and RECOVERY_COST
  // are deliberately excluded — "once-weekly frequency" and "low recovery
  // cost" are not accomplishments for hypertrophy. Axes that are NONE but
  // not eligible are dropped from both lists: not a Strength, not a
  // problem. They remain visible in `allAssessedAxes` for the Fit Score.
  const eligible = new Set<AxisType>(config.strengthEligibleAxes);
  const strengths: AssessedAxis[] = [];
  const notGood: AssessedAxis[] = [];
  for (const axis of assessedAxes) {
    if (axis.severity === "NONE") {
      if (eligible.has(axis.axisType)) strengths.push(axis);
      // else: silently dropped — not a Strength, not a problem.
    } else {
      notGood.push(axis);
    }
  }

  // Biggest Opportunity (E1 fix): argmax(leverage) among axes NOT in good
  // status, EXCLUDING axes whose leverage is NONE. Previously the running
  // rank started at -1, so an axis whose leverage was NONE could win — a
  // MINOR severity on a LOW weight axis maps to NONE in the leverage table,
  // and that axis was being surfaced as the headline opportunity even
  // though it carries no leverage. Now such axes cannot win; if no not-good
  // axis reaches LOW leverage or higher, biggestOpportunity stays null.
  // First-wins on ties, in original axis order — deterministic.
  let biggestOpportunity: AssessedAxis | null = null;
  let biggestRank = LEVERAGE_RANK["NONE"]; // 0 — excludes NONE-leverage axes
  for (const axis of notGood) {
    const r = LEVERAGE_RANK[axis.leverage];
    if (r > biggestRank) {
      biggestRank = r;
      biggestOpportunity = axis;
    }
  }

    // Attention areas: remaining not-good axes whose severity clears the
  // profile's materiality threshold. The Biggest Opportunity is excluded —
  // it is already surfaced under its own field.
  //
  // Phase 10.2 dedup: two axes that map to the same action root cause
  // (e.g. VOLUME:chest and FREQUENCY:chest both → volume:add-chest) are
  // ONE problem, not two. A muscle at zero weekly sets is also at zero
  // weekly sessions, and surfacing it twice inflates the attention list
  // without adding information. This applies the same root-cause dedup
  // that the actions list below already uses.
  //
  // The seen set is seeded with the biggest opportunity's root cause so a
  // duplicate FREQUENCY finding for the biggest-opportunity muscle does not
  // appear alongside the VOLUME finding that is the headline.
  const materialityRank = SEVERITY_RANK[config.materialitySeverityThreshold];
  const attentionCandidates = notGood.filter((axis) => {
    if (axis === biggestOpportunity) return false;
    return SEVERITY_RANK[axis.severity] >= materialityRank;
  });

  const seenRootCauses = new Set<string>();
  if (biggestOpportunity) {
    const t = actionTemplateFor(biggestOpportunity, config.goalProfileKey);
    if (t) seenRootCauses.add(t.rootCauseKey);
  }

  const attentionAreas: AssessedAxis[] = [];
  for (const axis of attentionCandidates) {
    const template = actionTemplateFor(axis, config.goalProfileKey);
    const key =
      template?.rootCauseKey ?? `${axis.axisType}:${axis.scopeKey ?? ""}`;
    if (seenRootCauses.has(key)) continue;
    seenRootCauses.add(key);
    attentionAreas.push(axis);
  }

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