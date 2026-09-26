// packages/domain/src/mutation/__tests__/determinism.test.ts
//
// applyMutation is a pure function; the tests here are the mechanical proof of
// that claim. They exist separately from apply-mutation.test.ts because they
// assert a different property: not "does this op do the right thing" but "is
// the function referentially transparent" — the property that lets simulate
// and commit share it (invariant 2) without one observing state written by the
// other.

import { describe, it, expect } from "vitest";
import { applyMutation } from "../apply-mutation";
import type {
  ExercisePrescriptionStructure,
  LoadScheme,
  ProgramStructure,
  WorkoutDayStructure,
} from "../../types";

function prescription(
  id: string,
  exerciseId: string,
  orderIndex: number,
  loadScheme: LoadScheme = { type: "BODYWEIGHT" },
): ExercisePrescriptionStructure {
  return {
    id,
    orderIndex,
    exerciseId,
    targetSets: 3,
    targetRepsLow: 8,
    targetRepsHigh: 12,
    loadScheme,
  };
}

function workoutDay(
  id: string,
  name: string,
  orderIndex: number,
  prescriptions: ExercisePrescriptionStructure[] = [],
): WorkoutDayStructure {
  return { id, name, orderIndex, prescriptions };
}

function baseStructure(): ProgramStructure {
  return {
    workoutDays: [
      workoutDay("day-a", "Push", 0, [
        prescription("p-1", "ex-bench", 0, { type: "PERCENT_1RM", percent: 75 }),
        prescription("p-2", "ex-ohp", 1, { type: "RPE_BASED", rpe: 8 }),
      ]),
      workoutDay("day-b", "Pull", 1, [
        prescription("p-3", "ex-row", 0, {
          type: "FIXED_WEIGHT",
          weight: 60,
          unit: "kg",
        }),
      ]),
    ],
  };
}

describe("applyMutation — determinism", () => {
  it("returns deep-equal output across repeated calls with the same input", () => {
    const mutation = {
      op: "ADD_EXERCISE_PRESCRIPTION" as const,
      workoutDayId: "day-a",
      prescription: prescription("p-new", "ex-fly", 1),
    };
    const first = applyMutation(baseStructure(), mutation);
    const second = applyMutation(baseStructure(), mutation);
    expect(first).toEqual(second);
  });

  it("is not affected by the order in which independent mutations are applied", () => {
    const a = applyMutation(
      applyMutation(baseStructure(), {
        op: "ADD_WORKOUT_DAY",
        day: workoutDay("day-c", "Legs", 99),
      }),
      {
        op: "MODIFY_EXERCISE_PRESCRIPTION",
        prescriptionId: "p-3",
        changes: { targetSets: 4 },
      },
    );
    const b = applyMutation(
      applyMutation(baseStructure(), {
        op: "MODIFY_EXERCISE_PRESCRIPTION",
        prescriptionId: "p-3",
        changes: { targetSets: 4 },
      }),
      {
        op: "ADD_WORKOUT_DAY",
        day: workoutDay("day-c", "Legs", 99),
      },
    );
    expect(a).toEqual(b);
  });

  it("REPLACE_STRUCTURE returns a structure deep-equal to the supplied one", () => {
    const replacement: ProgramStructure = {
      workoutDays: [
        workoutDay("day-x", "Full Body", 0, [
          prescription("px-1", "ex-squat", 0),
        ]),
      ],
    };
    const next = applyMutation(baseStructure(), {
      op: "REPLACE_STRUCTURE",
      structure: replacement,
    });
    expect(next).toEqual(replacement);
  });

  it("two structurally identical REPLACE_STRUCTURE inputs produce structurally identical outputs", () => {
    const make = (): ProgramStructure => ({
      workoutDays: [
        workoutDay("d", "N", 0, [prescription("p", "e", 0)]),
      ],
    });
    const one = applyMutation(baseStructure(), {
      op: "REPLACE_STRUCTURE",
      structure: make(),
    });
    const two = applyMutation(baseStructure(), {
      op: "REPLACE_STRUCTURE",
      structure: make(),
    });
    expect(one).toEqual(two);
  });

  it("does not leak state between successive calls in the same process", () => {
    // Apply a mutation that removes a day, then apply a different mutation to
    // a fresh input, and assert the second call is unaffected by the first.
    // This is the mechanical version of "simulate and commit don't step on
    // each other."
    applyMutation(baseStructure(), {
      op: "REMOVE_WORKOUT_DAY",
      workoutDayId: "day-a",
    });
    const next = applyMutation(baseStructure(), {
      op: "REMOVE_WORKOUT_DAY",
      workoutDayId: "day-b",
    });
    expect(next.workoutDays.map((d) => d.id)).toEqual(["day-a"]);
  });

  it("throws a fresh MutationError instance on each failing call, not a cached one", () => {
    const call = () => {
      try {
        applyMutation(baseStructure(), {
          op: "REMOVE_WORKOUT_DAY",
          workoutDayId: "nope",
        });
      } catch (e) {
        return e;
      }
      return undefined;
    };
    const first = call();
    const second = call();
    expect(first).not.toBe(second);
    expect(first).toBeInstanceOf(Error);
    expect(second).toBeInstanceOf(Error);
  });
});