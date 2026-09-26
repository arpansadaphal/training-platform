// packages/domain/src/goal-profiles/hypertrophy.ts
//
// HYPERTROPHY goal profile — Phase 3.
//
// *** ALL CELL CONTENTS BELOW ARE PROVISIONAL ***
//
// The *shapes* of `axisWeights`, `severityMap`, `severityWeightTable`, and
// `fitScoreProjection` are finalized here. Their *contents* are illustrative
// placeholders chosen so the Final Freeze's worked example
// (phases/phase-03-assessment-engine.md) passes end-to-end, pending
// sports-science sign-off. No cell below should be read as a scientifically
// validated value.
//
// This file must NOT be edited to contain validated numbers without explicit
// sports-science sign-off and a DECISIONS.md entry. See ARCH-029 and
// 06-assessment-engine.md.

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
// Status bands — unchanged from Phase 2. Every bound is null.
// ---------------------------------------------------------------------------

// Every band has `lowerBound: null, upperBound: null`, which `resolveBand`
// treats as a placeholder and returns UNVALIDATED for. Preserved from Phase 2
// unchanged: the band *names* are load-bearing for the severity map below.
const VOLUME_BANDS: AxisBandDefinition[] = [
  { status: "Low", lowerBound: null, upperBound: null },
  { status: "Adequate", lowerBound: null, upperBound: null },
  { status: "High", lowerBound: null, upperBound: null },
  { status: "Excessive", lowerBound: null, upperBound: null },
  { status: "N/A", lowerBound: null, upperBound: null },
];

const FREQUENCY_BANDS: AxisBandDefinition[] = [
  { status: "Low", lowerBound: null, upperBound: null },
  { status: "Adequate", lowerBound: null, upperBound: null },
  { status: "High", lowerBound: null, upperBound: null },
  { status: "N/A", lowerBound: null, upperBound: null },
];

const ESB_BANDS: AxisBandDefinition[] = [
  { status: "Balanced", lowerBound: null, upperBound: null },
  { status: "Gaps present", lowerBound: null, upperBound: null },
];

const PS_BANDS: AxisBandDefinition[] = [
  { status: "Sound", lowerBound: null, upperBound: null },
  { status: "Issue found", lowerBound: null, upperBound: null },
];

const RC_BANDS: AxisBandDefinition[] = [
  { status: "Low", lowerBound: null, upperBound: null },
  { status: "Moderate", lowerBound: null, upperBound: null },
  { status: "High", lowerBound: null, upperBound: null },
  { status: "Excessive", lowerBound: null, upperBound: null },
];

// ---------------------------------------------------------------------------
// Severity map — PROVISIONAL illustrative values. See ARCH-029.
// ---------------------------------------------------------------------------

// PROVISIONAL — not scientifically validated. See ARCH-029 and
// 06-assessment-engine.md. Replaced when SCIENTIFIC INPUT lands.
//
// Shape: per-axis, per-band-name → Severity. Two dimensions only — weight
// does NOT enter here; it enters at the leverage lookup (see ARCH-029).
// A band name not present for an axis is treated by the engine as
// "no severity defined" and forces the enclosing assessment to be
// UNVALIDATED, rather than defaulting.
const SEVERITY_MAP: SeverityMap = {
  VOLUME: {
    Low: "MAJOR",
    Adequate: "NONE",
    High: "MINOR",
    Excessive: "MODERATE",
    "N/A": "NONE",
  },
  FREQUENCY: {
    Low: "MAJOR",
    Adequate: "NONE",
    High: "MINOR",
    "N/A": "NONE",
  },
  EXERCISE_SELECTION_BALANCE: {
    Balanced: "NONE",
    "Gaps present": "MODERATE",
  },
  PROGRESSION_SOUNDNESS: {
    Sound: "NONE",
    "Issue found": "MODERATE",
  },
  RECOVERY_COST: {
    Low: "NONE",
    Moderate: "MINOR",
    High: "MINOR",
    Excessive: "MODERATE",
  },
};

// ---------------------------------------------------------------------------
// Severity × Weight → Leverage — PROVISIONAL 12-cell table. See ARCH-029.
// ---------------------------------------------------------------------------

