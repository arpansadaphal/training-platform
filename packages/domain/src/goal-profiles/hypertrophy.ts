// packages/domain/src/goal-profiles/hypertrophy.ts
//
// HYPERTROPHY goal profile — CANDIDATE configuration. validated: false.
//
// EVIDENCE TIERS used in the comments below
//   Tier 1  direct research (RCTs / meta-analyses / consensus statements)
//   Tier 2  research-informed synthesis (an engine boundary derived from several findings)
//   Tier 3  expert / coaching heuristic
//   Tier 4  engine-derived model parameter (a product decision, NOT a scientific measurement)
// Every cutpoint below is an ENGINE BOUNDARY, never a biological threshold.
//
// PRECONDITIONS — these numbers are only meaningful when ALL of the following hold:
//   (E13) packages/db seed: ExerciseMuscleInvolvement.involvementFactor uses the evidence
//         convention 1.0 = primary force generator, 0.5 = synergist, 0 = none
//         (Pelland et al., Sports Med 2026).
//   (E3)  The muscle groups passed to computeAnalysis are limited to goal-relevant groups
//         via scopeReferenceDataToGoal.
//   (E14) Scoped keys such as "VOLUME:<muscleGroupId>" cannot be added until muscle groups
//         have a stable key: MuscleGroup.id is a cuid (environment-specific); only .name is
//         stable.
//   (E15) Decide whether runtime reads this file or the GoalProfileDefinition DB row.
//
// This file must NOT be edited to set validated: true without explicit sports-science
// sign-off and a DECISIONS.md entry. Bump ASSESSMENT_ENGINE_VERSION when this lands.

import type {
  AxisBandDefinition,
  AxisType,
  FitScoreProjection,
  GoalProfileConfig,
  SeverityMap,
  SeverityWeightTable,
} from "../analysis/types";
import type { GoalProfileDefinition } from "./types";

// ---------------------------------------------------------------------------
// Status bands — half-open [lowerBound, upperBound); null = unbounded.
// ---------------------------------------------------------------------------

// VOLUME. Unit: fractional hard sets per muscle per week (sum of targetSets x involvementFactor).
// Assumes direct = 1.0 / synergist = 0.5 seeding (E13).
const VOLUME_BANDS: AxisBandDefinition[] = [
  // Tier 2. Below 6: under the range where growth is reliable for a trained lifter.
  { status: "Low", lowerBound: null, upperBound: 6 },
  // Tier 2. Adequate = 6 up to 20. Target band 10-16 is action-copy only, not encoded here.
  { status: "Adequate", lowerBound: 6, upperBound: 20 },
  // Tier 2. 20-30: diminishing returns but stay positive. Information, not a defect.
  { status: "High", lowerBound: 20, upperBound: 30 },
  // Tier 3. >=30: edge of the well-characterised range. NOT a harm threshold.
  { status: "Excessive", lowerBound: 30, upperBound: null },
  // Placeholder — real N/A scoping arrives with E3's scoped bands.
  { status: "N/A", lowerBound: null, upperBound: null },
];

// FREQUENCY. Unit: distinct training days per week with ANY involvementFactor > 0.
const FREQUENCY_BANDS: AxisBandDefinition[] = [
  // Tier 4. Low = 0 days. One session per week is Adequate.
  { status: "Low", lowerBound: null, upperBound: 1 },
  { status: "Adequate", lowerBound: 1, upperBound: 6 },
  // Tier 4. Informational only.
  { status: "High", lowerBound: 6, upperBound: null },
  { status: "N/A", lowerBound: null, upperBound: null },
];

// EXERCISE_SELECTION_BALANCE. Unit: fraction of the 8 hard-coded movement patterns present.
const ESB_BANDS: AxisBandDefinition[] = [
  { status: "Gaps present", lowerBound: null, upperBound: 0.75 },
  { status: "Balanced", lowerBound: 0.75, upperBound: null },
];

// PROGRESSION_SOUNDNESS. Unit: issue count from the current single rule.
const PS_BANDS: AxisBandDefinition[] = [
  { status: "Sound", lowerBound: null, upperBound: 1 },
  { status: "Issue found", lowerBound: 1, upperBound: null },
];

// RECOVERY_COST. Unit: sum of targetSets x intensityWeight (a MODEL index).
const RC_BANDS: AxisBandDefinition[] = [
  { status: "Low", lowerBound: null, upperBound: 40 },
  { status: "Moderate", lowerBound: 40, upperBound: 90 },
  { status: "High", lowerBound: 90, upperBound: 130 },
  { status: "Excessive", lowerBound: 130, upperBound: null },
];

// ---------------------------------------------------------------------------
// Severity map — band name -> Severity. All Tier 4 unless noted.
// ---------------------------------------------------------------------------
const SEVERITY_MAP: SeverityMap = {
  VOLUME: {
    Low: "MAJOR",
    Adequate: "NONE",
    High: "NONE",
    Excessive: "MODERATE",
    "N/A": "NONE",
  },
  FREQUENCY: {
    Low: "MODERATE",
    Adequate: "NONE",
    High: "NONE",
    "N/A": "NONE",
  },
  EXERCISE_SELECTION_BALANCE: {
    Balanced: "NONE",
    "Gaps present": "MINOR",
  },
  PROGRESSION_SOUNDNESS: {
    Sound: "NONE",
    "Issue found": "MINOR",
  },
  RECOVERY_COST: {
    Low: "NONE",
    Moderate: "NONE",
    High: "MINOR",
    Excessive: "MODERATE",
  },
};

