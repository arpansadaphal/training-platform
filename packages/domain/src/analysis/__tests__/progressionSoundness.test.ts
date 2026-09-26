// packages/domain/src/analysis/__tests__/progressionSoundness.test.ts
import { describe, expect, it } from "vitest";
import { computeProgressionSoundnessAxis } from "../progressionSoundness";
import { testReferenceData } from "../__fixtures__/exerciseReferenceData";
import {
  fullyCoveredProgram,
  programWithProgressionIssue,
  programWithPercentOneRmAndSingle,
} from "../__fixtures__/programStructures";
import {
  TEST_CONFIG_ALL_NULL,
  TEST_CONFIG_BOUNDED,
} from "../__fixtures__/testGoalProfiles";

describe("computeProgressionSoundnessAxis", () => {
  it("Sound when no PERCENT_1RM prescriptions exist", () => {
    const result = computeProgressionSoundnessAxis(
      fullyCoveredProgram,
      testReferenceData,
      TEST_CONFIG_BOUNDED,
    );
    expect(result.metricValue).toBe(0);
    expect(result.status).toEqual({ kind: "BAND", band: "Sound" });
  });

  it("Issue found when PERCENT_1RM is used with no 1RM-establishing single", () => {
    const result = computeProgressionSoundnessAxis(
      programWithProgressionIssue,
      testReferenceData,
      TEST_CONFIG_BOUNDED,
    );
    expect(result.metricValue).toBeGreaterThanOrEqual(1);
    expect(result.status).toEqual({ kind: "BAND", band: "Issue found" });
  });

  it("Sound when PERCENT_1RM is used AND a single is present", () => {
    const result = computeProgressionSoundnessAxis(
      programWithPercentOneRmAndSingle,
      testReferenceData,
      TEST_CONFIG_BOUNDED,
    );
    expect(result.metricValue).toBe(0);
    expect(result.status).toEqual({ kind: "BAND", band: "Sound" });
  });

  it("returns UNVALIDATED when bounds are null", () => {
    const result = computeProgressionSoundnessAxis(
      programWithProgressionIssue,
      testReferenceData,
      TEST_CONFIG_ALL_NULL,
    );
    expect(result.status.kind).toBe("UNVALIDATED");
  });
});