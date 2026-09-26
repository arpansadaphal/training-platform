// packages/domain/src/analysis/__tests__/computeAnalysis.test.ts
import { describe, expect, it } from "vitest";
import { computeAnalysis } from "../computeAnalysis";
import { testReferenceData } from "../__fixtures__/exerciseReferenceData";
import {
  fullyCoveredProgram,
  programWithProgressionIssue,
} from "../__fixtures__/programStructures";
import {
  TEST_CONFIG_ALL_NULL,
  TEST_CONFIG_BOUNDED,
} from "../__fixtures__/testGoalProfiles";

describe("computeAnalysis", () => {
  it("includes every axis type at least once", () => {
    const analysis = computeAnalysis(
      fullyCoveredProgram,
      testReferenceData,
      TEST_CONFIG_BOUNDED,
    );
    const types = new Set(analysis.axisResults.map((r) => r.axisType));
    expect(types).toEqual(
      new Set([
        "VOLUME",
        "FREQUENCY",
        "EXERCISE_SELECTION_BALANCE",
        "PROGRESSION_SOUNDNESS",
        "RECOVERY_COST",
      ]),
    );
  });

  it("propagates programVersionId (default null)", () => {
    const a = computeAnalysis(fullyCoveredProgram, testReferenceData, TEST_CONFIG_BOUNDED);
    expect(a.programVersionId).toBeNull();
    const b = computeAnalysis(fullyCoveredProgram, testReferenceData, TEST_CONFIG_BOUNDED, {
      programVersionId: "pv-1",
    });
    expect(b.programVersionId).toBe("pv-1");
  });

  it("every axis is UNVALIDATED under the shipped all-null config", () => {
    const analysis = computeAnalysis(
      programWithProgressionIssue,
      testReferenceData,
      TEST_CONFIG_ALL_NULL,
    );
    for (const r of analysis.axisResults) {
      expect(r.status.kind).toBe("UNVALIDATED");
    }
  });

  it("every axis has a deterministic shape (uniform keys, no undefined)", () => {
    const analysis = computeAnalysis(
      fullyCoveredProgram,
      testReferenceData,
      TEST_CONFIG_BOUNDED,
    );
    for (const r of analysis.axisResults) {
      expect(r).toHaveProperty("axisType");
      expect(r).toHaveProperty("scopeKey");
      expect(r).toHaveProperty("metricValue");
      expect(r).toHaveProperty("status");
      expect(r.status.kind === "BAND" || r.status.kind === "UNVALIDATED").toBe(true);
    }
  });
});