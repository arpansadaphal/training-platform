// packages/domain/src/analysis/types.ts
//
// Pure analysis-layer types. No Prisma, no HTTP, no framework imports.
//
// These types are intentionally minimal and framework-free per the three-layer
// rule (02-system-architecture.md) and ARCH-010. packages/db maps Prisma rows
// to `ExerciseReferenceData` at the boundary; the engine never sees Prisma.
//
// Placement note: `AxisType`, `AnalysisAxisResult`, `Analysis`, `GoalProfileConfig`,
// `AxisBandDefinition`, and `AxisWeight` mirror 05-analysis-engine.md. The
// `AxisStatus` discriminated union is a Phase-2 addendum — 05 shows `status: string`,
// but Phase 2's acceptance criteria require that an unvalidated axis cannot be
// rendered as if it had a real band, and a discriminant is the only way to make
// that a compile-time guarantee rather than a convention.
//
// Phase-3 additions (see ARCH-029):
//   * `Severity`, `Weight`, `Leverage`, `SeverityMap`, `SeverityWeightTable`,
//     `FitScoreBand`, `FitScoreProjection`. These live here (not in
//     assessment/types.ts) because `GoalProfileConfig` reads them; keeping them
//     here keeps the dependency direction `assessment -> analysis` unidirectional.
//     assessment/types.ts re-exports them for convenience.
//   * Three new fields on `GoalProfileConfig`: `severityMap`,
//     `severityWeightTable`, `materialitySeverityThreshold`, and
//     `fitScoreProjection` — all configuration per 06-assessment-engine.md.
//   * `AxisWeight.weight` narrowed from `number | null` to `Weight | null`.
//     The leverage table requires the enum (06 step 3). A numeric weight would
//     need a binning threshold to become LOW/MEDIUM/HIGH, and no such
//     threshold exists. `null` continues to mean "[SCIENTIFIC INPUT REQUIRED]".
//
// Numeric thresholds are NEVER invented here. A `GoalProfileConfig` with null
// bounds is a legitimate, loadable configuration; `resolveBand` returns
// `{ kind: "UNVALIDATED" }` for it rather than guessing.

import type { ProgramStructure } from "../types";

// ---------------------------------------------------------------------------
// Reference data (provided by the caller — never fetched here)
// ---------------------------------------------------------------------------

/**
 * Canonical movement-pattern values. Mirrors the Prisma-side enum in
 * packages/db/prisma/schema.prisma as a plain TS union so this package
 * carries no Prisma dependency (ARCH-010).
 */
export type MovementPattern =
  | "SQUAT"
  | "HINGE"
  | "HORIZONTAL_PUSH"
  | "VERTICAL_PUSH"
  | "HORIZONTAL_PULL"
  | "VERTICAL_PULL"
  | "CARRY"
  | "ISOLATION"
  | "OTHER";

export interface ExerciseReference {
  id: string;
  name: string;
  movementPattern: MovementPattern;
  equipment: string | null;
}

export interface MuscleGroupReference {
  id: string;
  name: string;
}

export interface ExerciseMuscleInvolvementReference {
  exerciseId: string;
  muscleGroupId: string;
  /** 0..1; 0 means the muscle group is not trained by this exercise. */
  involvementFactor: number;
}

export interface ExerciseReferenceData {
  exercises: ExerciseReference[];
  muscleGroups: MuscleGroupReference[];
  involvements: ExerciseMuscleInvolvementReference[];
}

// ---------------------------------------------------------------------------
// Axis results
// ---------------------------------------------------------------------------

export type AxisType =
  | "VOLUME"
  | "FREQUENCY"
  | "EXERCISE_SELECTION_BALANCE"
  | "PROGRESSION_SOUNDNESS"
  | "RECOVERY_COST";

/**
 * Discriminated union so callers cannot render a band name for an axis whose
 * thresholds are unvalidated. `05-analysis-engine.md`'s textual
 * `status: string` is deliberately narrowed here for that guarantee
 * (see ARCH-028).
 */
export type AxisStatus =
  | { readonly kind: "BAND"; readonly band: string }
  | { readonly kind: "UNVALIDATED"; readonly reason: string };

/**
 * ARCH-063 / B2. Structure-level detail an axis already computed, carried to the Assessment so a finding can say
 * WHICH pattern is missing, not only that the coverage ratio is low. Set only when non-empty, so an axis with
 * nothing to report keeps exactly the shape it had before. Never an input to a band, severity or leverage, with
 * one exception: a whole missing pattern group raises the ESB severity (rollup.ts, `wholePatternGaps`).
 */
