// packages/domain/src/mutation/diff-assessments.ts
//
// diffAssessments — the pure comparison of two AssessmentResults into the
// Gain/Cost/Net + What-Changed payload the simulation surfaces.
//
// PURE: no I/O, no Prisma, no HTTP, no session. Same inputs → same outputs.
//
// Invariants this file participates in:
//
//   - Invariant 8 (Fit Score derives from the same leverage roll-up as the
//     qualitative narrative). This file computes Fit Score for both sides
//     via computeFitScore — never a second score derivation.
//
//   - Invariant 1 (deterministic engine is the sole source of quantitative
//     truth). No number here is invented. Gain/Cost are classifications of
//     axes the engine already assessed; Net is a rank comparison over the
//     leverages the engine already produced.
//
// Design notes:
//
//   - A mutation that changes a prescription but produces no leverage-visible
//     change yields `meaningful: false` and `net: NO_MEANINGFUL_CHANGE`. The
//     UI renders that directly rather than fabricating "no change" or "small
//     improvement".
//
//   - Net is leverage-aware, not count-based (07-versioning-and-simulation.md
//     §"Net respects leverage"). A single Gain on a HIGH-leverage axis
//     outweighs two Costs on NONE-leverage axes; the converse is also true.
//     The rule below sums the *leverage delta* per side — the magnitude of
//     each move, not the raw mutated leverage rank. This is what makes a
//     symmetric HIGH→NONE / NONE→HIGH trade classify as MIXED rather than
//     NEGATIVE (the raw-rank sum would score such a trade 0 vs. 3).
//     Rank differences only; no ordinal→numeric magnitude mapping.
//
//   - The caller (simulate.ts) has already guaranteed both inputs are
//     VALIDATED. Reaching this file with an UNVALIDATED input is a programmer
//     error, not a user-facing condition: it throws.

import { computeFitScore } from "../assessment/computeFitScore";
import type {
  AssessedAxis,
  Assessment,
  AssessmentResult,
} from "../assessment/types";
import type { Leverage } from "../analysis/types";
import type {
  SimulationNet,
  WhatChangedResult,
} from "./types";

// Rank table — comparison-only, no magnitudes. The values are consistent
// with the private table in assessment/computeAssessment.ts and with the
// ordinal array carried on `FitScoreProjection`. A shared export would be a
// stronger guarantee but a wider refactor than Phase 5 warrants; the table
// is small and its shape is fixed by the Leverage union. If a new Leverage
// literal is added to ../analysis/types.ts, this table (and the ones in
// computeAssessment.ts / the shipped fitScoreProjection) must be updated
// together.

const LEVERAGE_RANK: Readonly<Record<Leverage, number>> = {
  NONE: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
};

/**
 * The stable identity of an axis within an Assessment. Matches the key used
 * by AssessmentDisplay (apps/web/components/assessment/AssessmentDisplay.tsx)
 * and by actionTemplates' rootCauseKey prefix — the shape `<axisType>:<scopeKey>`
 * with an empty scopeKey for program-wide axes (e.g. `RECOVERY_COST:`).
 */
function axisKey(axis: AssessedAxis): string {
  return `${axis.axisType}:${axis.scopeKey ?? ""}`;
}

export interface AssessmentDiff {
  gain: AssessedAxis[];
  cost: AssessedAxis[];
  net: SimulationNet;
  whatChanged: WhatChangedResult;
}

/**
 * Compare two VALIDATED assessments. Both inputs must be the `VALIDATED`
 * variant of AssessmentResult; the function throws on anything else.
 *
 * The two axes lists are matched by axisKey. An axis present in only one
 * side is ignored for Gain/Cost (it did not "change" — it appeared or
 * disappeared from the assessed set, which the analysis engine would only
 * do if the structure change removed the last stimulus for that muscle
 * group; that edge case is deliberately not classified as gain or cost,
 * because "this axis stopped being measured" is not the same as "this axis
 * improved"). The absence is visible in the statusTransitions list only
 * when the axis is present on both sides.
 */
