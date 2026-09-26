// packages/domain/src/assessment/computeFitScore.ts
//
// computeFitScore — derives a coarse Fit Score band from an
// AssessmentResult's leverage roll-up.
//
// Structural guarantee (invariant 8, 06-assessment-engine.md §"Fit Score —
// guaranteed consistent by construction"):
//
//   The ONLY input is an already-computed Assessment. There is no alternate
//   code path that reads Analysis directly to produce a number. It is
//   impossible for the Fit Score and the qualitative narrative to disagree,
//   because the score has no independent access to the underlying data — it
//   can only ever be a coarse projection of the leverage roll-up that
//   already produced the narrative.
//
// Derivation is rule-based ordinal projection, config-supplied:
//
//   1. If the assessment is UNVALIDATED, the Fit Score is UNVALIDATED for
//      the same reason. No projection runs — a fabricated band for an
//      unvalidated profile would be the same class of bug as a fabricated
//      band name for an unvalidated axis (ARCH-028).
//   2. Otherwise, find the WORST leverage across `assessment.allAssessedAxes`
//      using the config's `leverageOrdinal` (indexOf comparison — no
//      magnitudes).
//   3. Map that worst leverage to a band via `worstLeverageToBand`.
//
// No weighted sum, no averaging, no ordinal→numeric mapping. The two
// categories (`leverageOrdinal`, `worstLeverageToBand`) are config-supplied
// and provisional, exactly like `severityMap` and `severityWeightTable`.
//
// Indexed-access note: the project's tsconfig has `noUncheckedIndexedAccess`
// on, so `readonly Leverage[]` indexed with `[0]` yields `Leverage | undefined`.
// Rather than cast (`as`) or assert (`!`), this function seeds the "worst"
// scan from the first *actual* assessed axis — which is semantically the
// right starting point anyway, since the initial worst-leverage must be a
// leverage some axis actually had. An empty `allAssessedAxes` on a VALIDATED
// assessment is an upstream bug (computeAssessment only returns VALIDATED
// when the roll-up succeeded), so it throws rather than fabricating a band.

import type { AssessmentResult, FitScoreResult, Leverage } from "./types";

export function computeFitScore(result: AssessmentResult): FitScoreResult {
  if (result.kind === "UNVALIDATED") {
    return { kind: "UNVALIDATED", reason: result.reason };
  }

  const { assessment } = result;
  const { leverageOrdinal, worstLeverageToBand } = assessment.fitScoreProjection;

  const firstAxis = assessment.allAssessedAxes[0];
  if (firstAxis === undefined) {
    // A VALIDATED assessment with zero assessed axes should not exist:
    // computeAssessment only returns VALIDATED when every axis resolved,
    // and a program always produces at least one axis result. Fail loudly
    // rather than fabricate a band for an empty set.
    throw new Error(
      "computeFitScore: VALIDATED assessment has zero assessed axes — " +
        "this is an upstream inconsistency in computeAssessment",
    );
  }

  // First-wins on ties: the scan preserves the original axis order (the
  // roll-up preserves it too), so the result is deterministic. `indexOf`
  // is comparison-only — no magnitudes, per the design (see file header).
  let worst: Leverage = firstAxis.leverage;
  let worstRank = leverageOrdinal.indexOf(worst);
  for (const axis of assessment.allAssessedAxes) {
    const r = leverageOrdinal.indexOf(axis.leverage);
    if (r > worstRank) {
      worst = axis.leverage;
      worstRank = r;
    }
  }

  return {
    kind: "VALIDATED",
    fitScore: {
      band: worstLeverageToBand[worst],
      derivedFromAssessmentComputedAt: assessment.computedAt,
    },
  };
}