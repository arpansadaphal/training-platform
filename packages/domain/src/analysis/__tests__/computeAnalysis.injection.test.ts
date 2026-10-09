// packages/domain/src/analysis/__tests__/computeAnalysis.injection.test.ts
import { describe, expect, it } from "vitest";
import { computeAnalysis } from "../computeAnalysis";
import { testReferenceData } from "../__fixtures__/exerciseReferenceData";
import { fullyCoveredProgram } from "../__fixtures__/programStructures";
import { TEST_CONFIG_BOUNDED } from "../__fixtures__/testGoalProfiles";

describe("computeAnalysis: recoveryCostCalculator option (E9)", () => {
  const rc = (a: ReturnType<typeof computeAnalysis>) => a.axisResults.find((r) => r.axisType === "RECOVERY_COST")!;

  it("uses the injected calculator for RECOVERY_COST only", () => {
    const base = computeAnalysis(fullyCoveredProgram, testReferenceData, TEST_CONFIG_BOUNDED);
    const injected = computeAnalysis(fullyCoveredProgram, testReferenceData, TEST_CONFIG_BOUNDED, {
      recoveryCostCalculator: { compute: () => 999 },
    });
    expect(rc(injected).metricValue).toBe(999);
    expect(rc(injected).status).toEqual({ kind: "BAND", band: "Excessive" }); // test bounds: >= 160
    expect(injected.axisResults.filter((r) => r.axisType !== "RECOVERY_COST")).toEqual(
      base.axisResults.filter((r) => r.axisType !== "RECOVERY_COST"),
    );
  });

  it("falls back to the provisional calculator when none is supplied", () => {
    const a = computeAnalysis(fullyCoveredProgram, testReferenceData, TEST_CONFIG_BOUNDED);
    expect(typeof rc(a).metricValue).toBe("number");
    expect(Number(rc(a).metricValue)).toBeGreaterThan(0);
  });
});