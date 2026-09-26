// packages/domain/src/assessment/__tests__/determinism.test.ts
//
// Determinism property test, mirroring Phase 2's analysis determinism test
// (the phase file says "Determinism property test, same pattern as Phase 2").
//
// Given the same Analysis + config, computeAssessment returns a result that
// is byte-for-byte identical across runs. Similarly for computeFitScore on
// the resulting assessment. The only time source in the pipeline is
// `analysis.computedAt` — nothing reads new Date().

import { describe, expect, it } from "vitest";
import { computeAssessment } from "../computeAssessment";
import { computeFitScore } from "../computeFitScore";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import {
  WORKED_EXAMPLE_GOAL_ID,
  workedExampleAnalysis,
  workedExampleConfig,
} from "../__fixtures__/workedExample";

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

describe("computeAssessment — determinism", () => {
  it("returns byte-for-byte identical output on the worked-example fixture", () => {
    const a = computeAssessment(workedExampleAnalysis, workedExampleConfig, {
      goalId: WORKED_EXAMPLE_GOAL_ID,
    });
    const b = computeAssessment(workedExampleAnalysis, workedExampleConfig, {
      goalId: WORKED_EXAMPLE_GOAL_ID,
    });
    expect(stableJson(a)).toBe(stableJson(b));
  });

  it("returns byte-for-byte identical output on the shipped HYPERTROPHY config", () => {
    const a = computeAssessment(workedExampleAnalysis, HYPERTROPHY_CONFIG, {
      goalId: "shipped-config-goal",
    });
    const b = computeAssessment(workedExampleAnalysis, HYPERTROPHY_CONFIG, {
      goalId: "shipped-config-goal",
    });
    expect(stableJson(a)).toBe(stableJson(b));
  });

  it("does not read the wall clock — two runs with the same computedAt are identical", () => {
    // The fixture's computedAt is a fixed literal, so if computeAssessment
    // were reading new Date() anywhere, the two runs would differ by their
    // computedAt and this test would fail.
    const a = computeAssessment(workedExampleAnalysis, workedExampleConfig, {
      goalId: WORKED_EXAMPLE_GOAL_ID,
    });
    const b = computeAssessment(workedExampleAnalysis, workedExampleConfig, {
      goalId: WORKED_EXAMPLE_GOAL_ID,
    });
    expect(a.assessment.computedAt).toBe(workedExampleAnalysis.computedAt);
    expect(b.assessment.computedAt).toBe(workedExampleAnalysis.computedAt);
  });
});

describe("computeFitScore — determinism", () => {
  it("returns byte-for-byte identical output on the same assessment", () => {
    const assessment = computeAssessment(workedExampleAnalysis, workedExampleConfig, {
      goalId: WORKED_EXAMPLE_GOAL_ID,
    });
    const a = computeFitScore(assessment);
    const b = computeFitScore(assessment);
    expect(stableJson(a)).toBe(stableJson(b));
  });
});