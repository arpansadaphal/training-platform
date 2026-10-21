// packages/domain/src/assessment/__tests__/provisional-fit.test.ts
//
// ARCH-054: provisionalFitBand reads the Fit band of an unvalidated-profile assessment for display,
// without changing computeFitScore's UNVALIDATED contract.

import { describe, expect, it } from "vitest";
import {
  HYPERTROPHY_CONFIG,
  computeAnalysis,
  computeAssessment,
  computeFitScore,
  projectFitBand,
  provisionalFitBand,
  type AssessmentResult,
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
    { id: "ex-bench", name: "Bench", movementPattern: "HORIZONTAL_PUSH" as const, equipment: null },
  ],
  muscleGroups: [{ id: "mg-chest", name: "chest" }],
  involvements: [{ exerciseId: "ex-bench", muscleGroupId: "mg-chest", involvementFactor: 1.0 }],
};

function shippedResult(): AssessmentResult {
  const analysis = computeAnalysis(STRUCTURE, REFERENCE, HYPERTROPHY_CONFIG);
  return computeAssessment(analysis, HYPERTROPHY_CONFIG, { goalId: "test-goal" });
}

describe("provisionalFitBand", () => {
  it("returns a band for the shipped unvalidated profile while computeFitScore stays UNVALIDATED", () => {
    const result = shippedResult();
    expect(result.kind).toBe("UNVALIDATED");
    expect(computeFitScore(result).kind).toBe("UNVALIDATED");

    const provisional = provisionalFitBand(result);
    expect(provisional).not.toBeNull();
  });

  it("is exactly projectFitBand over the same roll-up (invariant 8)", () => {
    const result = shippedResult();
    expect(provisionalFitBand(result)).toEqual(projectFitBand(result.assessment));
  });

  it("returns null for a VALIDATED result: the real Fit Score applies", () => {
    const result = shippedResult();
    const validated: AssessmentResult = { kind: "VALIDATED", assessment: result.assessment };
    expect(provisionalFitBand(validated)).toBeNull();
  });

  it("returns null when the roll-up was blocked (nothing classified), so no band is fabricated", () => {
    const result = shippedResult();
    const blocked: AssessmentResult = {
      kind: "UNVALIDATED",
      reason: "axis has no resolved band",
      assessment: {
        ...result.assessment,
        strengths: [],
        attentionAreas: [],
        biggestOpportunity: null,
        actions: [],
      },
    };
    expect(provisionalFitBand(blocked)).toBeNull();
  });

  it("does not depend on the validated flag: flipping it is not needed to read the band", () => {
    expect(HYPERTROPHY_CONFIG.validated).toBe(false);
  });
});
