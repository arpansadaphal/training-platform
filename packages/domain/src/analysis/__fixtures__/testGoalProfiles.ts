// packages/domain/src/analysis/__fixtures__/testGoalProfiles.ts
//
// Test-only GoalProfileConfig fixtures.
//
// *** NOT REAL RECOMMENDATIONS ***
// Every config here is `validated: false`. Numeric bounds in the
// `TEST_BOUNDED` config are arbitrary numbers chosen only to exercise the
// banding logic in tests; they are NOT sports-science recommendations and
// must never be copied into a shipped HYPERTROPHY/Strength profile without
// explicit sign-off. configValidation.test.ts asserts `validated: false`
// on every export from this module.
//
// Phase-3 patch: each config gains the four fields Phase 3 added to
// `GoalProfileConfig` — `severityMap`, `severityWeightTable`,
// `materialitySeverityThreshold`, `fitScoreProjection`. The values are
// illustrative and provisional (same class of placeholder as Phase 2's
// arbitrary numeric bounds), and both configs stay `validated: false`.

import type { GoalProfileConfig, AxisBandDefinition } from "../types";

const ALL_NULL_VOLUME: AxisBandDefinition[] = [
  { status: "Low", lowerBound: null, upperBound: null },
  { status: "Adequate", lowerBound: null, upperBound: null },
  { status: "High", lowerBound: null, upperBound: null },
  { status: "Excessive", lowerBound: null, upperBound: null },
];

const ALL_NULL_FREQUENCY: AxisBandDefinition[] = [
  { status: "Low", lowerBound: null, upperBound: null },
  { status: "Adequate", lowerBound: null, upperBound: null },
  { status: "High", lowerBound: null, upperBound: null },
];

const ALL_NULL_ESB: AxisBandDefinition[] = [
  { status: "Balanced", lowerBound: null, upperBound: null },
  { status: "Gaps present", lowerBound: null, upperBound: null },
];

const ALL_NULL_PS: AxisBandDefinition[] = [
  { status: "Sound", lowerBound: null, upperBound: null },
  { status: "Issue found", lowerBound: null, upperBound: null },
];

const ALL_NULL_RC: AxisBandDefinition[] = [
  { status: "Low", lowerBound: null, upperBound: null },
  { status: "Moderate", lowerBound: null, upperBound: null },
  { status: "High", lowerBound: null, upperBound: null },
  { status: "Excessive", lowerBound: null, upperBound: null },
];

// --- Phase-3 additions: severity / leverage / fit-score fixtures ---

// PROVISIONAL — see file header. Same class of illustrative placeholder as
// the arbitrary numeric bounds above; do NOT copy into a shipped profile.
const TEST_SEVERITY_MAP: GoalProfileConfig["severityMap"] = {
  VOLUME: {
    Low: "MAJOR",
    Adequate: "NONE",
    High: "MINOR",
    Excessive: "MODERATE",
  },
  FREQUENCY: {
    Low: "MAJOR",
    Adequate: "NONE",
    High: "MINOR",
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

// PROVISIONAL — 12-cell table, cell contents illustrative.
const TEST_SEVERITY_WEIGHT_TABLE: GoalProfileConfig["severityWeightTable"] = {
  NONE: { LOW: "NONE", MEDIUM: "NONE", HIGH: "NONE" },
  MINOR: { LOW: "NONE", MEDIUM: "LOW", HIGH: "MODERATE" },
  MODERATE: { LOW: "LOW", MEDIUM: "MODERATE", HIGH: "HIGH" },
  MAJOR: { LOW: "MODERATE", MEDIUM: "HIGH", HIGH: "HIGH" },
};

// PROVISIONAL — ordinal projection, generic band names.
const TEST_FIT_SCORE_PROJECTION: GoalProfileConfig["fitScoreProjection"] = {
  leverageOrdinal: ["NONE", "LOW", "MODERATE", "HIGH"],
  worstLeverageToBand: {
    NONE: "STRONG",
    LOW: "STRONG",
    MODERATE: "DECENT",
    HIGH: "NEEDS_WORK",
  },
};

/** All bounds null — the shipped HYPERTROPHY shape. Every axis -> UNVALIDATED. */
export const TEST_CONFIG_ALL_NULL: GoalProfileConfig = {
  goalProfileKey: "TEST_FIXTURE_ALL_NULL",
  axisWeights: {},
  statusBands: {
    VOLUME: ALL_NULL_VOLUME,
    FREQUENCY: ALL_NULL_FREQUENCY,
    EXERCISE_SELECTION_BALANCE: ALL_NULL_ESB,
    PROGRESSION_SOUNDNESS: ALL_NULL_PS,
    RECOVERY_COST: ALL_NULL_RC,
  },
  severityMap: TEST_SEVERITY_MAP,
  severityWeightTable: TEST_SEVERITY_WEIGHT_TABLE,
  materialitySeverityThreshold: "MODERATE",
  fitScoreProjection: TEST_FIT_SCORE_PROJECTION,
  validated: false,
  sourceNote: "TEST FIXTURE ONLY — all bounds deliberately null.",
};

/**
 * Arbitrary numeric bounds used only to exercise the banding logic.
 * These numbers are NOT recommendations.
 */
export const TEST_CONFIG_BOUNDED: GoalProfileConfig = {
  goalProfileKey: "TEST_FIXTURE_BOUNDED",
  axisWeights: {},
  statusBands: {
    VOLUME: [
      { status: "Low", lowerBound: null, upperBound: 8 },
      { status: "Adequate", lowerBound: 8, upperBound: 16 },
      { status: "High", lowerBound: 16, upperBound: 24 },
      { status: "Excessive", lowerBound: 24, upperBound: null },
    ],
    FREQUENCY: [
      { status: "Low", lowerBound: null, upperBound: 2 },
      { status: "Adequate", lowerBound: 2, upperBound: 4 },
      { status: "High", lowerBound: 4, upperBound: null },
    ],
    EXERCISE_SELECTION_BALANCE: [
      { status: "Gaps present", lowerBound: null, upperBound: 1 },
      { status: "Balanced", lowerBound: 1, upperBound: null },
    ],
    PROGRESSION_SOUNDNESS: [
      { status: "Sound", lowerBound: null, upperBound: 0.5 },
      { status: "Issue found", lowerBound: 0.5, upperBound: null },
    ],
    RECOVERY_COST: [
      { status: "Low", lowerBound: null, upperBound: 40 },
      { status: "Moderate", lowerBound: 40, upperBound: 80 },
      { status: "High", lowerBound: 80, upperBound: 160 },
      { status: "Excessive", lowerBound: 160, upperBound: null },
    ],
  },
  severityMap: TEST_SEVERITY_MAP,
  severityWeightTable: TEST_SEVERITY_WEIGHT_TABLE,
  materialitySeverityThreshold: "MODERATE",
  fitScoreProjection: TEST_FIT_SCORE_PROJECTION,
  validated: false,
  sourceNote:
    "TEST FIXTURE ONLY — bounds are arbitrary numbers chosen to exercise banding, not recommendations.",
};