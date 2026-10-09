// packages/domain/src/analysis/__tests__/exerciseSelectionBalance.requiredPatterns.test.ts
import { describe, expect, it } from "vitest";
import type { ProgramStructure } from "../../types";
import { DEFAULT_REQUIRED_MOVEMENT_PATTERNS, computeExerciseSelectionBalanceAxis } from "../exerciseSelectionBalance";
import { testReferenceData } from "../__fixtures__/exerciseReferenceData";
import { TEST_CONFIG_BOUNDED } from "../__fixtures__/testGoalProfiles";

// Fixture patterns: bench/incline HORIZONTAL_PUSH, ohp VERTICAL_PUSH, row HORIZONTAL_PULL, pullup VERTICAL_PULL,
// squat SQUAT, deadlift HINGE, curl ISOLATION, farmer CARRY. ESB bands (test): Gaps present < 1, Balanced >= 1.
const withExercises = (...ids: string[]): ProgramStructure => ({
  workoutDays: [
    {
      id: "d1",
      orderIndex: 0,
      name: "D",
      prescriptions: ids.map((exerciseId, i) => ({
        id: `p${i}`,
        orderIndex: i,
        exerciseId,
        targetSets: 3,
        targetRepsLow: 8,
        targetRepsHigh: 12,
        loadScheme: { type: "RPE_BASED" as const, rpe: 8 },
      })),
    },
  ],
});
const run = (s: ProgramStructure, config = TEST_CONFIG_BOUNDED) =>
  computeExerciseSelectionBalanceAxis(s, testReferenceData, config);

const SIX = ["squat", "deadlift", "bench", "ohp", "row", "pullup"];

describe("computeExerciseSelectionBalanceAxis: required patterns (E7)", () => {
  it("defaults to the six hypertrophy patterns", () => {
    expect([...DEFAULT_REQUIRED_MOVEMENT_PATTERNS]).toEqual([
      "SQUAT", "HINGE", "HORIZONTAL_PUSH", "VERTICAL_PUSH", "HORIZONTAL_PULL", "VERTICAL_PULL",
    ]);
  });

  it("is Balanced with the six patterns and NO carry and NO isolation", () => {
    const r = run(withExercises(...SIX));
    expect(r.metricValue).toBe(1);
    expect(r.status).toEqual({ kind: "BAND", band: "Balanced" });
  });

  it("carries and isolation add nothing and cannot rescue a missing pattern", () => {
    const r = run(withExercises("squat", "bench", "ohp", "row", "pullup", "curl", "farmer")); // no HINGE
    expect(r.metricValue).toBeCloseTo(5 / 6);
    expect(r.status).toEqual({ kind: "BAND", band: "Gaps present" });
  });

  it("an empty program covers nothing", () => {
    expect(run({ workoutDays: [] }).metricValue).toBe(0);
  });

  it("uses config.requiredMovementPatterns when supplied", () => {
    const squatOnly = { ...TEST_CONFIG_BOUNDED, requiredMovementPatterns: ["SQUAT" as const] };
    expect(run(withExercises("squat"), squatOnly).metricValue).toBe(1);
    expect(run(withExercises("bench"), squatOnly).metricValue).toBe(0);
  });

  it("can require CARRY and ISOLATION when a profile asks for them", () => {
    const cfg = { ...TEST_CONFIG_BOUNDED, requiredMovementPatterns: ["CARRY" as const, "ISOLATION" as const] };
    expect(run(withExercises("curl", "farmer"), cfg).metricValue).toBe(1);
    expect(run(withExercises("curl"), cfg).metricValue).toBe(0.5);
  });

  it("an empty required list is vacuously covered", () => {
    const none = { ...TEST_CONFIG_BOUNDED, requiredMovementPatterns: [] as const };
    expect(run(withExercises("curl"), none).metricValue).toBe(1);
  });

  it("duplicates in the required list do not change the ratio", () => {
    const dup = { ...TEST_CONFIG_BOUNDED, requiredMovementPatterns: ["SQUAT" as const, "SQUAT" as const, "HINGE" as const] };
    expect(run(withExercises("squat"), dup).metricValue).toBe(0.5);
  });
});