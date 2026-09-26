// packages/domain/src/mutation/__tests__/invariant.test.ts
//
// The Phase 5 PURE-DOMAIN invariant test.
//
// The full-stack invariant test — simulate → persist → commitFromSimulation →
// reload → recompute → assert identity — lives in
// packages/api/src/services/invariant.test.ts (Phase 5c). This file is the
// domain-layer counterpart.
//
// What this file proves, per the Phase 5 kickoff's Q6: simulate() internally
// recomputes the mutated Analysis and Assessment the same way an independent
// caller would when composing applyMutation + computeAnalysis +
// computeAssessment themselves. If simulate ever grew a private mutation
// helper — violating invariant 2 — the two assessments would diverge and this
// test would fail. If simulate ever skipped a step or used a stale base, its
// output would differ from the manual composition and this test would fail.
//
// The comparison is run on the shipped (unvalidated) config, so the union
// branch is CANNOT_COMPUTE. That's fine: the assessments inside CANNOT_COMPUTE
// are fully-shaped AssessmentResult values and are compared structurally.
// Validation state is orthogonal to the "same mutation function" invariant.

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
const GOAL_ID = "invariant-goal";

const REF_DATA: ExerciseReferenceData = {
  exercises: [
    {
      id: "ex-squat",
      name: "Squat",
      movementPattern: "SQUAT",
      equipment: "barbell",
    },
    {
      id: "ex-bench",
      name: "Bench Press",
      movementPattern: "HORIZONTAL_PUSH",
      equipment: "barbell",
    },
  ],
  muscleGroups: [
    { id: "quads", name: "Quads" },
    { id: "chest", name: "Chest" },
  ],
  involvements: [
    { exerciseId: "ex-squat", muscleGroupId: "quads", involvementFactor: 1.0 },
    {
      exerciseId: "ex-bench",
      muscleGroupId: "chest",
      involvementFactor: 1.0,
    },
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

// Every non-REPLACE mutation op, plus a REPLACE that actually changes the
// structure. The invariant must hold for every one of them, not just the
// convenient cases.
const CASES: ReadonlyArray<{ name: string; mutation: MutationSpec }> = [
  {
    name: "MODIFY_EXERCISE_PRESCRIPTION",
    mutation: {
      op: "MODIFY_EXERCISE_PRESCRIPTION",
      prescriptionId: "rx-1",
      changes: { targetSets: 5 },
    },
  },
  {
    name: "ADD_EXERCISE_PRESCRIPTION",
    mutation: {
      op: "ADD_EXERCISE_PRESCRIPTION",
      workoutDayId: "day-a",
      prescription: {
        id: "rx-2",
        orderIndex: 1,
        exerciseId: "ex-bench",
        targetSets: 3,
        targetRepsLow: 5,
        targetRepsHigh: 8,
        loadScheme: { type: "BODYWEIGHT" },
      },
    },
  },
  {
    name: "REMOVE_EXERCISE_PRESCRIPTION",
    mutation: {
      op: "REMOVE_EXERCISE_PRESCRIPTION",
      prescriptionId: "rx-1",
    },
  },
  {
    name: "REORDER_EXERCISE_PRESCRIPTIONS (single-element, no-op)",
    mutation: {
      op: "REORDER_EXERCISE_PRESCRIPTIONS",
      workoutDayId: "day-a",
      orderedIds: ["rx-1"],
    },
  },
  {
    name: "ADD_WORKOUT_DAY",
    mutation: {
      op: "ADD_WORKOUT_DAY",
      day: {
        id: "day-b",
        orderIndex: 1,
        name: "Day B",
        prescriptions: [],
      },
    },
  },
  {
    name: "REMOVE_WORKOUT_DAY",
    mutation: { op: "REMOVE_WORKOUT_DAY", workoutDayId: "day-a" },
  },
  {
    name: "REPLACE_STRUCTURE (two-day rewrite)",
    mutation: {
      op: "REPLACE_STRUCTURE",
      structure: {
        workoutDays: [
          {
            id: "day-x",
            orderIndex: 0,
            name: "Day X",
            prescriptions: [
              {
                id: "rx-x",
                orderIndex: 0,
                exerciseId: "ex-bench",
                targetSets: 4,
                targetRepsLow: 6,
                targetRepsHigh: 10,
                loadScheme: { type: "BODYWEIGHT" },
              },
            ],
          },
        ],
      },
    },
  },
];

describe("Phase 5 pure-domain invariant — simulate uses the shared applyMutation", () => {
  for (const c of CASES) {
    it(`matches a manual applyMutation + engine composition — ${c.name}`, () => {
      const base = baseStructure();

      // Manual composition — the independent recomputation.
      const manualMutated = applyMutation(base, c.mutation);
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

      // simulate() — the code under test.
      const result = simulate(base, c.mutation, HYPERTROPHY_CONFIG, REF_DATA, {
        goalId: GOAL_ID,
        now: NOW_FN,
      });

      // The shipped config produces CANNOT_COMPUTE. The two assessments
      // inside it must equal what the manual composition produced. A drift
      // here would be an invariant-2 failure made visible.
      expect(result.kind).toBe("CANNOT_COMPUTE");
      if (result.kind !== "CANNOT_COMPUTE") return;

      expect(result.baseAssessment).toEqual(manualBaseAssessment);
      expect(result.mutatedAssessment).toEqual(manualMutatedAssessment);
    });
  }

  it("simulate does not mutate the input structure", () => {
    const base = baseStructure();
    const snapshot = JSON.parse(JSON.stringify(base));

    simulate(
      base,
      {
        op: "MODIFY_EXERCISE_PRESCRIPTION",
        prescriptionId: "rx-1",
        changes: { targetSets: 12 },
      },
      HYPERTROPHY_CONFIG,
      REF_DATA,
      { goalId: GOAL_ID, now: NOW_FN },
    );

    expect(base).toEqual(snapshot);
  });
});