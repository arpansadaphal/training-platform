// packages/domain/src/mutation/__tests__/diff-structures.test.ts
//
// The pure structural diff — an on-demand comparison between two
// ProgramStructures, never stored (invariant 3, 03-domain-model.md §Revision).
//
// This is a separate concern from diffAssessments (the "What Changed" payload
// the simulation surfaces). These tests assert the raw structural entries so
// a future history-view consumer has a stable contract.

import { describe, it, expect } from "vitest";
import type { ProgramStructure } from "../../types";
import { diffStructures } from "../diff-structures";

function empty(): ProgramStructure {
  return { workoutDays: [] };
}

function oneDay(
  overrides: {
    id?: string;
    name?: string;
    sets?: number;
    exerciseId?: string;
  } = {},
): ProgramStructure {
  const id = overrides.id ?? "day-a";
  const name = overrides.name ?? "Day A";
  const sets = overrides.sets ?? 3;
  const exerciseId = overrides.exerciseId ?? "ex-squat";
  return {
    workoutDays: [
      {
        id,
        orderIndex: 0,
        name,
        prescriptions: [
          {
            id: "rx-1",
            orderIndex: 0,
            exerciseId,
            targetSets: sets,
            targetRepsLow: 5,
            targetRepsHigh: 8,
            loadScheme: { type: "BODYWEIGHT" },
          },
        ],
      },
    ],
  };
}

