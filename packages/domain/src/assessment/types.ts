// packages/domain/src/assessment/types.ts
//
// Assessment-layer types. Pure — no Prisma, no HTTP, no framework imports.
//
// `Severity`, `Weight`, `Leverage`, `SeverityMap`, `SeverityWeightTable`,
// `FitScoreBand`, and `FitScoreProjection` are defined in `../analysis/types`
// (because `GoalProfileConfig` reads them) and re-exported here so consumers
// of the assessment surface have a single import path. Dependency direction
// stays `assessment -> analysis`, unidirectional.
//
// `AssessmentResult` and `FitScoreResult` are discriminated unions, mirroring
// ARCH-028's `AxisStatus` discipline at a higher level: a consumer cannot
// read the assessment's contents without first narrowing on `kind`. This is
// what structurally prevents a caller from rendering an unvalidated
// assessment as if it were validated.
//
// `Assessment` itself is NOT a union — it matches `06-assessment-engine.md`'s
// shape, plus three strict additions (all documented below):
//   * `computedAt`          — needed so `FitScore.derivedFromAssessmentComputedAt`
//                             has a value to carry.
//   * `allAssessedAxes`     — needed so `computeFitScore` reads the same
//                             leverage roll-up the narrative was derived from
//                             (invariant 8). Without it, an axis whose severity
//                             is below materiality but whose leverage is HIGH
//                             could be missed by the Fit Score while visible
//                             nowhere in the narrative.
//   * `fitScoreProjection`  — snapshot of the config's projection, so
//                             `computeFitScore(result)` stays single-parameter
//                             per 06-assessment-engine.md's signature.

import type {
  AnalysisAxisResult,
  AxisStatus,
  FitScoreBand,
  FitScoreProjection,
  Leverage,
  Severity,
  SeverityMap,
  SeverityWeightTable,
  Weight,
} from "../analysis/types";

export type {
  FitScoreBand,
  FitScoreProjection,
  Leverage,
  Severity,
  SeverityMap,
  SeverityWeightTable,
  Weight,
};

/**
 * One axis with its assessment annotations.
 *
 * Narrowing note: `status` is narrowed from the full `AxisStatus` union to
 * the BAND variant. An `AssessedAxis` only exists after its band has resolved
 * (see `rollup.ts`); encoding that in the type means consumers can read
 * `status.band` without re-narrowing. The outer `AnalysisAxisResult.status`
 * union is untouched.
 */
export interface AssessedAxis extends Omit<AnalysisAxisResult, "status"> {
  readonly status: Extract<AxisStatus, { kind: "BAND" }>;
  readonly severity: Severity;
  readonly weight: Weight;
  readonly leverage: Leverage;
}

/**
 * A deterministic, template-generated suggestion tied to one assessed axis.
 *
 * `rootCauseKey` is a Phase-3 addendum (see ARCH-029 and Q5): two axes that
 * imply the same underlying structural change share a key, so their actions
 * deduplicate into one. Format: `<axisType>:<verb>-<target>` — e.g.
 * `volume:add-chest`. The `<axisType>` prefix is the *conceptual owner* of
 * the root cause, which is not necessarily the source axis's own type (a
 * frequency-side fix for a volume problem may produce a key starting with
 * `volume:` so it dedupes with the volume-side action). Phase 4's
 * `MutationSpec` will map from these keys.
 */
export interface ActionSuggestion {
  readonly relatedAxis: AssessedAxis;
  readonly description: string;
  readonly rootCauseKey: string;
}

/**
 * Inner assessment payload. Shape matches `06-assessment-engine.md` with
 * three strict additions — `computedAt`, `allAssessedAxes`, and
 * `fitScoreProjection` (see file header). This is what the discriminated-
 * union wrapper (`AssessmentResult`, below) exposes after a consumer has
 * narrowed on `kind`.
 */
export interface Assessment {
  readonly programVersionId: string | null;
  readonly goalId: string;
  readonly overallSummary: string;
  readonly strengths: readonly AssessedAxis[];
  readonly attentionAreas: readonly AssessedAxis[];
  readonly biggestOpportunity: AssessedAxis | null;
  readonly actions: readonly ActionSuggestion[];
  /**
   * Mirrors `GoalProfileConfig.validated`. `false` ⇒ a UI must show a
   * "provisional" indicator (06-assessment-engine.md).
   */
  readonly thresholdsValidated: boolean;
  /**
   * Strict addition to the doc shape (see ARCH-029). Carries the source
   * `Analysis.computedAt` — the assessment is a pure function of that
   * analysis, so it is the same instant. Needed so
   * `FitScore.derivedFromAssessmentComputedAt` has a value.
   */
  readonly computedAt: string;
  /**
   * The full leverage roll-up, before classification into
   * strengths/attention/opportunity. This is what makes invariant 8
   * structural: `computeFitScore` reads from *this* collection, not from the
   * surfaced subset, so it cannot miss a HIGH-leverage axis that the
   * qualitative narrative happens to not surface.
   */
  readonly allAssessedAxes: readonly AssessedAxis[];
  /**
   * Snapshot of the config's `fitScoreProjection` at assessment time. Carried
   * on the assessment so `computeFitScore(result)` takes a single argument,
   * per 06-assessment-engine.md's signature.
   */
  readonly fitScoreProjection: FitScoreProjection;
}

/**
 * Return type of `computeAssessment`. Both branches carry the fully-populated
 * inner `Assessment` — the union's job is to force callers to acknowledge
 * the unvalidated case before reading the inner values (mirroring ARCH-028).
 *
 * The `reason` on the UNVALIDATED branch names what blocked validation:
 * unvalidated profile, missing axis weights, an axis with no resolved band,
 * or an axis with no severity mapping for its band.
 *
 * In the UNVALIDATED branch, the inner `Assessment` may still have partial
 * `allAssessedAxes` (the axes whose bands and severities and weights *did*
 * resolve) — but `strengths` / `attentionAreas` / `biggestOpportunity` /
 * `actions` are populated *only* if the classification ran to completion.
 * When classification is blocked, those four fields are empty/null so no
 * consumer can mistake a partial roll-up for a real one.
 */
export type AssessmentResult =
  | {
      readonly kind: "VALIDATED";
      readonly assessment: Assessment;
    }
  | {
      readonly kind: "UNVALIDATED";
      readonly reason: string;
      readonly assessment: Assessment;
    };

export interface FitScore {
  readonly band: FitScoreBand;
  readonly derivedFromAssessmentComputedAt: string;
}

/**
 * Return type of `computeFitScore`. Mirrors `AssessmentResult`'s shape: the
 * UNVALIDATED branch does not carry a `FitScore` (there is no meaningful
 * inner structure to inspect — a fit score is a single value), only the
 * reason it is unvalidated, which is the same reason the assessment was.
 */
export type FitScoreResult =
  | { readonly kind: "VALIDATED"; readonly fitScore: FitScore }
  | { readonly kind: "UNVALIDATED"; readonly reason: string };

export interface ComputeAssessmentOptions {
  /**
   * The Goal instance the assessment is computed against (invariant 4:
   * `Goal` is never baked into `ProgramVersion` — it is supplied at query
   * time).
   */
  readonly goalId: string;
}