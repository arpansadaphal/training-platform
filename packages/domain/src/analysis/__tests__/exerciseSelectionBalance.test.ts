// packages/domain/src/analysis/__tests__/exerciseSelectionBalance.test.ts
import { describe, expect, it } from "vitest";
import { computeExerciseSelectionBalanceAxis } from "../exerciseSelectionBalance";
import { testReferenceData } from "../__fixtures__/exerciseReferenceData";
import {
  fullyCoveredProgram,
  programWithGaps,
  emptyProgram,
} from "../__fixtures__/programStructures";
import {
  TEST_CONFIG_ALL_NULL,
  TEST_CONFIG_BOUNDED,
} from "../__fixtures__/testGoalProfiles";

describe("computeExerciseSelectionBalanceAxis", () => {
  it("returns Balanced when all required patterns are present", () => {
    const result = computeExerciseSelectionBalanceAxis(
      fullyCoveredProgram,
      testReferenceData,
      TEST_CONFIG_BOUNDED,
    );
    expect(result.metricValue).toBe(1);
    expect(result.status).toEqual({ kind: "BAND", band: "Balanced" });
  });

  it("returns Gaps present when a required pattern is missing", () => {
    const result = computeExerciseSelectionBalanceAxis(
      programWithGaps,
      testReferenceData,
      TEST_CONFIG_BOUNDED,
    );
    expect(result.metricValue).toBeLessThan(1);
    expect(result.status).toEqual({ kind: "BAND", band: "Gaps present" });
  });

  it("returns coverage 0 for an empty program", () => {
    const result = computeExerciseSelectionBalanceAxis(
      emptyProgram,
      testReferenceData,
      TEST_CONFIG_BOUNDED,
    );
    expect(result.metricValue).toBe(0);
    expect(result.status).toEqual({ kind: "BAND", band: "Gaps present" });
  });

  it("returns UNVALIDATED when bounds are null", () => {
    const result = computeExerciseSelectionBalanceAxis(
      fullyCoveredProgram,
      testReferenceData,
      TEST_CONFIG_ALL_NULL,
    );
    expect(result.status.kind).toBe("UNVALIDATED");
  });
});