function twoPrescriptions(): ProgramStructure {
  return {
    workoutDays: [
      {
        id: "day-a",
        orderIndex: 0,
        name: "A",
        prescriptions: [
          {
            id: "rx-1",
            orderIndex: 0,
            exerciseId: "ex-a",
            targetSets: 3,
            targetRepsLow: 5,
            targetRepsHigh: 8,
            loadScheme: { type: "BODYWEIGHT" },
          },
          {
            id: "rx-2",
            orderIndex: 1,
            exerciseId: "ex-b",
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

describe("diffStructures — empty / identical", () => {
  it("returns [] for two empty structures", () => {
    expect(diffStructures(empty(), empty())).toEqual([]);
  });

  it("returns [] for two structurally identical structures", () => {
    expect(diffStructures(oneDay(), oneDay())).toEqual([]);
  });

  it("is a pure function — does not mutate its inputs", () => {
    const base = oneDay();
    const mutated = oneDay({ sets: 5 });
    const baseSnapshot = JSON.parse(JSON.stringify(base));
    const mutatedSnapshot = JSON.parse(JSON.stringify(mutated));

    diffStructures(base, mutated);

    expect(base).toEqual(baseSnapshot);
    expect(mutated).toEqual(mutatedSnapshot);
  });
});

describe("diffStructures — workout-day level", () => {
  it("detects an added workout day", () => {
    const base = oneDay();
    const mutated: ProgramStructure = {
      workoutDays: [
        ...base.workoutDays,
        { id: "day-b", orderIndex: 1, name: "Day B", prescriptions: [] },
      ],
    };
    expect(diffStructures(base, mutated)).toContainEqual({
      op: "ADDED_WORKOUT_DAY",
      workoutDayId: "day-b",
      name: "Day B",
      orderIndex: 1,
    });
  });

  it("detects a removed workout day", () => {
    expect(diffStructures(oneDay(), empty())).toEqual([
      {
        op: "REMOVED_WORKOUT_DAY",
        workoutDayId: "day-a",
        name: "Day A",
        orderIndex: 0,
      },
    ]);
  });

  it("detects a reordered workout day by orderIndex change", () => {
    const base: ProgramStructure = {
      workoutDays: [
        { id: "day-a", orderIndex: 0, name: "A", prescriptions: [] },
        { id: "day-b", orderIndex: 1, name: "B", prescriptions: [] },
      ],
    };
    const mutated: ProgramStructure = {
      workoutDays: [
        { id: "day-b", orderIndex: 0, name: "B", prescriptions: [] },
        { id: "day-a", orderIndex: 1, name: "A", prescriptions: [] },
      ],
    };
    const diff = diffStructures(base, mutated);
    expect(diff).toContainEqual({
      op: "REORDERED_WORKOUT_DAY",
      workoutDayId: "day-a",
      fromIndex: 0,
      toIndex: 1,
    });
    expect(diff).toContainEqual({
      op: "REORDERED_WORKOUT_DAY",
      workoutDayId: "day-b",
      fromIndex: 1,
      toIndex: 0,
    });
  });

  it("does not enumerate prescriptions inside a wholly added day", () => {
    // A whole-day add already communicates "everything in this day is new";
    // enumerating each prescription would double the signal without adding
    // information. The test asserts that contract.
    const diff = diffStructures(empty(), oneDay());
    expect(diff).toEqual([
      {
        op: "ADDED_WORKOUT_DAY",
        workoutDayId: "day-a",
        name: "Day A",
        orderIndex: 0,
      },
    ]);
  });

  it("does not enumerate prescriptions inside a wholly removed day", () => {
    expect(diffStructures(oneDay(), empty())).toHaveLength(1);
  });
});

describe("diffStructures — prescription level within a surviving day", () => {
  it("detects an added prescription", () => {
    const base: ProgramStructure = {
      workoutDays: [
        { id: "day-a", orderIndex: 0, name: "A", prescriptions: [] },
      ],
    };
    const mutated: ProgramStructure = {
      workoutDays: [
        {
          id: "day-a",
          orderIndex: 0,
          name: "A",
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
    expect(diffStructures(base, mutated)).toEqual([
      {
        op: "ADDED_PRESCRIPTION",
        workoutDayId: "day-a",
        prescriptionId: "rx-1",
        exerciseId: "ex-squat",
        orderIndex: 0,
      },
    ]);
  });

  it("detects a removed prescription", () => {
    const base = oneDay();
    const mutated: ProgramStructure = {
      workoutDays: [
        { id: "day-a", orderIndex: 0, name: "Day A", prescriptions: [] },
      ],
    };
    expect(diffStructures(base, mutated)).toEqual([
      {
        op: "REMOVED_PRESCRIPTION",
        workoutDayId: "day-a",
        prescriptionId: "rx-1",
        exerciseId: "ex-squat",
        orderIndex: 0,
      },
    ]);
  });

  it("detects a single modified field", () => {
    const diff = diffStructures(oneDay({ sets: 3 }), oneDay({ sets: 5 }));
    expect(diff).toEqual([
      {
        op: "MODIFIED_PRESCRIPTION",
        workoutDayId: "day-a",
        prescriptionId: "rx-1",
        changedFields: ["targetSets"],
      },
    ]);
  });

  it("detects multiple modified fields on the same prescription", () => {
    const diff = diffStructures(
      oneDay({ sets: 3 }),
      oneDay({ sets: 5, exerciseId: "ex-bench" }),
    );
    expect(diff).toHaveLength(1);
    const entry = diff[0];
    if (!entry || entry.op !== "MODIFIED_PRESCRIPTION") {
      throw new Error(`expected MODIFIED_PRESCRIPTION, got ${entry?.op}`);
    }
    expect(entry.changedFields).toEqual(
      expect.arrayContaining(["targetSets", "exerciseId"]),
    );
    expect(entry.changedFields).toHaveLength(2);
  });

  it("treats a targetRpe null↔undefined transition as no change", () => {
    // The Prisma repository normalizes targetRpe with `?? null`; the diff
    // must match that normalization so a value that round-trips through the
    // DB as null does not appear as an edit against an in-memory undefined.
    const base = oneDay();
    const mutated: ProgramStructure = {
      workoutDays: base.workoutDays.map((d) => ({
        ...d,
        prescriptions: d.prescriptions.map((p) => {
          const { targetRpe: _unused, ...rest } = p;
          void _unused;
          return { ...rest, targetRpe: undefined };
        }),
      })),
    };
    expect(diffStructures(base, mutated)).toEqual([]);
  });

  it("detects a prescription-level reorder", () => {
    const base = twoPrescriptions();
    const mutated: ProgramStructure = {
      workoutDays: [
        {
          id: "day-a",
          orderIndex: 0,
          name: "A",
          prescriptions: [
            { ...base.workoutDays[0]!.prescriptions[1]!, orderIndex: 0 },
            { ...base.workoutDays[0]!.prescriptions[0]!, orderIndex: 1 },
          ],
        },
      ],
    };
    const diff = diffStructures(base, mutated);
    expect(diff).toContainEqual({
      op: "REORDERED_PRESCRIPTION",
      workoutDayId: "day-a",
      prescriptionId: "rx-1",
      fromIndex: 0,
      toIndex: 1,
    });
    expect(diff).toContainEqual({
      op: "REORDERED_PRESCRIPTION",
      workoutDayId: "day-a",
      prescriptionId: "rx-2",
      fromIndex: 1,
      toIndex: 0,
    });
  });
});