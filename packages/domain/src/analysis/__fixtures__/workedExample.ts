// packages/domain/src/assessment/__fixtures__/workedExample.ts
//
// The Final Freeze's worked-example fixture — the canonical test for the
// Assessment engine (phases/phase-03-assessment-engine.md, 06-assessment-
// engine.md §"Testability").
//
// *** TEST FIXTURE ONLY ***
//
// The config below sets `validated: true` solely so the classification path
// in computeAssessment runs end-to-end and can be asserted. The values are
// illustrative placeholders — the same class of value as in the shipped
// HYPERTROPHY config — and must NOT be copied into a shipped profile without
// sports-science sign-off and a DECISIONS entry.
//
// The four worked-example tuples (see phase-03, and the Q4 resolution in the
// kickoff exchange):
//
//   Axis      Status      Severity   Weight   Leverage
//   Chest     Low         MAJOR      HIGH     HIGH
//   Back      Adequate    NONE       LOW      NONE
//   Quads     High        MINOR      MEDIUM   LOW
//   Recovery  Excessive   MODERATE   MEDIUM   MODERATE
//
// All four are joint-consistent with the 12-cell severityWeightTable below.

import type {
  Analysis,
  AnalysisAxisResult,
  GoalProfileConfig,
  SeverityMap,
  SeverityWeightTable,
} from "../../analysis/types";

// Deterministic instant — every test that reads computedAt can compare
// against this literal.
const WORKED_EXAMPLE_COMPUTED_AT = "2026-01-01T00:00:00.000Z";

// The four axes, one per worked-example row. Chest/Back/Quads are VOLUME
// axis results scoped by muscle group; Recovery is the program-wide axis.
const AXIS_RESULTS: AnalysisAxisResult[] = [
  {
    axisType: "VOLUME",
    scopeKey: "chest",
    metricValue: 3,
    status: { kind: "BAND", band: "Low" },
  },
  {
    axisType: "VOLUME",
    scopeKey: "back",
    metricValue: 12,
    status: { kind: "BAND", band: "Adequate" },
  },
  {
    axisType: "VOLUME",
    scopeKey: "quads",
    metricValue: 18,
    status: { kind: "BAND", band: "High" },
  },
  {
    axisType: "RECOVERY_COST",
    scopeKey: null,
    metricValue: 170,
    status: { kind: "BAND", band: "Excessive" },
  },
];

export const workedExampleAnalysis: Analysis = {
  programVersionId: "worked-example-v1",
  axisResults: AXIS_RESULTS,
  computedAt: WORKED_EXAMPLE_COMPUTED_AT,
};

export const WORKED_EXAMPLE_GOAL_ID = "worked-example-goal";

// --- fixture config ---

const WORKED_EXAMPLE_SEVERITY_MAP: SeverityMap = {
  VOLUME: {
    Low: "MAJOR",
    Adequate: "NONE",
    High: "MINOR",
    Excessive: "MODERATE",
    "N/A": "NONE",
  },
  RECOVERY_COST: {
    Low: "NONE",
    Moderate: "MINOR",
    High: "MINOR",
    Excessive: "MODERATE",
  },
};

const WORKED_EXAMPLE_SEVERITY_WEIGHT_TABLE: SeverityWeightTable = {
  NONE: { LOW: "NONE", MEDIUM: "NONE", HIGH: "NONE" },
  MINOR: { LOW: "NONE", MEDIUM: "LOW", HIGH: "MODERATE" },
  MODERATE: { LOW: "LOW", MEDIUM: "MODERATE", HIGH: "HIGH" },
  MAJOR: { LOW: "MODERATE", MEDIUM: "HIGH", HIGH: "HIGH" },
};

export const workedExampleConfig: GoalProfileConfig = {
  // The fixture simulates the HYPERTROPHY case (that's what the worked
  // example is). Using the real profile key means actionTemplates.ts's
  // HYPERTROPHY branch fires, so the test exercises the full classification
  // path — including the two expected actions — rather than a
  // template-less synthetic profile.
  goalProfileKey: "HYPERTROPHY",
  // Scoped keys for the three VOLUME rows; axis-level fallback for Recovery.
  axisWeights: {
    "VOLUME:chest": { weight: "HIGH" },
    "VOLUME:back": { weight: "LOW" },
    "VOLUME:quads": { weight: "MEDIUM" },
    "RECOVERY_COST:": { weight: "MEDIUM" },
  },
  statusBands: {
    VOLUME: [
      { status: "Low", lowerBound: null, upperBound: null },
      { status: "Adequate", lowerBound: null, upperBound: null },
      { status: "High", lowerBound: null, upperBound: null },
      { status: "Excessive", lowerBound: null, upperBound: null },
      { status: "N/A", lowerBound: null, upperBound: null },
    ],
    FREQUENCY: [],
    EXERCISE_SELECTION_BALANCE: [],
    PROGRESSION_SOUNDNESS: [],
    RECOVERY_COST: [
      { status: "Low", lowerBound: null, upperBound: null },
      { status: "Moderate", lowerBound: null, upperBound: null },
      { status: "High", lowerBound: null, upperBound: null },
      { status: "Excessive", lowerBound: null, upperBound: null },
    ],
  },
  severityMap: WORKED_EXAMPLE_SEVERITY_MAP,
  severityWeightTable: WORKED_EXAMPLE_SEVERITY_WEIGHT_TABLE,
  materialitySeverityThreshold: "MODERATE",
  fitScoreProjection: {
    leverageOrdinal: ["NONE", "LOW", "MODERATE", "HIGH"],
    worstLeverageToBand: {
      NONE: "STRONG",
      LOW: "STRONG",
      MODERATE: "DECENT",
      HIGH: "NEEDS_WORK",
    },
  },
  validated: true,
  sourceNote:
    "TEST FIXTURE ONLY — worked-example config from 06-assessment-engine.md §Testability.",
};