export interface AxisFacts {
  /** EXERCISE_SELECTION_BALANCE: required movement patterns no exercise in the program has, in config order. */
  readonly missingPatterns?: readonly MovementPattern[];
  /** PROGRESSION_SOUNDNESS: the checks that failed (ARCH-063 / B3), so a finding can say WHICH. */
  readonly failedChecks?: readonly FailedCheckFact[];
}

/** One failed progression check: its id, the share it measured (0-1) when it measures one, and its detail line. */
export interface FailedCheckFact {
  readonly id: string;
  readonly share?: number;
  readonly detail: string;
}

export interface AnalysisAxisResult {
  readonly axisType: AxisType;
  /** muscleGroupId for VOLUME/FREQUENCY; null for the program-wide axes. */
  readonly scopeKey: string | null;
  /** e.g. 6 (sets/week) for VOLUME; a coverage ratio for ESB; etc. */
  readonly metricValue: number | string;
  readonly status: AxisStatus;
  readonly facts?: AxisFacts;
}

export interface Analysis {
  readonly programVersionId: string | null;
  readonly axisResults: readonly AnalysisAxisResult[];
  readonly computedAt: string;
  /**
   * Informational cross-muscle ratios (analysis/ratios.ts). Tier 3, never an
   * input to any band, severity, leverage or Fit. Optional because analyses
   * persisted before this field existed do not carry it.
   */
  readonly ratios?: CrossMuscleRatios;
}

// ---------------------------------------------------------------------------
// Cross-muscle ratios (informational; outside the roll-up and the Fit band)
// ---------------------------------------------------------------------------

/**
 * Each pair holds two weekly hard-set totals and `ratio = first / second`
 * (null when `second` is 0: the totals still state the fact). A pair is null
 * when both totals are 0.
 */
