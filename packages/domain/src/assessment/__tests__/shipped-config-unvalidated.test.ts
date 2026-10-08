// packages/domain/src/assessment/__tests__/shipped-config-unvalidated.test.ts
//
// Phase 10.2 rewrite. Previously this suite asserted that the shipped
// HYPERTROPHY config surfaces no strengths / attention areas / biggest
// opportunity / actions — because the roll-up was BLOCKED on null weights
// and classification never ran.
//
// After the Section 20 candidate config landed, the roll-up succeeds (bands
// and weights are populated). Classification therefore DOES run and the
// inner Assessment carries populated fields on the UNVALIDATED branch.
// This is the ARCH-011-adjacent gap Claude flagged in Step 2d: user-facing
// classification is gated by convention (UI checks `kind`), not by the
// domain layer. Enforcing at the domain layer is E10, deferred.
//
// This rewrite asserts the actual contract: the shipped config returns
// kind UNVALIDATED with thresholdsValidated: false and a reason naming the
// provisional sourceNote. It does NOT assert on the inner classification
// fields — those are policy-dependent and belong in E10's test suite.

import { describe, it, expect } from "vitest";
import {
  HYPERTROPHY_CONFIG,
  computeAnalysis,
  computeAssessment,
  computeFitScore,
  type ProgramStructure,
} from "../../index";

const STRUCTURE: ProgramStructure = {
  workoutDays: [
    {
      id: "day-a",
      orderIndex: 0,
      name: "Day A",
      prescriptions: [
        {
          id: "rx-a",
          orderIndex: 0,
          exerciseId: "ex-bench",
          targetSets: 3,
          targetRepsLow: 8,
          targetRepsHigh: 10,
          loadScheme: { type: "BODYWEIGHT" },
        },
      ],
    },
  ],
};

const REFERENCE = {
  exercises: [
    {
      id: "ex-bench",
      name: "Bench",
      movementPattern: "HORIZONTAL_PUSH" as const,
      equipment: null,
    },
  ],
  muscleGroups: [{ id: "mg-chest", name: "chest" }],
  involvements: [
    { exerciseId: "ex-bench", muscleGroupId: "mg-chest", involvementFactor: 1.0 },
  ],
};

describe("shipped HYPERTROPHY config — validated: false contract", () => {
  it("computeAssessment returns kind UNVALIDATED", () => {
    const analysis = computeAnalysis(STRUCTURE, REFERENCE, HYPERTROPHY_CONFIG);
    const result = computeAssessment(analysis, HYPERTROPHY_CONFIG, {
      goalId: "test-goal",
    });
    expect(result.kind).toBe("UNVALIDATED");
  });

  it("thresholdsValidated is false on the inner assessment", () => {
    const analysis = computeAnalysis(STRUCTURE, REFERENCE, HYPERTROPHY_CONFIG);
    const result = computeAssessment(analysis, HYPERTROPHY_CONFIG, {
      goalId: "test-goal",
    });
    expect(result.assessment.thresholdsValidated).toBe(false);
  });

  it("the reason names the unvalidated profile (interpolates sourceNote)", () => {
    const analysis = computeAnalysis(STRUCTURE, REFERENCE, HYPERTROPHY_CONFIG);
    const result = computeAssessment(analysis, HYPERTROPHY_CONFIG, {
      goalId: "test-goal",
    });
    if (result.kind !== "UNVALIDATED") throw new Error("expected UNVALIDATED");
    expect(result.reason).toMatch(/not validated/i);
    expect(result.reason).toMatch(/provisional/i);
  });

  it("computeFitScore returns kind UNVALIDATED for the shipped config", () => {
    const analysis = computeAnalysis(STRUCTURE, REFERENCE, HYPERTROPHY_CONFIG);
    const result = computeAssessment(analysis, HYPERTROPHY_CONFIG, {
      goalId: "test-goal",
    });
    const fit = computeFitScore(result);
    expect(fit.kind).toBe("UNVALIDATED");
  });
});