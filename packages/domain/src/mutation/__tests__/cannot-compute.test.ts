// packages/domain/src/mutation/__tests__/cannot-compute.test.ts
//
// Phase 10.2 update: the shipped HYPERTROPHY_CONFIG now has populated band
// bounds and populated axis weights (candidate values, all Tier 2-4). The
// classification gate is no longer "weights are null" — it's
// `validated: false`.
//
// `computeAssessment` returns UNVALIDATED and `simulate` returns
// CANNOT_COMPUTE with reason "ASSESSMENT_UNVALIDATED" whenever the profile's
// `validated` flag is false, regardless of whether the bands and weights are
// populated. This is the correct behaviour: a fully-populated but
// not-yet-signed-off config must not produce a Gain/Cost/Net payload.
//
// This suite's contract is now:
//   profile is unvalidated → engine refuses to produce Gain/Cost/Net →
//   the discriminated union's CANNOT_COMPUTE branch is exhaustive and safe.
//
// Any future phase that ships a validated HYPERTROPHY_CONFIG must EXTEND
// this file — adding VALIDATED-path tests alongside — not delete it. The
// CANNOT_COMPUTE assertions must remain for any goal profile that is not
// validated.

import { describe, it, expect } from "vitest";
import {
  HYPERTROPHY_CONFIG,
  hypertrophyProfile,
} from "../../goal-profiles/hypertrophy";
import type { ExerciseReferenceData } from "../../analysis/types";
import type { ProgramStructure } from "../../types";
import { simulate } from "../simulate";
import type { MutationSpec } from "../types";

const FIXED_NOW = new Date("2026-06-01T12:00:00.000Z");
const NOW_FN = () => FIXED_NOW;
const GOAL_ID = "unvalidated-goal";

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

const BASE: ProgramStructure = {
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

describe("CANNOT_COMPUTE — the shipped HYPERTROPHY_CONFIG is unvalidated", () => {
  it("HYPERTROPHY_CONFIG.validated is false", () => {
    expect(HYPERTROPHY_CONFIG.validated).toBe(false);
  });

  it("every axis weight is populated (candidate values, not null)", () => {
    // Phase 10.2: the candidate config landed with all axis weights set.
    // This test now guards against accidentally reverting to the pre-Phase-10.2
    // shape — if any weight is null, the roll-up would block on null-weight
    // grounds rather than on the `validated: false` gate. Both paths return
    // CANNOT_COMPUTE, so the existing assertion below would still pass; this
    // test pins which path is taken.
    for (const [key, value] of Object.entries(HYPERTROPHY_CONFIG.axisWeights)) {
      expect(value.weight, `axisWeights["${key}"].weight`).not.toBeNull();
    }
  });

  it("hypertrophyProfile.loadConfig() returns the same config", () => {
    expect(hypertrophyProfile.loadConfig()).toBe(HYPERTROPHY_CONFIG);
  });
});

describe("CANNOT_COMPUTE — every mutation shape hits the branch", () => {
  const mutations: ReadonlyArray<{ name: string; mutation: MutationSpec }> = [
    {
      name: "MODIFY_EXERCISE_PRESCRIPTION (sets +)",
      mutation: {
        op: "MODIFY_EXERCISE_PRESCRIPTION",
        prescriptionId: "rx-1",
        changes: { targetSets: 5 },
      },
    },
    {
      name: "MODIFY_EXERCISE_PRESCRIPTION (sets −)",
      mutation: {
        op: "MODIFY_EXERCISE_PRESCRIPTION",
        prescriptionId: "rx-1",
        changes: { targetSets: 1 },
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
          exerciseId: "ex-squat",
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
      name: "ADD_WORKOUT_DAY",
      mutation: {
        op: "ADD_WORKOUT_DAY",
        day: { id: "day-b", orderIndex: 1, name: "Day B", prescriptions: [] },
      },
    },
    {
      name: "REMOVE_WORKOUT_DAY",
      mutation: { op: "REMOVE_WORKOUT_DAY", workoutDayId: "day-a" },
    },
    {
      name: "REPLACE_STRUCTURE (identity)",
      mutation: { op: "REPLACE_STRUCTURE", structure: BASE },
    },
  ];

  for (const c of mutations) {
    it(`returns CANNOT_COMPUTE — ${c.name}`, () => {
      const result = simulate(BASE, c.mutation, HYPERTROPHY_CONFIG, REF_DATA, {
        goalId: GOAL_ID,
        now: NOW_FN,
      });
      expect(result.kind).toBe("CANNOT_COMPUTE");
      if (result.kind !== "CANNOT_COMPUTE") return;
      expect(result.reason).toBe("ASSESSMENT_UNVALIDATED");
      // Both assessments present, both UNVALIDATED — the UI can render the
      // honest state without re-running the engine.
      expect(result.baseAssessment.kind).toBe("UNVALIDATED");
      expect(result.mutatedAssessment.kind).toBe("UNVALIDATED");
    });
  }
});

describe("CANNOT_COMPUTE — the union exposes no fabricated quantitative payload", () => {
  it("carries neither gain, cost, net, nor whatChanged", () => {
    // The discriminated union exists so a caller cannot mistake a
    // CANNOT_COMPUTE result for a computed one. The runtime check below
    // confirms a caller that reads the COMPUTED-only fields off this branch
    // gets undefined, not an empty array that could be mistaken for
    // "no gains / no costs".
    const result = simulate(
      BASE,
      {
        op: "MODIFY_EXERCISE_PRESCRIPTION",
        prescriptionId: "rx-1",
        changes: { targetSets: 5 },
      },
      HYPERTROPHY_CONFIG,
      REF_DATA,
      { goalId: GOAL_ID, now: NOW_FN },
    );
    expect(result).not.toHaveProperty("gain");
    expect(result).not.toHaveProperty("cost");
    expect(result).not.toHaveProperty("net");
    expect(result).not.toHaveProperty("whatChanged");
    expect(result).not.toHaveProperty("mutatedStructure");
  });
});