// PROVISIONAL — not scientifically validated. See ARCH-029 and
// 06-assessment-engine.md. Replaced when SCIENTIFIC INPUT lands.
//
// Shape (severity × weight) is fixed by 06-assessment-engine.md. Cell contents
// are this profile's illustrative values, chosen so the worked example's four
// tuples resolve:
//   Chest    MAJOR    × HIGH   → HIGH
//   Back     NONE     × LOW    → NONE
//   Quads    MINOR    × MEDIUM → LOW
//   Recovery MODERATE × MEDIUM → MODERATE
const SEVERITY_WEIGHT_TABLE: SeverityWeightTable = {
  NONE: { LOW: "NONE", MEDIUM: "NONE", HIGH: "NONE" },
  MINOR: { LOW: "NONE", MEDIUM: "LOW", HIGH: "MODERATE" },
  MODERATE: { LOW: "LOW", MEDIUM: "MODERATE", HIGH: "HIGH" },
  MAJOR: { LOW: "MODERATE", MEDIUM: "HIGH", HIGH: "HIGH" },
};

// ---------------------------------------------------------------------------
// Fit Score projection — PROVISIONAL illustrative values. See ARCH-029.
// ---------------------------------------------------------------------------

// PROVISIONAL — not scientifically validated. See ARCH-029 and
// 06-assessment-engine.md §"Fit Score — guaranteed consistent by construction".
//
// Rule-based ordinal projection, config-supplied. No numeric intermediate:
// `leverageOrdinal` is used only for ordering (indexOf comparison), never as
// a magnitude. `worstLeverageToBand` maps the worst found leverage to a
// coarse band; the band strings are the generic placeholders the phase file
// directs (NEEDS_WORK / DECENT / STRONG) pending the unavailable Assessment-
// Redesign source text.
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
// Axis weights — keys present, every value null. See file header.
// ---------------------------------------------------------------------------

// Every weight is null — [SCIENTIFIC INPUT REQUIRED].
//
// The keys use the axis-level form `"<AXIS_TYPE>:"` (empty scope), which the
// engine treats as a fallback when a scoped key (`"VOLUME:chest"`) is absent
// (see `GoalProfileConfig.axisWeights` in ../analysis/types.ts and the
// resolution precedence implemented in assessment/rollup.ts). Scoped keys are
// added when scientific input lands; until then every lookup — scoped or
// axis-level — resolves to `null`, and the assessment is UNVALIDATED.
const HYPERTROPHY_AXIS_WEIGHTS: GoalProfileConfig["axisWeights"] = {
  "VOLUME:": {
    weight: null,
    rationale: "UNRESOLVED — SCIENTIFIC INPUT REQUIRED",
  },
  "FREQUENCY:": {
    weight: null,
    rationale: "UNRESOLVED — SCIENTIFIC INPUT REQUIRED",
  },
  "EXERCISE_SELECTION_BALANCE:": {
    weight: null,
    rationale: "UNRESOLVED — SCIENTIFIC INPUT REQUIRED",
  },
  "PROGRESSION_SOUNDNESS:": {
    weight: null,
    rationale: "UNRESOLVED — SCIENTIFIC INPUT REQUIRED",
  },
  "RECOVERY_COST:": {
    weight: null,
    rationale: "UNRESOLVED — SCIENTIFIC INPUT REQUIRED",
  },
};

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
  // PROVISIONAL — not scientifically validated.
  materialitySeverityThreshold: "MODERATE",
  fitScoreProjection: HYPERTROPHY_FIT_SCORE_PROJECTION,
  validated: false,
  sourceNote:
    "UNRESOLVED — SCIENTIFIC INPUT REQUIRED. Bounds, weights, severity " +
    "mappings, leverage-table cell contents, and fit-score projection are " +
    "pending sports-science sign-off; see 05-analysis-engine.md, " +
    "06-assessment-engine.md, and the Final Freeze §10 / Appendix C.",
};

const RELEVANT_AXES: readonly AxisType[] = [
  "VOLUME",
  "FREQUENCY",
  "EXERCISE_SELECTION_BALANCE",
  "PROGRESSION_SOUNDNESS",
  "RECOVERY_COST",
];

export const hypertrophyProfile: GoalProfileDefinition = {
  key: "HYPERTROPHY",
  relevantAxes: RELEVANT_AXES,
  loadConfig: () => HYPERTROPHY_CONFIG,
};