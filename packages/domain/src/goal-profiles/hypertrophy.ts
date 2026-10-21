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
  GoalProfileEvidence,
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

// EDIT 1 — replace FREQUENCY_BANDS
// FREQUENCY (E6, REFRAMED). Unit: exposures / required exposures, where required = ceil(weekly fractional
// hard sets / 10) and an exposure is a session with >= 2.0 fractional hard sets for the muscle. 1.0 means the
// weekly dose is spread over exactly as many sessions as it needs. Direction is Tier 1-2: frequency has no
// independent effect on hypertrophy once volume is controlled (Schoenfeld 2019; Pelland 2026); the per-session
// cap is Tier 3 (Remmert 2025 preprint, not peer reviewed). Cutpoints are Tier 4.
const FREQUENCY_BANDS: AxisBandDefinition[] = [
  // Tier 4. Below 1: too few sessions for the dose, or no real exposure at all.
  { status: "Low", lowerBound: null, upperBound: 1 },
  { status: "Adequate", lowerBound: 1, upperBound: 4 },
  // Tier 4. Informational only (severity NONE): the dose is spread over many more sessions than it needs.
  { status: "High", lowerBound: 4, upperBound: null },
  { status: "N/A", lowerBound: null, upperBound: null },
];

// EDIT 2 — ESB_BANDS: values unchanged, comment replaced
// EXERCISE_SELECTION_BALANCE. Unit: fraction of config.requiredMovementPatterns present (six patterns, E7).
// Tier 3/4. 0.75 now means ONE missing pattern is tolerated (5/6 = 0.833 passes; 4/6 = 0.667 does not).
// Before E7 it tolerated two of eight. CARRY and ISOLATION are no longer required.
const ESB_BANDS: AxisBandDefinition[] = [
  { status: "Gaps present", lowerBound: null, upperBound: 0.75 },
  { status: "Balanced", lowerBound: 0.75, upperBound: null },
];

// PROGRESSION_SOUNDNESS. Unit: issue count from the current single rule.
const PS_BANDS: AxisBandDefinition[] = [
  { status: "Sound", lowerBound: null, upperBound: 1 },
  { status: "Issue found", lowerBound: 1, upperBound: null },
];

