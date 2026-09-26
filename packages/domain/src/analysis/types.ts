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

export interface AnalysisAxisResult {
  readonly axisType: AxisType;
  /** muscleGroupId for VOLUME/FREQUENCY; null for the program-wide axes. */
  readonly scopeKey: string | null;
  /** e.g. 6 (sets/week) for VOLUME; a coverage ratio for ESB; etc. */
  readonly metricValue: number | string;
  readonly status: AxisStatus;
}

export interface Analysis {
  readonly programVersionId: string | null;
  readonly axisResults: readonly AnalysisAxisResult[];
  readonly computedAt: string;
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
  fitScoreProjection: FitScoreProjection;
  validated: boolean;
  sourceNote: string;
}

// ---------------------------------------------------------------------------
// computeAnalysis options
// ---------------------------------------------------------------------------

export interface ComputeAnalysisOptions {
  programVersionId?: string | null;
  /**
   * Injectable clock, used only so a determinism test can compare two runs
   * byte-for-byte. Production callers omit it and get `new Date()`.
   */
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
export interface RecoveryCostCalculator {
  /** Returns a non-negative aggregate fatigue signal. */
  compute(
    structure: ProgramStructure,
    referenceData: ExerciseReferenceData,
  ): number;
}

// Re-export the structural types for convenience within the analysis package.
export type { ProgramStructure };