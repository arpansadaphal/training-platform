// packages/domain/src/mutation/__tests__/simulate.test.ts
//
// simulate()'s three union branches, exercised against a real ProgramStructure,
// real ExerciseReferenceData, and the real shipped HYPERTROPHY_CONFIG.
//
// The COMPUTED branch is NOT tested here — the shipped config is unvalidated
// (ARCH-029/031), so simulate() never reaches it under that config, and the
// Phase 5 rule (the phase-5 kickoff's "no numeric thresholds still") forbids
// inventing a validated config to force the branch. The CANNOT_COMPUTE branch
// is the honest shipped behavior, tested in cannot-compute.test.ts. The
// classification logic that WOULD run under a validated config is tested
// directly against diffAssessments() in diff-assessments.test.ts, where the
// inputs are hand-built AssessmentResults and no thresholds are required.

import { describe, it, expect } from "vitest";
import { computeAnalysis } from "../../analysis/computeAnalysis";
import { computeAssessment } from "../../assessment/computeAssessment";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import type { ExerciseReferenceData } from "../../analysis/types";
import type { ProgramStructure } from "../../types";
import { applyMutation } from "../apply-mutation";
import { simulate } from "../simulate";
import type { MutationSpec } from "../types";

const FIXED_NOW = new Date("2026-06-01T12:00:00.000Z");
const NOW_FN = () => FIXED_NOW;
const GOAL_ID = "simulate-test-goal";

const REF_DATA: ExerciseReferenceData = {
  exercises: [
    {
      id: "ex-squat",
      name: "Squat",
      movementPattern: "SQUAT",
      equipment: "barbell",
    },
  ],
  muscleGroups: [{ id: "quads", name: "Quads" }],
  involvements: [
    { exerciseId: "ex-squat", muscleGroupId: "quads", involvementFactor: 1.0 },
  ],
};

function baseStructure(): ProgramStructure {
  return {
    workoutDays: [
      {
        id: "day-a",
        orderIndex: 0,
        name: "Day A",
        prescriptions: [
          {
            id: "rx-1",
            orderIndex: 0,
            exerciseId: "ex-squat",
            targetSets: 3,
            targetRepsLow: 5,
            targetRepsHigh: 8,
            loadScheme: { type: "BODYWEIGHT" },
          },
        ],
      },
    ],
  };
}

describe("simulate — INVALID_MUTATION branch", () => {
  it("returns INVALID_MUTATION for a missing workoutDayId", () => {
    const result = simulate(
      baseStructure(),
      { op: "REMOVE_WORKOUT_DAY", workoutDayId: "no-such-day" },
      HYPERTROPHY_CONFIG,
      REF_DATA,
      { goalId: GOAL_ID, now: NOW_FN },
    );
    expect(result.kind).toBe("INVALID_MUTATION");
    if (result.kind !== "INVALID_MUTATION") return;
    expect(result.error.code).toBe("WORKOUT_DAY_NOT_FOUND");
  });

  it("returns INVALID_MUTATION for a missing prescriptionId", () => {
    const result = simulate(
      baseStructure(),
      { op: "REMOVE_EXERCISE_PRESCRIPTION", prescriptionId: "no-such-rx" },
      HYPERTROPHY_CONFIG,
      REF_DATA,
      { goalId: GOAL_ID, now: NOW_FN },
    );
    expect(result.kind).toBe("INVALID_MUTATION");
    if (result.kind !== "INVALID_MUTATION") return;
    expect(result.error.code).toBe("PRESCRIPTION_NOT_FOUND");
  });

  it("returns INVALID_MUTATION for a reorder whose id list length is wrong", () => {
    const result = simulate(
      baseStructure(),
      {
        op: "REORDER_EXERCISE_PRESCRIPTIONS",
        workoutDayId: "day-a",
        orderedIds: ["rx-1", "rx-extra"],
      },
      HYPERTROPHY_CONFIG,
      REF_DATA,
      { goalId: GOAL_ID, now: NOW_FN },
    );
    expect(result.kind).toBe("INVALID_MUTATION");
    if (result.kind !== "INVALID_MUTATION") return;
    expect(result.error.code).toBe("REORDER_MISMATCH");
  });

  it("returns INVALID_MUTATION for a reorder whose list has a duplicate id", () => {
    const result = simulate(
      baseStructure(),
      {
        op: "REORDER_EXERCISE_PRESCRIPTIONS",
        workoutDayId: "day-a",
        orderedIds: ["rx-1", "rx-1"],
      },
      HYPERTROPHY_CONFIG,
      REF_DATA,
      { goalId: GOAL_ID, now: NOW_FN },
    );
    // applyMutation checks length first; the base has 1 prescription, so
    // orderedIds length 2 fails REORDER_MISMATCH before the duplicate check.
    expect(result.kind).toBe("INVALID_MUTATION");
    if (result.kind !== "INVALID_MUTATION") return;
    expect(result.error.code).toBe("REORDER_MISMATCH");
  });

  it("returns INVALID_MUTATION for REPLACE_STRUCTURE carrying a duplicate day id", () => {
    const dup: ProgramStructure = {
      workoutDays: [
        { id: "day-a", orderIndex: 0, name: "A", prescriptions: [] },
        { id: "day-a", orderIndex: 1, name: "A2", prescriptions: [] },
      ],
    };
    const result = simulate(
      baseStructure(),
      { op: "REPLACE_STRUCTURE", structure: dup },
      HYPERTROPHY_CONFIG,
      REF_DATA,
      { goalId: GOAL_ID, now: NOW_FN },
    );
    expect(result.kind).toBe("INVALID_MUTATION");
    if (result.kind !== "INVALID_MUTATION") return;
    expect(result.error.code).toBe("DUPLICATE_WORKOUT_DAY_ID");
  });

  it("does not throw — an invalid mutation is a first-class result", () => {
    // Phase 8's Coach tool handler will rely on this: an invalid mutation must
    // be a value, not an exception, so it can be narrated without crashing
    // the conversation (07-versioning-and-simulation.md).
    expect(() =>
      simulate(
        baseStructure(),
        { op: "REMOVE_WORKOUT_DAY", workoutDayId: "missing" },
        HYPERTROPHY_CONFIG,
        REF_DATA,
        { goalId: GOAL_ID, now: NOW_FN },
      ),
    ).not.toThrow();
  });
});

