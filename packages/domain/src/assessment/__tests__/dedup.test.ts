// packages/domain/src/assessment/__tests__/dedup.test.ts
//
// Root-cause deduplication. Since E6, FREQUENCY x Low emits `frequency:split-<scope>`, so it no longer
// shares a key with VOLUME x Low (`volume:add-<scope>`): the two actions are now DISTINCT. The dedup loop
// itself is still covered below by feeding two axes the same root cause (a duplicated VOLUME:chest result).

import { describe, expect, it } from "vitest";
import type { Analysis, GoalProfileConfig } from "../../analysis/types";
import { computeAssessment } from "../computeAssessment";

const T = "2026-01-01T00:00:00.000Z";

const config: GoalProfileConfig = {
  goalProfileKey: "HYPERTROPHY",
  axisWeights: { "VOLUME:chest": { weight: "HIGH" }, "FREQUENCY:chest": { weight: "HIGH" } },
  statusBands: { VOLUME: [], FREQUENCY: [], EXERCISE_SELECTION_BALANCE: [], PROGRESSION_SOUNDNESS: [], RECOVERY_COST: [] },
  severityMap: { VOLUME: { Low: "MAJOR" }, FREQUENCY: { Low: "MAJOR" } },
  severityWeightTable: {
    NONE: { LOW: "NONE", MEDIUM: "NONE", HIGH: "NONE" },
    MINOR: { LOW: "NONE", MEDIUM: "LOW", HIGH: "MODERATE" },
    MODERATE: { LOW: "LOW", MEDIUM: "MODERATE", HIGH: "HIGH" },
    MAJOR: { LOW: "MODERATE", MEDIUM: "HIGH", HIGH: "HIGH" },
  },
  materialitySeverityThreshold: "MODERATE",
  strengthEligibleAxes: ["VOLUME", "EXERCISE_SELECTION_BALANCE", "PROGRESSION_SOUNDNESS"],
  fitScoreProjection: {
    leverageOrdinal: ["NONE", "LOW", "MODERATE", "HIGH"],
    worstLeverageToBand: { NONE: "STRONG", LOW: "STRONG", MODERATE: "DECENT", HIGH: "NEEDS_WORK" },
  },
  validated: true,
  sourceNote: "TEST FIXTURE ONLY — dedup test.",
};

const vol = { axisType: "VOLUME" as const, scopeKey: "chest", metricValue: 3, status: { kind: "BAND" as const, band: "Low" } };
const freq = (metricValue: number) => ({ axisType: "FREQUENCY" as const, scopeKey: "chest", metricValue, status: { kind: "BAND" as const, band: "Low" } });
const analysis = (...axisResults: Analysis["axisResults"][number][]): Analysis => ({ programVersionId: "dedup-test-v1", axisResults, computedAt: T });

describe("computeAssessment: VOLUME-Low and FREQUENCY-Low are distinct root causes (E6)", () => {
  const result = computeAssessment(analysis(vol, freq(1)), config, { goalId: "dedup-goal" });

  it("returns VALIDATED (fixture config is validated: true)", () => {
    expect(result.kind).toBe("VALIDATED");
  });

  it("classifies VOLUME:chest as biggest opportunity and FREQUENCY:chest as attention (first wins the tie)", () => {
    expect(result.assessment.biggestOpportunity?.axisType).toBe("VOLUME");
    expect(result.assessment.attentionAreas).toHaveLength(1);
    expect(result.assessment.attentionAreas[0]!.axisType).toBe("FREQUENCY");
  });

  it("produces TWO actions with distinct keys", () => {
    expect(result.assessment.actions.map((a) => a.rootCauseKey).sort()).toEqual(["frequency:split-chest", "volume:add-chest"]);
  });

  it("describes a muscle with no exposure differently from an under-distributed one", () => {
    const none = computeAssessment(analysis(vol, freq(0)), config, { goalId: "g" }).assessment.actions.find((a) => a.rootCauseKey === "frequency:split-chest")!;
    const split = result.assessment.actions.find((a) => a.rootCauseKey === "frequency:split-chest")!;
    expect(none.description).toMatch(/at least one session/);
    expect(split.description).toMatch(/Split chest across more training days/);
  });
});

describe("computeAssessment: dedup by rootCauseKey still collapses identical root causes", () => {
  it("two axes with the same root cause yield ONE action, attributed to the biggest opportunity", () => {
    const r = computeAssessment(analysis(vol, vol), config, { goalId: "dedup-goal" });
    expect(r.assessment.actions).toHaveLength(1);
    expect(r.assessment.actions[0]!.rootCauseKey).toBe("volume:add-chest");
    expect(r.assessment.actions[0]!.relatedAxis).toBe(r.assessment.biggestOpportunity);
  });
});