export interface CrossMuscleRatios {
  readonly pushPull: { pushSets: number; pullSets: number; ratio: number | null } | null;
  readonly armsLegs: { armSets: number; legSets: number; ratio: number | null } | null;
  readonly quadsHamstrings: {
    quadSets: number;
    hamstringSets: number;
    ratio: number | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Goal-profile configuration (shape from 05-analysis-engine.md)
// ---------------------------------------------------------------------------

export interface AxisBandDefinition {
  status: string;
  /** null means "-infinity"; null on both bounds is a placeholder band. */
  lowerBound: number | null;
  /** null means "+infinity". Half-open interval [lowerBound, upperBound). */
  upperBound: number | null;
}

/**
 * Weight of one axis (or axis scope) in the goal-profile roll-up.
 *
 * Phase 3 narrows this from `number | null` to `Weight | null` (see ARCH-029):
 * the leverage lookup requires the `Weight` enum (06-assessment-engine.md
 * step 3), and no binning threshold exists to turn a raw number into
 * LOW/MEDIUM/HIGH. `null` continues to mean "[SCIENTIFIC INPUT REQUIRED]":
 * the axis participates, but no weight has been signed off.
 */
export interface AxisWeight {
  weight: Weight | null;
  rationale?: string;
}

// ---------------------------------------------------------------------------
// Severity, Weight, Leverage (Phase 3 — see ARCH-029)
// ---------------------------------------------------------------------------

export type Severity = "NONE" | "MINOR" | "MODERATE" | "MAJOR";
export type Weight = "LOW" | "MEDIUM" | "HIGH";
export type Leverage = "NONE" | "LOW" | "MODERATE" | "HIGH";

/**
 * Per-axis status → severity. Keyed first by axisType, then by the band-name
 * string the axis's `AxisStatus.BAND` produced (e.g. "Low", "Adequate").
 *
 * A missing (axisType, status) pair means "no severity has been defined" —
 * the engine must return UNVALIDATED rather than default to a guess.
 *
 * Two dimensions only. Weight does NOT enter here; it enters at the leverage
 * lookup (see ARCH-029).
 */
export type SeverityMap = Partial<Record<AxisType, Record<string, Severity>>>;

/**
 * The 12-cell Severity × Weight → Leverage table. The table's *shape* is
 * fixed by `06-assessment-engine.md`; its *cell contents* are configuration
 * (see ARCH-029). All 12 cells are required — a missing cell is a config bug,
 * not a silent default.
 */
export type SeverityWeightTable = Readonly<
  Record<Severity, Readonly<Record<Weight, Leverage>>>
>;

// ---------------------------------------------------------------------------
// Fit Score projection (Phase 3 — see ARCH-029 and 06-assessment-engine.md)
// ---------------------------------------------------------------------------

/**
 * Coarse Fit Score band name.
 *
 * Named bands are deliberately generic (`NEEDS_WORK` / `DECENT` / `STRONG`)
 * rather than invented specific names, per the Final Freeze §12's explicit
 * instruction to preserve named bands *if* the source Assessment-Redesign
 * text specifies them and not invent replacements otherwise. If that source
 * is ever obtained, only the string values and their cutoff mapping change;
 * the "derived only from Assessment" guarantee does not.
 */
export type FitScoreBand = "STRONG" | "DECENT" | "NEEDS_WORK";

/**
 * Rule-based ordinal projection from a set of assessed leverages to a Fit
 * Score band. Deliberately avoids any numeric intermediate: no weighted sum,
 * no averaging, no ordinal→numeric mapping. The projection uses *ordinal
 * comparison only* (via `indexOf` against `leverageOrdinal`), and both the
 * ordering and the band cells are config-supplied and provisional.
 *
 * This is the mechanism by which invariant 8 is structurally enforced: the
 * Fit Score is a pure function of the leverage set that already produced the
 * qualitative narrative, so they cannot disagree.
 */
export interface FitScoreProjection {
  /** Best (index 0) → worst. Comparison-only; no magnitudes. */
  readonly leverageOrdinal: readonly Leverage[];
  /** Worst leverage found → coarse band. Cell contents PROVISIONAL. */
  readonly worstLeverageToBand: Readonly<Record<Leverage, FitScoreBand>>;
   /**
   * E11 (engine 0.4.0). Optional breadth floors, applied after the worst-leverage mapping. Absent, or
   * `floors: []`, means exactly the 0.3.0 behaviour: existing fixtures need no change and reverting is a
   * config edit. Counts are compared with integer thresholds and discarded, so this introduces no numeric
   * score and no ordinal-to-numeric mapping.
   */
  readonly breadth?: FitBreadthRules;
}
/**
 * E11. One breadth rule: when at least `minCount` findings sit at `leverageAtLeast` or worse, the Fit band
 * is no better than `band`. Counting is cumulative (a HIGH finding also counts toward a LOW floor). Floors
 * only ever make the band worse; see computeFitScore.ts.
 */
export interface FitBreadthFloor {
  readonly leverageAtLeast: Leverage;
  /** Integer >= 1. */
  readonly minCount: number;
  readonly band: FitScoreBand;
}

/**
 * E11. `findingMinSeverity` is the bar an axis must clear to count as a finding. Set it to the profile's
 * `materialitySeverityThreshold`, so that every finding that moves the band is one the narrative lists as
 * an attention area or the biggest opportunity.
 */
export interface FitBreadthRules {
  readonly findingMinSeverity: Severity;
  readonly floors: readonly FitBreadthFloor[];
}
// EDIT 1 — add above GoalProfileConfig:

/** E5. See hardSetCredit.ts. Tier 3/4 engine boundaries. */
export interface HardSetCreditConfig {
  /** RIR at or below this earns full credit (1). */
  readonly fullCreditMaxRir: number;
  /** RIR at or above this earns zero credit. Strictly between the two earns `halfCredit`. */
  readonly zeroCreditMinRir: number;
  readonly halfCredit: number;
  /** RIR assumed when a prescription states no effort. */
  readonly assumedRirWhenUndefined: number;
}

/** E6. See frequency.ts. */
export interface FrequencyDistributionConfig {
  /** Fractional sets one session is expected to carry for one muscle at most. Must be > 0. */
  readonly perSessionSetCap: number;
  /** Fractional sets a session needs for the muscle to count as an exposure. */
  readonly minExposureSets: number;
}

/** ARCH-063 / B2. Body regions findings are grouped by. `core` is reserved; no hypertrophy-relevant muscle is in it. */
export type RegionKey = "upper" | "lower" | "arms" | "core";

/** ARCH-063 / B2. One body region, in the words a sentence uses and the fix it suggests. Tier 3. */
export interface RegionDefinition {
  readonly key: RegionKey;
  /** Mid-sentence name: "lower body". */
  readonly name: string;
  /** Before a noun: "lower-body" (volume), "arm" (work). */
  readonly adjective: string;
  /** Muscle-group names (not ids) in the region. */
  readonly muscles: readonly string[];
  /** The action when every muscle in the region is at 0 sets. */
  readonly addAction: string;
}

/**
 * ARCH-063 / B2. A movement pattern (or a pair, for pulling) whose complete absence is surfaced as a finding of its
 * own, even though the Exercise selection axis alone would tolerate it. Tier 3. Group is absent when EVERY pattern
 * in `patterns` is missing from the program.
 */
export interface WholePatternGap {
  readonly key: string;
  /** Sentence subject: "pulling", "hip hinge". */
  readonly name: string;
  readonly patterns: readonly MovementPattern[];
  /** Muscle-group names whose VOLUME Lows this gap explains and absorbs. May be empty. */
  readonly muscles: readonly string[];
  /** The Exercise selection severity is raised to at least this while the group is absent. */
  readonly severity: Severity;
  /** The action for this gap. */
  readonly addAction: string;
}

/** ARCH-063 / B2. How a missing movement pattern reads in a sentence and what to add for it. Tier 3. */
export interface PatternPhrase {
  readonly name: string;
  readonly example: string;
}

/** E8. See progressionSoundness.ts. */
export interface ProgressionRulesConfig {
  readonly minShareEffortDefined: number;
  readonly farFromFailureMinRir: number;
  readonly maxShareFarFromFailure: number;
  /**
   * ARCH-063 / B3. NEAR_FAILURE fails when MORE than this share of SETS is prescribed at 0 reps in reserve
   * (RPE 10). Sets with no stated effort are not counted. Tier 4: an engine boundary, not a measurement.
   */
  readonly maxShareAtFailure: number;
  readonly acceptedRepRange: readonly [number, number];
  readonly minShareInAcceptedRepRange: number;
  /** Reps of slack allowed beyond the Epley estimate before a %1RM prescription is called infeasible. */
  readonly percent1RmRepTolerance: number;
}


// ---------------------------------------------------------------------------
// Evidence grading (ARCH-054). Descriptive only: no engine code reads these fields.
// ---------------------------------------------------------------------------

/**
 * 1 = direct research (RCTs / meta-analyses / consensus statements); 2 = research-informed synthesis;
 * 3 = expert / coaching heuristic; 4 = engine-derived model parameter. Definitions live in
 * goal-profiles/evidence.ts.
 */
export type EvidenceTier = 1 | 2 | 3 | 4;

/** Inclusive tier range. A config comment reading "Tier 3/4" is { from: 3, to: 4 }. */
export interface EvidenceTierRange {
  readonly from: EvidenceTier;
  readonly to: EvidenceTier;
}

/** One statement the profile relies on, at the tier the config already assigns it. */
export interface EvidenceClaim {
  readonly claim: string;
  readonly tier: EvidenceTierRange;
  /** Short citations exactly as the config comments give them. Empty when the claim cites none. */
  readonly sources: readonly string[];
}

export interface AxisEvidence {
  /** The tier of the band cutpoints a user's result is read against. */
  readonly thresholdTier: EvidenceTierRange;
  readonly claims: readonly EvidenceClaim[];
}

export interface GoalProfileEvidence {
  readonly axes: Readonly<Record<AxisType, AxisEvidence>>;
  readonly fitScoreProjection: AxisEvidence;
}

// ---------------------------------------------------------------------------
// Goal-profile config (Phase 3 shape)
// ---------------------------------------------------------------------------

export interface GoalProfileConfig {
  goalProfileKey: string;
  /**
   * Keyed by `${axisType}:${scopeKey ?? ''}` per 05-analysis-engine.md.
   *
   * Phase 3 adds an axis-level fallback: when the scoped key is missing, the
   * engine falls back to `${axisType}:` (empty scope). This lets a config
   * express a per-axis default without enumerating every muscle-group id
   * (which is seeded data the config does not know).
   *
   * Resolution precedence (see `assessment/rollup.ts`):
   *   1. `${axisType}:${scopeKey}` — wins if present.
   *   2. `${axisType}:` — used if the scoped key is absent.
   *   3. Neither → weight resolves to `null` → the axis is UNVALIDATED.
   *      Not an error, not a silent default.
   */
  // EDIT 2 — inside GoalProfileConfig, add (all optional; code defaults apply when absent):
  /** E7. Patterns EXERCISE_SELECTION_BALANCE requires. Default: the six hypertrophy patterns. */
  readonly requiredMovementPatterns?: readonly MovementPattern[];
  /** E5. Defaults: 3 / 5 / 0.5 / 2. */
  readonly hardSetCredit?: HardSetCreditConfig;
  /** E6. Defaults: cap 10, exposure threshold 2. */
  readonly frequencyDistribution?: FrequencyDistributionConfig;
  /** E8. Defaults as in progressionSoundness.ts. */
  readonly progressionRules?: ProgressionRulesConfig;
  /**
   * ARCH-063 / B1. Muscle-group names, most important first. The last tie-break when two findings of the same
   * axis type have the same leverage and the same deficit: the earlier name leads. A name not listed ranks
   * after every listed one. Tier 3 (a coaching convention). Absent means no priority: axis order decides.
   */
  readonly musclePriority?: readonly string[];
  /** ARCH-063 / B2. Body regions, for consolidating several Low muscles into one finding. Absent: no consolidation. */
  readonly regions?: readonly RegionDefinition[];
  /** ARCH-063 / B2. Whole-pattern groups surfaced when absent. Absent: no bump, no pattern findings. */
  readonly wholePatternGaps?: readonly WholePatternGap[];
  /** ARCH-063 / B2. Wording for each missing movement pattern. */
  readonly patternPhrases?: Readonly<Partial<Record<MovementPattern, PatternPhrase>>>;

  axisWeights: Record<string, AxisWeight>;
  statusBands: Record<AxisType, AxisBandDefinition[]>;
  /** Per-axis status → severity. See ARCH-029. */
  severityMap: SeverityMap;
  /** The 12-cell Severity × Weight → Leverage table. See ARCH-029. */
  severityWeightTable: SeverityWeightTable;
  /**
   * Minimum severity at which an axis appears in `attentionAreas`
   * (06-assessment-engine.md step 6). Deliberately configuration, not
   * hardcoded in the engine.
   */
  materialitySeverityThreshold: Severity;
  /** Rule-based ordinal projection for Fit Score. See `FitScoreProjection`. */
    /**
   * Axes eligible to be listed as Strengths when their severity is NONE.
   *
   * Phase 10.2 / E2. Previously Strengths were every NONE-severity axis,
   * which surfaced FREQUENCY and RECOVERY_COST as "strengths" (e.g. "once
   * weekly is fine", "low recovery cost") — not accomplishments for a
   * hypertrophy goal. This list makes the eligibility explicit and data-
   * driven, mirroring the config-driven posture of the rest of the file.
   *
   * Deliverable from the Phase 10.2 audit (Claude's Section 22 E2).
   * Existing tests that assumed all-NONE → all-Strengths must be updated.
   */
  readonly strengthEligibleAxes: readonly AxisType[];
  fitScoreProjection: FitScoreProjection;
  validated: boolean;
  sourceNote: string;
  /**
   * ARCH-054. The evidence tier and sources behind each axis's thresholds, for display. Optional so test
   * configs need not carry it; no engine code reads it, and it has no bearing on `validated`.
   */
  readonly evidence?: GoalProfileEvidence;
}

// ---------------------------------------------------------------------------
// computeAnalysis options
// ---------------------------------------------------------------------------

/**
 * What the engine may know about the lifter beyond the program. Passed in, never
 * stored. Foundation only: no axis, band or action reads it yet (later items
 * will), so supplying or omitting it leaves every output identical.
 */
export interface AnalysisContext {
  readonly daysPerWeek?: number;
  readonly trainingAgeMonths?: number;
  readonly equipment?: "commercial_gym" | "home_dumbbells" | "bodyweight_only";
  readonly minutesPerSession?: number;
}

export interface ComputeAnalysisOptions {
  programVersionId?: string | null;
  /** Optional lifter context. Not read by any calculator today; see AnalysisContext. */
  context?: AnalysisContext;
  /**
   * Injectable clock, used only so a determinism test can compare two runs
   * byte-for-byte. Production callers omit it and get `new Date()`.
   */
  /** E9. Replaces the provisional recovery-cost calculator for this run. */
  recoveryCostCalculator?: RecoveryCostCalculator;
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// Recovery Cost — swappable calculator surface (phase-02 deliverable)
// ---------------------------------------------------------------------------

/**
 * Structural-only placeholder formula, explicitly provisional per
 * 05-analysis-engine.md and phases/phase-02-analysis-engine.md. The real
 * formula may require inputs beyond `ProgramStructure` (training age,
 * bodyweight, sleep) — the domain model does not currently capture them.
 *
 * This interface exists so the placeholder can be swapped for a
 * sports-science-validated calculator without touching `computeAnalysis`.
 */
// EDIT 4 — RecoveryCostCalculator: add an optional third parameter (existing implementers still compile)
export interface RecoveryCostCalculator {
  compute(
    structure: ProgramStructure,
    referenceData: ExerciseReferenceData,
    config?: GoalProfileConfig,
  ): number;
}

// Re-export the structural types for convenience within the analysis package.
export type { ProgramStructure };