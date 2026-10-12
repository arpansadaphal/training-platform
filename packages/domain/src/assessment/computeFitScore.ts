// packages/domain/src/assessment/computeFitScore.ts
//
// computeFitScore — derives a coarse Fit Score band from an AssessmentResult's leverage roll-up.
//
// Structural guarantee (invariant 8, 06-assessment-engine.md §"Fit Score — guaranteed consistent by
// construction"):
//
//   The ONLY input is an already-computed Assessment. There is no alternate code path that reads Analysis
//   directly to produce a number. The Fit Score cannot disagree with the qualitative narrative, because it
//   has no independent access to the underlying data: it is a coarse ordinal projection of the leverage
//   roll-up (`assessment.allAssessedAxes`) that already produced the narrative.
//
// E11 (engine 0.4.0): breadth-aware projection. Two ordinal stages; no numeric score at any point.
//
//   1. BASE BAND (unchanged since 0.3.0). The WORST single leverage across allAssessedAxes, mapped through
//      fitScoreProjection.worstLeverageToBand.
//
//   2. BREADTH FLOORS (optional: fitScoreProjection.breadth). Each floor reads
//
//        "at least `minCount` findings at `leverageAtLeast` or worse  ->  the band is no better than `band`"
//
//      A FINDING is an assessed axis whose leverage clears the floor AND whose severity is at least
//      `breadth.findingMinSeverity`. That severity bar is the same materiality bar that decides which axes
//      the narrative lists as attention areas, so every finding that can move the band is one the narrative
//      can show (the Fit band never needs a reason the page does not display). The final band is the WORST
//      of the base band and every triggered floor.
//
// Properties (each pinned in __tests__/fit-score.test.ts):
//   - Monotone. Floors only ever make the band worse; the result is never better than the base band, so
//     breadth cannot hide a high-leverage axis.
//   - Cumulative. A HIGH finding also counts toward a floor set at MODERATE or LOW.
//   - Reversible by config. `breadth` absent, or `floors: []`, reproduces the 0.3.0 projection exactly.
//   - Ordinal. Counts are compared with integer thresholds and then discarded; no weighted sum, no average,
//     no ordinal-to-numeric mapping.
//   - Pure and deterministic. No clock, no I/O, no Analysis.
//
// UNVALIDATED assessments never reach the projection: the Fit Score is UNVALIDATED for the same reason (a
// fabricated band for an unvalidated profile is the same class of bug as a fabricated band name for an
// unvalidated axis, ARCH-028).
//
// Indexed-access note: the project's tsconfig has `noUncheckedIndexedAccess` on, so the scan is seeded from
// the first actual assessed axis rather than from an asserted `[0]`. An empty `allAssessedAxes` on a
// VALIDATED assessment is an upstream bug (computeAssessment only returns VALIDATED when the roll-up
// succeeded), so it throws rather than fabricating a band.

import type {
  FitBreadthFloor,
  FitScoreBand,
  Leverage,
  Severity,
} from "../analysis/types";
import type { Assessment, AssessmentResult, FitScoreResult } from "./types";

// Local ordinal rankings, comparison-only (same discipline as computeAssessment.ts). The Records are
// exhaustive over the closed unions, so adding a band or severity is a compile error here until ranked.
const BAND_RANK: Readonly<Record<FitScoreBand, number>> = {
  STRONG: 0,
  DECENT: 1,
  NEEDS_WORK: 2,
};

const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  NONE: 0,
  MINOR: 1,
  MODERATE: 2,
  MAJOR: 3,
};

/** The worse (higher-ranked) of two bands. */
function worseBand(a: FitScoreBand, b: FitScoreBand): FitScoreBand {
  return BAND_RANK[b] > BAND_RANK[a] ? b : a;
}

