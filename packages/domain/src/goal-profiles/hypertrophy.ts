// packages/domain/src/goal-profiles/hypertrophy.ts
//
// HYPERTROPHY goal profile — Phase 2 stub.
//
// Every numeric threshold is null and `validated: false`, per
// phases/phase-02-analysis-engine.md and 05-analysis-engine.md. This file must
// NOT be edited to contain numeric thresholds without explicit sports-science
// sign-off and a DECISIONS.md entry. The band names are preserved so the
// Assessment layer can address them by name once bounds are supplied.

import type {
  AxisBandDefinition,
  AxisType,
  GoalProfileConfig,
} from "../analysis/types";
import type { GoalProfileDefinition } from "./types";

const NULL_BANDS: AxisBandDefinition[] = [
  { status: "PLACEHOLDER", lowerBound: null, upperBound: null },
];

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

export const HYPERTROPHY_CONFIG: GoalProfileConfig = {
  goalProfileKey: "HYPERTROPHY",
  // Weights land in Phase 3 alongside the roll-up math; the surface exists so
  // the axis participation is already expressible without inventing numbers.
  axisWeights: {},
  statusBands: {
    VOLUME: VOLUME_BANDS,
    FREQUENCY: FREQUENCY_BANDS,
    EXERCISE_SELECTION_BALANCE: ESB_BANDS,
    PROGRESSION_SOUNDNESS: PS_BANDS,
    RECOVERY_COST: RC_BANDS,
  },
  validated: false,
  sourceNote:
    "UNRESOLVED — SCIENTIFIC INPUT REQUIRED. Bounds and weights pending sports-science sign-off; see 05-analysis-engine.md and the Final Freeze §10/Appendix C.",
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

// Silences the "NULL_BANDS is unused" lint until Phase 3 needs a fallback.
export const __NULL_BANDS_FOR_PHASE_3 = NULL_BANDS;