// EDIT 3 — RC_BANDS: values unchanged, comment addition
//   Weights changed under E9: prescriptions with no stated effort now weigh 0.8 (was 1.0 for FIXED_WEIGHT and
//   BODYWEIGHT, and the raw percent for PERCENT_1RM). The 40 / 90 / 130 cutpoints were NOT recalibrated;
//   programs written without effort will read about 20% lower than before.
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
// Fit Score projection. Tier 4. E11 (engine 0.4.0): breadth-aware.
//
// Base rule UNCHANGED: the worst single leverage maps to a band (NONE and LOW read STRONG, MODERATE reads
// DECENT, HIGH reads NEEDS_WORK).
//
// New: one breadth floor. Three or more findings at LOW leverage or worse stop the band reading STRONG, no
// matter how small each one is. A finding is an assessed axis with leverage >= LOW whose severity is at
// least MODERATE: the same bar as `materialitySeverityThreshold`, so every finding that counts is one the
// narrative shows as an attention area or the biggest opportunity. MINOR-severity axes (PROGRESSION_SOUNDNESS
// "Issue found", RECOVERY_COST "High") carry LOW leverage but do not count toward breadth.
//
// Why 3 (an engine boundary, not a measurement): the calibration programs bracket it (no program has one or
// two counted findings except L, whose HIGH dominates; D has five) but cannot pin it. Any value from 1 to 5
// reproduces A-L identically.
//
// Deliberate cap: this config ships NO floor that can produce NEEDS_WORK from findings below HIGH. The axis
// weights are ordered by evidence (VOLUME HIGH; FREQUENCY and EXERCISE_SELECTION_BALANCE LOW), so summing many
// weak signals should not outvote that ordering. Changing the cap is a config edit (add a floor), not an engine
// change. So is the opposite policy, a lone HIGH reading DECENT: set worstLeverageToBand.HIGH to "DECENT" and
// add { leverageAtLeast: "HIGH", minCount: 2, band: "NEEDS_WORK" } (demonstrated in fit-score.test.ts).
//
// Reverting to worst-single-leverage is deleting `breadth`. `findingMinSeverity` must equal
// `materialitySeverityThreshold`; fit-score.test.ts pins that.
// ---------------------------------------------------------------------------
const HYPERTROPHY_FIT_SCORE_PROJECTION: FitScoreProjection = {
  leverageOrdinal: ["NONE", "LOW", "MODERATE", "HIGH"],
  worstLeverageToBand: {
    NONE: "STRONG",
    LOW: "STRONG",
    MODERATE: "DECENT",
    HIGH: "NEEDS_WORK",
  },
  breadth: {
    findingMinSeverity: "MODERATE",
    floors: [{ leverageAtLeast: "LOW", minCount: 3, band: "DECENT" }],
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
// Evidence (ARCH-054). A display restatement of the tier comments above: every tier and citation here
// is copied from a comment in this file (or, for Epley, progressionSoundness.ts). Nothing is regraded.
// When a comment above changes, change the matching claim here. No engine code reads this block.
// ---------------------------------------------------------------------------
const PELLAND_2026 = "Pelland et al., Sports Med 2026";
const ACSM_2026 = "ACSM 2026";
const ROBINSON_2024 = "Robinson 2024";
const REFALO_2023 = "Refalo 2023";

const HYPERTROPHY_EVIDENCE: GoalProfileEvidence = {
  axes: {
    VOLUME: {
      thresholdTier: { from: 2, to: 3 },
      claims: [
        {
          claim: "Weekly volume is the best-supported structural driver of hypertrophy.",
          tier: { from: 1, to: 2 },
          sources: [ACSM_2026, PELLAND_2026],
        },
        {
          claim:
            "Below 6 hard sets per muscle per week is under the range where growth is reliable for a trained lifter; 6 to 20 reads Adequate.",
          tier: { from: 2, to: 2 },
          sources: [],
        },
        {
          claim: "20 to 30 sets reads High: diminishing returns that stay positive. Information, not a defect.",
          tier: { from: 2, to: 2 },
          sources: [],
        },
        {
          claim: "30 or more sets reads Excessive: the edge of the well-characterised range, not a harm threshold.",
          tier: { from: 3, to: 3 },
          sources: [],
        },
        {
          claim:
            "A set counts in full at RIR 3 or less, half at RIR 4, and not at all at RIR 5 or more: growth rises as sets approach failure, but failure itself is unnecessary.",
          tier: { from: 3, to: 4 },
          sources: [ROBINSON_2024, REFALO_2023, ACSM_2026],
        },
        {
          claim: "An exercise with no stated effort is assumed to be at RIR 2.",
          tier: { from: 4, to: 4 },
          sources: [],
        },
      ],
    },
    FREQUENCY: {
      thresholdTier: { from: 4, to: 4 },
      claims: [
        {
          claim: "Frequency has no independent effect on hypertrophy once weekly volume is controlled.",
          tier: { from: 1, to: 2 },
          sources: ["Schoenfeld 2019", PELLAND_2026],
        },
        {
          claim: "One session carries at most about 10 productive sets for one muscle.",
          tier: { from: 3, to: 3 },
          sources: ["Remmert 2025 (preprint, not peer reviewed)"],
        },
        {
          claim:
            "A session counts as an exposure at 2 or more hard sets; fewer exposures than the weekly dose needs reads Low.",
          tier: { from: 4, to: 4 },
          sources: [],
        },
      ],
    },
    EXERCISE_SELECTION_BALANCE: {
      thresholdTier: { from: 3, to: 4 },
      claims: [
        {
          claim:
            "Six movement patterns are required: squat, hinge, horizontal and vertical push, horizontal and vertical pull. No hypertrophy evidence requires loaded carries.",
          tier: { from: 3, to: 3 },
          sources: [],
        },
        {
          claim: "One missing pattern is tolerated; two or more reads Gaps present.",
          tier: { from: 3, to: 4 },
          sources: [],
        },
      ],
    },
    PROGRESSION_SOUNDNESS: {
      thresholdTier: { from: 3, to: 4 },
      claims: [
        {
          claim: "Growth rises as sets approach failure, but failure itself is unnecessary.",
          tier: { from: 3, to: 4 },
          sources: [ROBINSON_2024, REFALO_2023, ACSM_2026],
        },
        {
          claim:
            "Effort (RPE or RIR) should be stated on at least 80% of exercises, and at most 25% of sets should sit at RIR 5 or more.",
          tier: { from: 3, to: 4 },
          sources: [],
        },
        {
          claim:
            "Reps from 5 to 30 grow muscle similarly when sets are taken near failure; at least 80% of sets should fall in that range.",
          tier: { from: 3, to: 4 },
          sources: [`${ROBINSON_2024} (and the load literature it cites; not independently re-verified)`],
        },
        {
          claim:
            "A %1RM prescription is checked for feasibility with the Epley equation, allowing 1 rep of slack.",
          tier: { from: 4, to: 4 },
          sources: ["Epley equation (interim; Nuzzo et al. 2023 is the intended source)"],
        },
        {
          claim:
            "Effort and overload matter, but the current rules are a weak proxy for a sound progression; no single overload scheme is required.",
          tier: { from: 4, to: 4 },
          sources: [ROBINSON_2024, "Plotkin 2022"],
        },
      ],
    },
    RECOVERY_COST: {
      thresholdTier: { from: 4, to: 4 },
      claims: [
        {
          claim:
            "Recovery cost is sets × (RPE ÷ 10) summed across the week: a model index, not a measurement.",
          tier: { from: 4, to: 4 },
          sources: [],
        },
        {
          claim:
            "The 40 / 90 / 130 cutpoints were not recalibrated after effort weighting; programs with no stated effort read about 20% lower.",
          tier: { from: 4, to: 4 },
          sources: [],
        },
      ],
    },
  },
  fitScoreProjection: {
    thresholdTier: { from: 4, to: 4 },
    claims: [
      {
        claim:
          "The most important finding sets the band: none or low reads Strong, moderate reads Decent, high reads Needs work.",
        tier: { from: 4, to: 4 },
        sources: [],
      },
      {
        claim:
          "Three or more findings stop the band reading Strong. 3 is an engine boundary the calibration programs bracket but cannot pin.",
        tier: { from: 4, to: 4 },
        sources: [],
      },
      {
        claim:
          "Axis weights follow evidence strength: Volume high; Progression and Recovery medium; Frequency and Exercise selection low.",
        tier: { from: 4, to: 4 },
        sources: [ACSM_2026, PELLAND_2026, "Schoenfeld 2019"],
      },
    ],
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
  materialitySeverityThreshold: "MODERATE",
  strengthEligibleAxes: [
    "VOLUME",
    "EXERCISE_SELECTION_BALANCE",
    "PROGRESSION_SOUNDNESS",
  ],
  // EDIT 4 — inside HYPERTROPHY_CONFIG, add:
  // E7. Tier 3: no hypertrophy evidence requires loaded carries; per-muscle coverage is judged by VOLUME.
    requiredMovementPatterns: [
    "SQUAT",
    "HINGE",
    "HORIZONTAL_PUSH",
    "VERTICAL_PUSH",
    "HORIZONTAL_PULL",
    "VERTICAL_PULL",
  ],
    // E5. Tier 3/4. Hypertrophy rises as sets approach failure but failure itself is unnecessary
  // (Robinson 2024; Refalo 2023; ACSM 2026). The cut points are engine boundaries.
  hardSetCredit: {
    fullCreditMaxRir: 3, // RPE >= 7
    zeroCreditMinRir: 5, // RPE <= 5
    halfCredit: 0.5, // RIR 4
    assumedRirWhenUndefined: 2, // Tier 4
  },
   // E6. Cap: Tier 3 (Remmert 2025 preprint). Exposure threshold: Tier 4.
  frequencyDistribution: { perSessionSetCap: 10, minExposureSets: 2 },
  // E8. Tier 3/4. Rep range 5-30: load-agnostic when sets are taken near failure (Robinson 2024 and the
  // load literature it cites; not independently re-verified). Epley tolerance is Tier 4.
  progressionRules: {
    minShareEffortDefined: 0.8,
    farFromFailureMinRir: 5,
    maxShareFarFromFailure: 0.25,
    acceptedRepRange: [5, 30],
    minShareInAcceptedRepRange: 0.8,
    percent1RmRepTolerance: 1,
  },
  fitScoreProjection: HYPERTROPHY_FIT_SCORE_PROJECTION,
  validated: false,
  sourceNote:
    "provisional thresholds — bands populated from candidate config, pending expert review",
  evidence: HYPERTROPHY_EVIDENCE,
};

export const hypertrophyProfile: GoalProfileDefinition = {
  key: "HYPERTROPHY",
  relevantAxes: RELEVANT_AXES,
  relevantMuscleGroups: RELEVANT_MUSCLE_GROUPS,
  loadConfig: () => HYPERTROPHY_CONFIG,
};