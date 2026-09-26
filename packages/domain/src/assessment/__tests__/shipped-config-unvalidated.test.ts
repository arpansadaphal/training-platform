// packages/domain/src/assessment/__tests__/shipped-config-unvalidated.test.ts
//
// The R2 guard rail from the Phase-3 kickoff exchange:
//
//   "Add a test asserting the shipped HYPERTROPHY config always produces
//    UNVALIDATED. Because all axisWeights are null, this is structurally
//    guaranteed by the code — the test guards against a future change that
//    accidentally gives the shipped config a default weight and silently
//    starts producing a band in production."
//
// Two independent structural reasons make this pass today:
//   (a) HYPERTROPHY_CONFIG.validated === false, so computeAssessment returns
//       UNVALIDATED regardless of the roll-up outcome.
//   (b) Every HYPERTROPHY_CONFIG.axisWeights value is `null`, so the roll-up
//       BLOCKS on the first axis whose weight resolution hits a null entry.
//
// The test verifies the observable outcome (UNVALIDATED) without asserting
// which of (a) or (b) caused it — both must hold, and either alone is a bug.
//
// Additional cheap guard: this test also asserts that HYPERTROPHY_CONFIG's
// `validated` flag is literally false. If a future change flips it true, the
// test fails immediately with a specific, actionable message rather than
// silently switching production behaviour.

import { describe, expect, it } from "vitest";
import type { Analysis } from "../../analysis/types";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import { computeAssessment } from "../computeAssessment";

// A representative analysis — one scoped VOLUME axis and the program-wide
// RECOVERY_COST axis. Both routes exercise the axis-level fallback
// (`VOLUME:` / `RECOVERY_COST:`), which is where the shipped config's null
// weights live.
const sampleAnalysis: Analysis = {
  programVersionId: "shipped-config-test-v1",
  axisResults: [
    {
      axisType: "VOLUME",
      scopeKey: "chest",
      metricValue: 3,
      status: { kind: "BAND", band: "Low" },
    },
    {
      axisType: "RECOVERY_COST",
      scopeKey: null,
      metricValue: 170,
      status: { kind: "BAND", band: "Excessive" },
    },
  ],
  computedAt: "2026-01-01T00:00:00.000Z",
};

describe("shipped HYPERTROPHY config is UNVALIDATED", () => {
  it("HYPERTROPHY_CONFIG.validated is literally false", () => {
    expect(HYPERTROPHY_CONFIG.validated).toBe(false);
  });

  it("computeAssessment returns UNVALIDATED for any analysis", () => {
    const result = computeAssessment(sampleAnalysis, HYPERTROPHY_CONFIG, {
      goalId: "shipped-config-goal",
    });
    expect(result.kind).toBe("UNVALIDATED");
  });

  it("the UNVALIDATED reason names either the missing weights or the unvalidated profile", () => {
    const result = computeAssessment(sampleAnalysis, HYPERTROPHY_CONFIG, {
      goalId: "shipped-config-goal",
    });
    if (result.kind !== "UNVALIDATED") {
      throw new Error("expected UNVALIDATED — see prior test");
    }
    // Either signal is acceptable — both mean "we don't know yet". The
    // assertion is that the reason is specific, not that it picks one of
    // the two structural causes.
    const reasonNamesCause =
      result.reason.includes("axisWeights") ||
      result.reason.includes("not validated") ||
      result.reason.includes("SCIENTIFIC INPUT REQUIRED");
    expect(reasonNamesCause).toBe(true);
  });

  it("the inner Assessment carries thresholdsValidated: false", () => {
    const result = computeAssessment(sampleAnalysis, HYPERTROPHY_CONFIG, {
      goalId: "shipped-config-goal",
    });
    expect(result.assessment.thresholdsValidated).toBe(false);
  });

  it("the inner Assessment surfaces no strengths, attention areas, or actions (partial roll-up is not classified)", () => {
    const result = computeAssessment(sampleAnalysis, HYPERTROPHY_CONFIG, {
      goalId: "shipped-config-goal",
    });
    expect(result.assessment.strengths).toEqual([]);
    expect(result.assessment.attentionAreas).toEqual([]);
    expect(result.assessment.biggestOpportunity).toBeNull();
    expect(result.assessment.actions).toEqual([]);
  });
});