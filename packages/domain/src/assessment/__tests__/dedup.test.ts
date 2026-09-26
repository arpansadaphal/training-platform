// packages/domain/src/assessment/__tests__/dedup.test.ts
//
// The phase file's dedup acceptance criterion:
//
//   "a fixture where two axes share a root cause (e.g., a missing chest day
//    depressing both Chest Volume and Chest Frequency) produces one Action,
//    not two."
//
// Root-cause sharing is expressed in `actionTemplates.ts`: the VOLUME×Low
// and FREQUENCY×Low templates for a given scope both emit
// `volume:add-<scope>`. When both axes surface in the candidate list,
// `computeAssessment`'s dedup step collapses them to a single action whose
// `relatedAxis` is the highest-priority (biggest opportunity) one.
//
// The config uses `goalProfileKey: "HYPERTROPHY"` so actionTemplates.ts's
// HYPERTROPHY branch fires. Templates are keyed by (axisType, status,
// goalProfileKey); a synthetic key has no templates by design, so a fixture
// meant to exercise the full pipeline must use the real profile key.
//
// The fixture is a minimal config + analysis inline — no separate
// __fixtures__ file, because the fixture is only used here.

import { describe, expect, it } from "vitest";
import type { Analysis, GoalProfileConfig } from "../../analysis/types";
import { computeAssessment } from "../computeAssessment";

const DEDUP_COMPUTED_AT = "2026-01-01T00:00:00.000Z";

const dedupConfig: GoalProfileConfig = {
  // See header — real profile key so HYPERTROPHY templates apply.
  goalProfileKey: "HYPERTROPHY",
  // Both axes explicitly weighted HIGH so both roll up successfully and
  // both clear materiality (MAJOR severity).
  axisWeights: {
    "VOLUME:chest": { weight: "HIGH" },
    "FREQUENCY:chest": { weight: "HIGH" },
  },
  statusBands: {
    VOLUME: [],
    FREQUENCY: [],
    EXERCISE_SELECTION_BALANCE: [],
    PROGRESSION_SOUNDNESS: [],
    RECOVERY_COST: [],
  },
  severityMap: {
    VOLUME: { Low: "MAJOR" },
    FREQUENCY: { Low: "MAJOR" },
  },
  severityWeightTable: {
    NONE: { LOW: "NONE", MEDIUM: "NONE", HIGH: "NONE" },
    MINOR: { LOW: "NONE", MEDIUM: "LOW", HIGH: "MODERATE" },
    MODERATE: { LOW: "LOW", MEDIUM: "MODERATE", HIGH: "HIGH" },
    MAJOR: { LOW: "MODERATE", MEDIUM: "HIGH", HIGH: "HIGH" },
  },
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
  sourceNote: "TEST FIXTURE ONLY — dedup test.",
};

const dedupAnalysis: Analysis = {
  programVersionId: "dedup-test-v1",
  axisResults: [
    {
      axisType: "VOLUME",
      scopeKey: "chest",
      metricValue: 3,
      status: { kind: "BAND", band: "Low" },
    },
    {
      axisType: "FREQUENCY",
      scopeKey: "chest",
      metricValue: 1,
      status: { kind: "BAND", band: "Low" },
    },
  ],
  computedAt: DEDUP_COMPUTED_AT,
};

describe("computeAssessment — root-cause deduplication", () => {
  const result = computeAssessment(dedupAnalysis, dedupConfig, {
    goalId: "dedup-goal",
  });

  it("returns VALIDATED (fixture config is validated: true)", () => {
    expect(result.kind).toBe("VALIDATED");
  });

  it("classifies exactly one of the two chest axes as biggest opportunity, the other as attention", () => {
    const { assessment } = result;
    // Axis order in the analysis is [VOLUME:chest, FREQUENCY:chest], so
    // first-wins on the argmax tie puts VOLUME:chest in the biggest-
    // opportunity slot and FREQUENCY:chest in attention.
    expect(assessment.biggestOpportunity?.axisType).toBe("VOLUME");
    expect(assessment.attentionAreas).toHaveLength(1);
    expect(assessment.attentionAreas[0]!.axisType).toBe("FREQUENCY");
  });

  it("produces exactly ONE action, not two — both templates emit volume:add-chest", () => {
    expect(result.assessment.actions).toHaveLength(1);
  });

  it("attributes the surviving action to the biggest opportunity (VOLUME:chest), not the attention one", () => {
    const action = result.assessment.actions[0]!;
    expect(action.rootCauseKey).toBe("volume:add-chest");
    expect(action.relatedAxis.axisType).toBe("VOLUME");
    expect(action.relatedAxis.scopeKey).toBe("chest");
  });
});