export function diffAssessments(
  base: AssessmentResult,
  mutated: AssessmentResult,
): AssessmentDiff {
  if (base.kind === "UNVALIDATED" || mutated.kind === "UNVALIDATED") {
    throw new Error(
      "diffAssessments: both assessments must be VALIDATED. " +
        "Callers must return CANNOT_COMPUTE before reaching here.",
    );
  }

  const baseA: Assessment = base.assessment;
  const mutatedA: Assessment = mutated.assessment;

  // Index the mutated axes for O(1) lookup. Base axis order drives iteration
  // so the output is deterministic regardless of Map insertion order.
  const mutatedByKey = new Map<string, AssessedAxis>();
  for (const axis of mutatedA.allAssessedAxes) {
    mutatedByKey.set(axisKey(axis), axis);
  }

  const gain: AssessedAxis[] = [];
  const cost: AssessedAxis[] = [];
  const statusTransitions: WhatChangedResult["statusTransitions"] = [];

  // Leverage-delta accumulators. Each gain contributes the magnitude of its
  // improvement (baseRank − mutatedRank); each cost contributes the
  // magnitude of its worsening (mutatedRank − baseRank). Using the delta,
  // not the raw mutated rank, is what makes a symmetric HIGH↔NONE trade
  // score equal on both sides (3 vs. 3) and classify as MIXED rather than
  // NEGATIVE.
  let gainScore = 0;
  let costScore = 0;

  for (const baseAxis of baseA.allAssessedAxes) {
    const key = axisKey(baseAxis);
    const mutatedAxis = mutatedByKey.get(key);
    if (mutatedAxis === undefined) continue;

    // Leverage comparison, not severity. An axis whose severity worsened but
    // whose weight is low enough that its leverage stayed NONE is NOT a cost
    // — the whole point of the leverage roll-up is that the weight is what
    // makes a change matter (invariant 8's rule extended to the diff).
    const baseLevRank = LEVERAGE_RANK[baseAxis.leverage];
    const mutatedLevRank = LEVERAGE_RANK[mutatedAxis.leverage];
    if (mutatedLevRank < baseLevRank) {
      gain.push(mutatedAxis);
      gainScore += baseLevRank - mutatedLevRank;
    } else if (mutatedLevRank > baseLevRank) {
      cost.push(mutatedAxis);
      costScore += mutatedLevRank - baseLevRank;
    }

    // Status transitions are independent of leverage change: an axis can
    // move bands without crossing a leverage threshold (e.g. Low → Adequate
    // when both map to Severity NONE, hence Leverage NONE). The band name
    // change is still reportable to a user reading What-Changed.
    if (baseAxis.status.band !== mutatedAxis.status.band) {
      statusTransitions.push({
        axisKey: key,
        from: baseAxis.status.band,
        to: mutatedAxis.status.band,
      });
    }
  }

  // ── Net ───────────────────────────────────────────────────────────────────
  //
  // Leverage-delta sum per side. Deliberately not "gain.length > cost.length":
  // two LOW-leverage gains (delta 1 each) should not outweigh one HIGH-leverage
  // cost (delta 3), and the delta sum makes that explicit. Ties with both
  // sides non-zero are MIXED; ties at zero are NO_MEANINGFUL_CHANGE.
  let net: SimulationNet;
  if (gainScore === 0 && costScore === 0) {
    net = "NO_MEANINGFUL_CHANGE";
  } else if (gainScore > costScore) {
    net = "POSITIVE";
  } else if (costScore > gainScore) {
    net = "NEGATIVE";
  } else {
    net = "MIXED";
  }

  // ── Membership changes ────────────────────────────────────────────────────
  //
  // An axis can be in multiple surfaced sets simultaneously? No — the
  // classification in computeAssessment makes the three sets disjoint
  // (Strengths = NONE severity; Attention = severity ≥ materiality threshold
  // excluding Biggest Opportunity; Biggest Opportunity = argmax leverage
  // among non-NONE). But an axis CAN enter one set while leaving another
  // (e.g. an axis was Attention, became Strength). Both facts are reported
  // separately so a reader sees the full move.
  const membershipChanges: WhatChangedResult["membershipChanges"] = [];

  const baseStrengthKeys = new Set(baseA.strengths.map(axisKey));
  const mutatedStrengthKeys = new Set(mutatedA.strengths.map(axisKey));
  const baseAttentionKeys = new Set(baseA.attentionAreas.map(axisKey));
  const mutatedAttentionKeys = new Set(mutatedA.attentionAreas.map(axisKey));
  const baseOppKey =
    baseA.biggestOpportunity !== null ? axisKey(baseA.biggestOpportunity) : null;
  const mutatedOppKey =
    mutatedA.biggestOpportunity !== null
      ? axisKey(mutatedA.biggestOpportunity)
      : null;

  // Deterministic ordering: iterate the mutated set for ADDED (so the order
  // tracks the mutated assessment's axis order), then the base set for
  // REMOVED. Sets preserve insertion order in JS (Map/Set iteration order is
  // insertion order for non-numeric keys), so this is deterministic.
  for (const k of mutatedStrengthKeys) {
    if (!baseStrengthKeys.has(k)) {
      membershipChanges.push({ set: "STRENGTHS", axisKey: k, change: "ADDED" });
    }
  }
  for (const k of baseStrengthKeys) {
    if (!mutatedStrengthKeys.has(k)) {
      membershipChanges.push({ set: "STRENGTHS", axisKey: k, change: "REMOVED" });
    }
  }
  for (const k of mutatedAttentionKeys) {
    if (!baseAttentionKeys.has(k)) {
      membershipChanges.push({ set: "ATTENTION", axisKey: k, change: "ADDED" });
    }
  }
  for (const k of baseAttentionKeys) {
    if (!mutatedAttentionKeys.has(k)) {
      membershipChanges.push({ set: "ATTENTION", axisKey: k, change: "REMOVED" });
    }
  }
  if (mutatedOppKey !== null && mutatedOppKey !== baseOppKey) {
    membershipChanges.push({
      set: "BIGGEST_OPPORTUNITY",
      axisKey: mutatedOppKey,
      change: "ADDED",
    });
  }
  if (baseOppKey !== null && baseOppKey !== mutatedOppKey) {
    membershipChanges.push({
      set: "BIGGEST_OPPORTUNITY",
      axisKey: baseOppKey,
      change: "REMOVED",
    });
  }

  // ── Overall band shift (Fit Score) ────────────────────────────────────────
  //
  // The Fit Score is the only "overall" categorical in the assessment. Both
  // sides are guaranteed VALIDATED here (the union guard at the top of the
  // function ran, and computeFitScore's UNVALIDATED branch is unreachable
  // when the input assessment is VALIDATED). If a future engine version
  // changes that contract, the guards below degrade to `null` rather than
  // throwing — an un-shifted overall band is the safe default.
  let overallBandShift: WhatChangedResult["overallBandShift"] = null;
  const baseFit = computeFitScore(base);
  const mutatedFit = computeFitScore(mutated);
  if (baseFit.kind === "VALIDATED" && mutatedFit.kind === "VALIDATED") {
    if (baseFit.fitScore.band !== mutatedFit.fitScore.band) {
      overallBandShift = {
        from: baseFit.fitScore.band,
        to: mutatedFit.fitScore.band,
      };
    }
  }

  // ── Trade-offs ────────────────────────────────────────────────────────────
  //
  // Purely descriptive: every (gain, cost) cross-product when both sides are
  // non-empty. Deliberately not filtered by leverage — a HIGH-leverage gain
  // against a NONE-leverage cost is still a trade-off a user can be shown,
  // even though the net is unambiguously POSITIVE. Consumers that only want
  // "real" trade-offs (both sides cleared the materiality threshold) can
  // filter further; the domain surface is the full cross-product so nothing
  // is silently dropped.
  const tradeOffs: WhatChangedResult["tradeOffs"] = [];
  if (gain.length > 0 && cost.length > 0) {
    for (const g of gain) {
      for (const c of cost) {
        tradeOffs.push({ improved: axisKey(g), worsened: axisKey(c) });
      }
    }
  }

  // ── Meaningful? ───────────────────────────────────────────────────────────
  //
  // Per 07-versioning-and-simulation.md §"meaningful change": a change is
  // meaningful iff at least one of (status transition, membership change,
  // overall band shift, genuine trade-off) occurred.
  //
  // tradeOffs is non-empty iff gain.length > 0 AND cost.length > 0 — so the
  // check below is equivalent to "any of the three lists is non-empty or the
  // overall band moved".
  const meaningful =
    statusTransitions.length > 0 ||
    membershipChanges.length > 0 ||
    overallBandShift !== null ||
    tradeOffs.length > 0;

  // When nothing meaningful happened, force NO_MEANINGFUL_CHANGE even if the
  // raw gain/cost lists are non-empty. This can only happen if every non-empty
  // list produced no *reported* change — e.g. an axis moved from Low to
  // Adequate but its leverage was NONE on both sides (gain/cost lists stay
  // empty there, so this branch is defensive rather than reachable today).
  if (!meaningful) {
    net = "NO_MEANINGFUL_CHANGE";
  }

  return {
    gain,
    cost,
    net,
    whatChanged: {
      meaningful,
      statusTransitions,
      membershipChanges,
      overallBandShift,
      tradeOffs,
    },
  };
}