/** Position in the config's best-to-worst ordinal. Throws on a leverage the config does not list. */
function rankOf(ordinal: readonly Leverage[], leverage: Leverage): number {
  const rank = ordinal.indexOf(leverage);
  if (rank < 0) {
    throw new Error(
      `computeFitScore: leverage "${leverage}" is not listed in fitScoreProjection.leverageOrdinal ` +
        `[${ordinal.join(", ")}] (config inconsistency)`,
    );
  }
  return rank;
}

/** Why the band is what it is: the base band, and which breadth floors (if any) fired. */
export interface FitBandProjection {
  readonly band: FitScoreBand;
  /** The band from the worst single leverage alone (the 0.3.0 rule). */
  readonly baseBand: FitScoreBand;
  /** Floors that triggered, in config order. Empty when `breadth` is absent or nothing fired. */
  readonly triggeredFloors: readonly FitBreadthFloor[];
}

/**
 * The projection behind computeFitScore, exposed so tests (and a future "why this band" surface) can see
 * which rule produced a band. Pure; reads only the Assessment.
 */
export function projectFitBand(assessment: Assessment): FitBandProjection {
  const { leverageOrdinal, worstLeverageToBand, breadth } = assessment.fitScoreProjection;
  const axes = assessment.allAssessedAxes;

  const firstAxis = axes[0];
  if (firstAxis === undefined) {
    // A VALIDATED assessment with zero assessed axes should not exist: computeAssessment only returns
    // VALIDATED when every axis resolved, and a program always produces at least one axis result. Fail
    // loudly rather than fabricate a band for an empty set.
    throw new Error(
      "computeFitScore: VALIDATED assessment has zero assessed axes — " +
        "this is an upstream inconsistency in computeAssessment",
    );
  }

  // Stage 1 — base band: worst single leverage across the FULL roll-up (not the surfaced subset).
  // First-wins on ties; `indexOf` is comparison-only, no magnitudes.
  let worst: Leverage = firstAxis.leverage;
  let worstRank = rankOf(leverageOrdinal, worst);
  for (const axis of axes) {
    const r = rankOf(leverageOrdinal, axis.leverage);
    if (r > worstRank) {
      worst = axis.leverage;
      worstRank = r;
    }
  }
  const baseBand = worstLeverageToBand[worst];

  // Reversibility: no breadth rules means exactly the 0.3.0 projection.
  if (breadth === undefined || breadth.floors.length === 0) {
    return { band: baseBand, baseBand, triggeredFloors: [] };
  }

  // Stage 2 — breadth floors. Findings are axes that clear the severity bar; keep each one's leverage rank.
  const minSeverityRank = SEVERITY_RANK[breadth.findingMinSeverity];
  const findingRanks: number[] = [];
  for (const axis of axes) {
    if (SEVERITY_RANK[axis.severity] >= minSeverityRank) {
      findingRanks.push(rankOf(leverageOrdinal, axis.leverage));
    }
  }

  let band: FitScoreBand = baseBand;
  const triggeredFloors: FitBreadthFloor[] = [];
  breadth.floors.forEach((floor, index) => {
    if (!Number.isInteger(floor.minCount) || floor.minCount < 1) {
      throw new Error(
        `computeFitScore: fitScoreProjection.breadth.floors[${index}].minCount must be an integer >= 1 ` +
          `(got ${String(floor.minCount)})`,
      );
    }
    const floorRank = rankOf(leverageOrdinal, floor.leverageAtLeast);
    // Cumulative: a finding at a worse tier also counts toward a floor set at a better tier.
    const count = findingRanks.filter((r) => r >= floorRank).length;
    if (count >= floor.minCount) {
      triggeredFloors.push(floor);
      band = worseBand(band, floor.band);
    }
  });

  return { band, baseBand, triggeredFloors };
}

export function computeFitScore(result: AssessmentResult): FitScoreResult {
  if (result.kind === "UNVALIDATED") {
    return { kind: "UNVALIDATED", reason: result.reason };
  }

  const { assessment } = result;
  const { band } = projectFitBand(assessment);

  return {
    kind: "VALIDATED",
    fitScore: {
      band,
      derivedFromAssessmentComputedAt: assessment.computedAt,
    },
  };
}