describe("simulate — CANNOT_COMPUTE branch (shipped config)", () => {
  it("returns CANNOT_COMPUTE for a valid mutation", () => {
    const result = simulate(
      baseStructure(),
      {
        op: "MODIFY_EXERCISE_PRESCRIPTION",
        prescriptionId: "rx-1",
        changes: { targetSets: 5 },
      },
      HYPERTROPHY_CONFIG,
      REF_DATA,
      { goalId: GOAL_ID, now: NOW_FN },
    );
    expect(result.kind).toBe("CANNOT_COMPUTE");
    if (result.kind !== "CANNOT_COMPUTE") return;
    expect(result.reason).toBe("ASSESSMENT_UNVALIDATED");
    expect(result.baseAssessment.kind).toBe("UNVALIDATED");
    expect(result.mutatedAssessment.kind).toBe("UNVALIDATED");
  });

  it("carries both assessments so a UI can render the honest state without re-running the engine", () => {
    const result = simulate(
      baseStructure(),
      { op: "REMOVE_EXERCISE_PRESCRIPTION", prescriptionId: "rx-1" },
      HYPERTROPHY_CONFIG,
      REF_DATA,
      { goalId: GOAL_ID, now: NOW_FN },
    );
    expect(result.kind).toBe("CANNOT_COMPUTE");
    if (result.kind !== "CANNOT_COMPUTE") return;
    // Both inner assessments are fully-shaped (per AssessmentResult's design);
    // a caller can read their `reason` strings directly.
    expect(result.baseAssessment).toHaveProperty("assessment");
    expect(result.mutatedAssessment).toHaveProperty("assessment");
  });
});

describe("simulate — purity and determinism", () => {
  it("does not mutate the input structure", () => {
    const base = baseStructure();
    const snapshot = JSON.parse(JSON.stringify(base));

    simulate(
      base,
      {
        op: "MODIFY_EXERCISE_PRESCRIPTION",
        prescriptionId: "rx-1",
        changes: { targetSets: 7 },
      },
      HYPERTROPHY_CONFIG,
      REF_DATA,
      { goalId: GOAL_ID, now: NOW_FN },
    );

    expect(base).toEqual(snapshot);
  });

  it("produces structurally identical output across two runs with the same clock", () => {
    const base = baseStructure();
    const mutation: MutationSpec = {
      op: "MODIFY_EXERCISE_PRESCRIPTION",
      prescriptionId: "rx-1",
      changes: { targetSets: 5 },
    };

    const first = simulate(base, mutation, HYPERTROPHY_CONFIG, REF_DATA, {
      goalId: GOAL_ID,
      now: NOW_FN,
    });
    const second = simulate(base, mutation, HYPERTROPHY_CONFIG, REF_DATA, {
      goalId: GOAL_ID,
      now: NOW_FN,
    });

    expect(first).toEqual(second);
  });
});

describe("simulate — internal engine composition matches a manual applyMutation + engine run", () => {
  // This is the load-bearing check: it verifies simulate() does not have a
  // private mutation or assessment path. The assertion compares against
  // applyMutation — the shared function — composed with computeAnalysis and
  // computeAssessment. If simulate ever grew its own mutation helper, the
  // manual composition would diverge and this test would fail.
  it("matches a manual composition for MODIFY_EXERCISE_PRESCRIPTION", () => {
    const base = baseStructure();
    const mutation: MutationSpec = {
      op: "MODIFY_EXERCISE_PRESCRIPTION",
      prescriptionId: "rx-1",
      changes: { targetSets: 5 },
    };

    const manualMutated = applyMutation(base, mutation);
    const manualBaseAnalysis = computeAnalysis(
      base,
      REF_DATA,
      HYPERTROPHY_CONFIG,
      { now: NOW_FN },
    );
    const manualBaseAssessment = computeAssessment(
      manualBaseAnalysis,
      HYPERTROPHY_CONFIG,
      { goalId: GOAL_ID },
    );
    const manualMutatedAnalysis = computeAnalysis(
      manualMutated,
      REF_DATA,
      HYPERTROPHY_CONFIG,
      { now: NOW_FN },
    );
    const manualMutatedAssessment = computeAssessment(
      manualMutatedAnalysis,
      HYPERTROPHY_CONFIG,
      { goalId: GOAL_ID },
    );

    const result = simulate(base, mutation, HYPERTROPHY_CONFIG, REF_DATA, {
      goalId: GOAL_ID,
      now: NOW_FN,
    });

    expect(result.kind).toBe("CANNOT_COMPUTE");
    if (result.kind !== "CANNOT_COMPUTE") return;
    expect(result.baseAssessment).toEqual(manualBaseAssessment);
    expect(result.mutatedAssessment).toEqual(manualMutatedAssessment);
  });
});