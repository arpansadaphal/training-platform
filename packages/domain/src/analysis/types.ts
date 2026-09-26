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
 * `status: string` is deliberately narrowed here for that guarantee.
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
 * `weight: null` is the representation of "[SCIENTIFIC INPUT REQUIRED]":
 * the axis participates, but no numeric weight has been signed off yet.
 * The roll-up math itself lives in Phase 3 (Assessment), not here.
 */
export interface AxisWeight {
  weight: number | null;
  rationale?: string;
}

export interface GoalProfileConfig {
  goalProfileKey: string;
  /** Keyed by `${axisType}:${scopeKey ?? ''}` per 05-analysis-engine.md. */
  axisWeights: Record<string, AxisWeight>;
  statusBands: Record<AxisType, AxisBandDefinition[]>;
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