// ---------------------------------------------------------------------------
// Severity x Weight -> Leverage. Tier 4, UNCHANGED from the existing table.
// ---------------------------------------------------------------------------
const SEVERITY_WEIGHT_TABLE: SeverityWeightTable = {
  NONE: { LOW: "NONE", MEDIUM: "NONE", HIGH: "NONE" },
  MINOR: { LOW: "NONE", MEDIUM: "LOW", HIGH: "MODERATE" },
  MODERATE: { LOW: "LOW", MEDIUM: "MODERATE", HIGH: "HIGH" },
  MAJOR: { LOW: "MODERATE", MEDIUM: "HIGH", HIGH: "HIGH" },
};

// ---------------------------------------------------------------------------
// Fit Score projection. Tier 4, UNCHANGED.
// ---------------------------------------------------------------------------
const HYPERTROPHY_FIT_SCORE_PROJECTION: FitScoreProjection = {
  leverageOrdinal: ["NONE", "LOW", "MODERATE", "HIGH"],
  worstLeverageToBand: {
    NONE: "STRONG",
    LOW: "STRONG",
    MODERATE: "DECENT",
    HIGH: "NEEDS_WORK",
  },
};

// ---------------------------------------------------------------------------
// Axis weights — Tier 4; ORDER follows evidence strength.
// ---------------------------------------------------------------------------
const HYPERTROPHY_AXIS_WEIGHTS: GoalProfileConfig["axisWeights"] = {
  "VOLUME:": {
    weight: "HIGH",
    rationale:
      "Tier 4, ordered by Tier 1-2 evidence: weekly volume is the best-supported structural driver (ACSM 2026; Pelland 2026).",
  },
  "PROGRESSION_SOUNDNESS:": {
    weight: "MEDIUM",
    rationale:
      "Tier 4: effort and overload matter (Robinson 2024) but the current rule is a weak proxy; scheme-agnostic evidence (Plotkin 2022).",
  },
  "RECOVERY_COST:": {
    weight: "MEDIUM",
    rationale:
      "Tier 4: modifier of volume, not a goal in itself; model index, not a measurement.",
  },
  "FREQUENCY:": {
    weight: "LOW",
    rationale:
      "Tier 4: negligible independent effect once weekly volume is controlled (Schoenfeld 2019; Pelland 2026).",
  },
  "EXERCISE_SELECTION_BALANCE:": {
    weight: "LOW",
    rationale:
      "Tier 4: movement-pattern coverage is a coaching heuristic (Tier 3), redundant with per-muscle VOLUME.",
  },
};

// ---------------------------------------------------------------------------
// Relevant muscle groups — Phase 10.2 / E3. Names (not ids) because
// MuscleGroup.id is a cuid and MuscleGroup.name is @unique and stable.
// ---------------------------------------------------------------------------
const RELEVANT_MUSCLE_GROUPS: readonly string[] = [
  "chest",
  "lats",
  "upper back",
  "side delts",
  "rear delts",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
];

const RELEVANT_AXES: readonly AxisType[] = [
  "VOLUME",
  "FREQUENCY",
  "EXERCISE_SELECTION_BALANCE",
  "PROGRESSION_SOUNDNESS",
  "RECOVERY_COST",
];

// ---------------------------------------------------------------------------
// The config
// ---------------------------------------------------------------------------
export const HYPERTROPHY_CONFIG: GoalProfileConfig = {
  goalProfileKey: "HYPERTROPHY",
  axisWeights: HYPERTROPHY_AXIS_WEIGHTS,
  statusBands: {
    VOLUME: VOLUME_BANDS,
    FREQUENCY: FREQUENCY_BANDS,
    EXERCISE_SELECTION_BALANCE: ESB_BANDS,
    PROGRESSION_SOUNDNESS: PS_BANDS,
    RECOVERY_COST: RC_BANDS,
  },
  severityMap: SEVERITY_MAP,
  severityWeightTable: SEVERITY_WEIGHT_TABLE,
  materialitySeverityThreshold: "MODERATE",
  strengthEligibleAxes: [
    "VOLUME",
    "EXERCISE_SELECTION_BALANCE",
    "PROGRESSION_SOUNDNESS",
  ],
  fitScoreProjection: HYPERTROPHY_FIT_SCORE_PROJECTION,
  validated: false,
  sourceNote:
    "provisional thresholds — bands populated from candidate config, pending expert review",
};

export const hypertrophyProfile: GoalProfileDefinition = {
  key: "HYPERTROPHY",
  relevantAxes: RELEVANT_AXES,
  relevantMuscleGroups: RELEVANT_MUSCLE_GROUPS,
  loadConfig: () => HYPERTROPHY_CONFIG,
};