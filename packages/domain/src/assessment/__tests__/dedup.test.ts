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

  // AUDIT TRAIL (ARCH-063 / B2b, engine 0.5.0). This test used to feed a VOLUME Low plus a FREQUENCY "no
  // exposure" for the same muscle and expect both surfaced, with different wording. That was the E6 side effect
  // B2b removes: a muscle at 0 sessions with 2+ sets and below the volume range is ONE problem, and showing it
  // twice is how a program with no legs produced nine cards. The "no exposure" FREQUENCY axis is now dropped
  // from what is surfaced when the same muscle already has a VOLUME Low; it stays in allAssessedAxes. The
  // distinct cases below (under-distributed, and no exposure with volume in range) are still surfaced.
  it("drops a zero-exposure FREQUENCY axis when the same muscle already has a VOLUME Low", () => {
    const merged = computeAssessment(analysis(vol, freq(0)), config, { goalId: "g" }).assessment;
    expect(merged.attentionAreas).toEqual([]);
    expect(merged.actions.map((a) => a.rootCauseKey)).toEqual(["volume:add-chest"]);
    // Invariant 8: the roll-up still sees both axes.
    expect(merged.allAssessedAxes.map((a) => a.axisType)).toEqual(["VOLUME", "FREQUENCY"]);
  });

  it("keeps a zero-exposure FREQUENCY axis when the muscle's volume is fine (it says something distinct)", () => {
    const volOk = { ...vol, metricValue: 12, status: { kind: "BAND" as const, band: "Adequate" } };
    // The fixture config only maps the Low bands; Adequate needs a severity for the roll-up to resolve.
    const withAdequate: GoalProfileConfig = {
      ...config,
      severityMap: { ...config.severityMap, VOLUME: { Low: "MAJOR", Adequate: "NONE" } },
    };
    const a = computeAssessment(analysis(volOk, freq(0)), withAdequate, { goalId: "g" }).assessment;
    expect(a.biggestOpportunity?.axisType).toBe("FREQUENCY");
    expect(a.actions.map((x) => x.rootCauseKey)).toEqual(["frequency:split-chest"]);
    expect(a.actions[0]!.description).toMatch(/at least one session/);
  });

  it("describes an under-distributed muscle as a split, not as no exposure", () => {
    const split = result.assessment.actions.find((a) => a.rootCauseKey === "frequency:split-chest")!;
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