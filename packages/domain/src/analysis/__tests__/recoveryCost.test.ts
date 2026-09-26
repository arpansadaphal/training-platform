// packages/domain/src/analysis/__tests__/recoveryCost.test.ts
//
// Per the user's Q3 answer (Option A): the provisional formula is asserted
// for MONOTONICITY on the numeric metricValue, and the band is asserted to be
// UNVALIDATED under the shipped all-null config. No specific numeric cutoff is
// asserted as "correct science".

import { describe, expect, it } from "vitest";
import {
  computeRecoveryCostAxis,
  provisionalRecoveryCostCalculator,
} from "../recoveryCost";
import { testReferenceData } from "../__fixtures__/exerciseReferenceData";
import {
  TEST_CONFIG_ALL_NULL,
  TEST_CONFIG_BOUNDED,
} from "../__fixtures__/testGoalProfiles";
import type { ProgramStructure } from "../../types";

function programWith(
  sets: number,
  loadScheme: ProgramStructure["workoutDays"][number]["prescriptions"][number]["loadScheme"],
): ProgramStructure {
  return {
    workoutDays: [
      {
        id: "d1",
        orderIndex: 0,
        name: "X",
        prescriptions: [
          {
            id: "p1",
            orderIndex: 0,
            exerciseId: "squat",
            targetSets: sets,
            targetRepsLow: 8,
            targetRepsHigh: 12,
            loadScheme,
          },
        ],
      },
    ],
  };
}

describe("computeRecoveryCostAxis (provisional)", () => {
  it("metricValue strictly increases with more sets at fixed intensity", () => {
    const low = computeRecoveryCostAxis(
      programWith(3, { type: "RPE_BASED", rpe: 8 }),
      testReferenceData,
      TEST_CONFIG_ALL_NULL,
    );
    const high = computeRecoveryCostAxis(
      programWith(6, { type: "RPE_BASED", rpe: 8 }),
      testReferenceData,
      TEST_CONFIG_ALL_NULL,
    );
    expect(Number(high.metricValue)).toBeGreaterThan(Number(low.metricValue));
  });

  it("metricValue strictly increases with higher intensity at fixed sets", () => {
    const low = computeRecoveryCostAxis(
      programWith(3, { type: "RPE_BASED", rpe: 5 }),
      testReferenceData,
      TEST_CONFIG_ALL_NULL,
    );
    const high = computeRecoveryCostAxis(
      programWith(3, { type: "RPE_BASED", rpe: 9 }),
      testReferenceData,
      TEST_CONFIG_ALL_NULL,
    );
    expect(Number(high.metricValue)).toBeGreaterThan(Number(low.metricValue));
  });

  it("is deterministic for the same input", () => {
    const a = computeRecoveryCostAxis(
      programWith(3, { type: "PERCENT_1RM", percent: 0.8 }),
      testReferenceData,
      TEST_CONFIG_ALL_NULL,
    );
    const b = computeRecoveryCostAxis(
      programWith(3, { type: "PERCENT_1RM", percent: 0.8 }),
      testReferenceData,
      TEST_CONFIG_ALL_NULL,
    );
    expect(a.metricValue).toBe(b.metricValue);
  });

  it("returns UNVALIDATED under the shipped all-null config", () => {
    const result = computeRecoveryCostAxis(
      programWith(3, { type: "PERCENT_1RM", percent: 0.8 }),
      testReferenceData,
      TEST_CONFIG_ALL_NULL,
    );
    expect(result.status.kind).toBe("UNVALIDATED");
  });
});
