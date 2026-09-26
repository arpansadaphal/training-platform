// packages/domain/src/mutation/__tests__/apply-mutation.test.ts
import { describe, it, expect } from "vitest";
import { applyMutation } from "../apply-mutation";
import { MutationError } from "../types";
import type { MutationSpec } from "../types";
import type {
  ExercisePrescriptionStructure,
  LoadScheme,
  ProgramStructure,
  WorkoutDayStructure,
} from "../../types";

// ─── fixtures ────────────────────────────────────────────────────────────────
//
// Inline builders, deliberately not shared with other test files: mutations
// are the one place a shared fixture would be actively harmful, because a test
// that "passes" because a bug mutated the shared fixture is exactly the class
// of failure applyMutation's purity contract exists to prevent.

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

function structure(days: WorkoutDayStructure[]): ProgramStructure {
  return { workoutDays: days };
}

/**
 * A two-day, three-prescription base used by most tests. Contents are
 * deliberately mundane — the tests care about structural integrity, not about
 * whether the numbers are physiologically sensible.
 */
function baseStructure(): ProgramStructure {
  return structure([
    workoutDay("day-a", "Push", 0, [
      prescription("p-1", "ex-bench", 0),
      prescription("p-2", "ex-ohp", 1),
    ]),
    workoutDay("day-b", "Pull", 1, [
      prescription("p-3", "ex-row", 0),
    ]),
  ]);
}

// ─── ADD_WORKOUT_DAY ─────────────────────────────────────────────────────────

describe("applyMutation — ADD_WORKOUT_DAY", () => {
  it("appends a day when orderIndex is past the end", () => {
    const next = applyMutation(baseStructure(), {
      op: "ADD_WORKOUT_DAY",
      day: workoutDay("day-c", "Legs", 99),
    });
    expect(next.workoutDays.map((d) => d.id)).toEqual([
      "day-a",
      "day-b",
      "day-c",
    ]);
  });

  it("inserts a day at the specified index without reordering the others", () => {
    const next = applyMutation(baseStructure(), {
      op: "ADD_WORKOUT_DAY",
      day: workoutDay("day-x", "Accessory", 1),
    });
    expect(next.workoutDays.map((d) => d.id)).toEqual([
      "day-a",
      "day-x",
      "day-b",
    ]);
  });

  it("clamps negative and out-of-range orderIndex rather than throwing", () => {
    const low = applyMutation(baseStructure(), {
      op: "ADD_WORKOUT_DAY",
      day: workoutDay("day-first", "First", -5),
    });
    expect(low.workoutDays[0]?.id).toBe("day-first");

    const high = applyMutation(baseStructure(), {
      op: "ADD_WORKOUT_DAY",
      day: workoutDay("day-last", "Last", 500),
    });
    expect(high.workoutDays[high.workoutDays.length - 1]?.id).toBe("day-last");
  });

  it("renumbers orderIndex contiguously after insert", () => {
    const next = applyMutation(baseStructure(), {
      op: "ADD_WORKOUT_DAY",
      day: workoutDay("day-x", "Accessory", 1),
    });
    expect(next.workoutDays.map((d) => d.orderIndex)).toEqual([0, 1, 2]);
  });
});

// ─── REMOVE_WORKOUT_DAY ──────────────────────────────────────────────────────

describe("applyMutation — REMOVE_WORKOUT_DAY", () => {
  it("removes the day by id", () => {
    const next = applyMutation(baseStructure(), {
      op: "REMOVE_WORKOUT_DAY",
      workoutDayId: "day-a",
    });
    expect(next.workoutDays.map((d) => d.id)).toEqual(["day-b"]);
  });

  it("renumbers orderIndex contiguously after removal", () => {
    const next = applyMutation(baseStructure(), {
      op: "REMOVE_WORKOUT_DAY",
      workoutDayId: "day-a",
    });
    expect(next.workoutDays[0]?.orderIndex).toBe(0);
  });

  it("throws MutationError with code WORKOUT_DAY_NOT_FOUND for an unknown id", () => {
    let caught: unknown;
    try {
      applyMutation(baseStructure(), {
        op: "REMOVE_WORKOUT_DAY",
        workoutDayId: "nope",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MutationError);
    expect((caught as MutationError).code).toBe("WORKOUT_DAY_NOT_FOUND");
  });
});

// ─── ADD_EXERCISE_PRESCRIPTION ───────────────────────────────────────────────

describe("applyMutation — ADD_EXERCISE_PRESCRIPTION", () => {
  it("appends a prescription to an existing day", () => {
    const next = applyMutation(baseStructure(), {
      op: "ADD_EXERCISE_PRESCRIPTION",
      workoutDayId: "day-b",
      prescription: prescription("p-4", "ex-curl", 99),
    });
    const dayB = next.workoutDays.find((d) => d.id === "day-b");
    expect(dayB?.prescriptions.map((p) => p.id)).toEqual(["p-3", "p-4"]);
  });

  it("inserts at the specified index", () => {
    const next = applyMutation(baseStructure(), {
      op: "ADD_EXERCISE_PRESCRIPTION",
      workoutDayId: "day-a",
      prescription: prescription("p-x", "ex-fly", 1),
    });
    const dayA = next.workoutDays.find((d) => d.id === "day-a");
    expect(dayA?.prescriptions.map((p) => p.id)).toEqual([
      "p-1",
      "p-x",
      "p-2",
    ]);
  });

  it("does not modify any other day's prescriptions", () => {
    const next = applyMutation(baseStructure(), {
      op: "ADD_EXERCISE_PRESCRIPTION",
      workoutDayId: "day-a",
      prescription: prescription("p-x", "ex-fly", 0),
    });
    const dayB = next.workoutDays.find((d) => d.id === "day-b");
    expect(dayB?.prescriptions.map((p) => p.id)).toEqual(["p-3"]);
  });

  it("throws WORKOUT_DAY_NOT_FOUND for an unknown workoutDayId", () => {
    let caught: unknown;
    try {
      applyMutation(baseStructure(), {
        op: "ADD_EXERCISE_PRESCRIPTION",
        workoutDayId: "nope",
        prescription: prescription("p-x", "ex-fly", 0),
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MutationError);
    expect((caught as MutationError).code).toBe("WORKOUT_DAY_NOT_FOUND");
  });
});

// ─── REMOVE_EXERCISE_PRESCRIPTION ────────────────────────────────────────────

describe("applyMutation — REMOVE_EXERCISE_PRESCRIPTION", () => {
  it("removes the prescription from whichever day contains it", () => {
    const next = applyMutation(baseStructure(), {
      op: "REMOVE_EXERCISE_PRESCRIPTION",
      prescriptionId: "p-1",
    });
    const dayA = next.workoutDays.find((d) => d.id === "day-a");
    expect(dayA?.prescriptions.map((p) => p.id)).toEqual(["p-2"]);
  });

  it("renumbers the remaining prescriptions contiguously", () => {
    const next = applyMutation(baseStructure(), {
      op: "REMOVE_EXERCISE_PRESCRIPTION",
      prescriptionId: "p-1",
    });
    const dayA = next.workoutDays.find((d) => d.id === "day-a");
    expect(dayA?.prescriptions.map((p) => p.orderIndex)).toEqual([0]);
  });

  it("throws PRESCRIPTION_NOT_FOUND for an unknown id", () => {
    let caught: unknown;
    try {
      applyMutation(baseStructure(), {
        op: "REMOVE_EXERCISE_PRESCRIPTION",
        prescriptionId: "nope",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MutationError);
    expect((caught as MutationError).code).toBe("PRESCRIPTION_NOT_FOUND");
  });
});

// ─── MODIFY_EXERCISE_PRESCRIPTION ────────────────────────────────────────────

describe("applyMutation — MODIFY_EXERCISE_PRESCRIPTION", () => {
  it("applies the supplied partial changes", () => {
    const next = applyMutation(baseStructure(), {
      op: "MODIFY_EXERCISE_PRESCRIPTION",
      prescriptionId: "p-1",
      changes: { targetSets: 5, targetRepsLow: 5, targetRepsHigh: 8 },
    });
    const p = next.workoutDays
      .find((d) => d.id === "day-a")
      ?.prescriptions.find((x) => x.id === "p-1");
    expect(p?.targetSets).toBe(5);
    expect(p?.targetRepsLow).toBe(5);
    expect(p?.targetRepsHigh).toBe(8);
  });

  it("preserves the prescription's id even when changes tries to override it", () => {
    const next = applyMutation(baseStructure(), {
      op: "MODIFY_EXERCISE_PRESCRIPTION",
      prescriptionId: "p-1",
      changes: { id: "hijacked" } as Partial<ExercisePrescriptionStructure>,
    });
    const dayA = next.workoutDays.find((d) => d.id === "day-a");
    expect(dayA?.prescriptions.some((p) => p.id === "p-1")).toBe(true);
    expect(dayA?.prescriptions.some((p) => p.id === "hijacked")).toBe(false);
  });

  it("does not disturb other fields of the same prescription", () => {
    const next = applyMutation(baseStructure(), {
      op: "MODIFY_EXERCISE_PRESCRIPTION",
      prescriptionId: "p-1",
      changes: { targetSets: 4 },
    });
    const p = next.workoutDays
      .find((d) => d.id === "day-a")
      ?.prescriptions.find((x) => x.id === "p-1");
    expect(p?.exerciseId).toBe("ex-bench");
    expect(p?.targetRepsLow).toBe(8);
    expect(p?.targetRepsHigh).toBe(12);
  });

  it("throws PRESCRIPTION_NOT_FOUND for an unknown id", () => {
    let caught: unknown;
    try {
      applyMutation(baseStructure(), {
        op: "MODIFY_EXERCISE_PRESCRIPTION",
        prescriptionId: "nope",
        changes: { targetSets: 9 },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MutationError);
    expect((caught as MutationError).code).toBe("PRESCRIPTION_NOT_FOUND");
  });
});

// ─── REORDER_EXERCISE_PRESCRIPTIONS ──────────────────────────────────────────

describe("applyMutation — REORDER_EXERCISE_PRESCRIPTIONS", () => {
  it("reorders prescriptions to match the supplied id list", () => {
    const next = applyMutation(baseStructure(), {
      op: "REORDER_EXERCISE_PRESCRIPTIONS",
      workoutDayId: "day-a",
      orderedIds: ["p-2", "p-1"],
    });
    const dayA = next.workoutDays.find((d) => d.id === "day-a");
    expect(dayA?.prescriptions.map((p) => p.id)).toEqual(["p-2", "p-1"]);
  });

  it("renumbers orderIndex contiguously after reorder", () => {
    const next = applyMutation(baseStructure(), {
      op: "REORDER_EXERCISE_PRESCRIPTIONS",
      workoutDayId: "day-a",
      orderedIds: ["p-2", "p-1"],
    });
    const dayA = next.workoutDays.find((d) => d.id === "day-a");
    expect(dayA?.prescriptions.map((p) => p.orderIndex)).toEqual([0, 1]);
  });

  it("throws WORKOUT_DAY_NOT_FOUND for an unknown workoutDayId", () => {
    let caught: unknown;
    try {
      applyMutation(baseStructure(), {
        op: "REORDER_EXERCISE_PRESCRIPTIONS",
        workoutDayId: "nope",
        orderedIds: [],
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MutationError);
    expect((caught as MutationError).code).toBe("WORKOUT_DAY_NOT_FOUND");
  });

  it("throws REORDER_MISMATCH when the id list length differs from the day's prescription count", () => {
    let caught: unknown;
    try {
      applyMutation(baseStructure(), {
        op: "REORDER_EXERCISE_PRESCRIPTIONS",
        workoutDayId: "day-a",
        orderedIds: ["p-1"],
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MutationError);
    expect((caught as MutationError).code).toBe("REORDER_MISMATCH");
  });

  it("throws REORDER_DUPLICATE_ID when the id list contains duplicates", () => {
    let caught: unknown;
    try {
      applyMutation(baseStructure(), {
        op: "REORDER_EXERCISE_PRESCRIPTIONS",
        workoutDayId: "day-a",
        orderedIds: ["p-1", "p-1"],
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MutationError);
    expect((caught as MutationError).code).toBe("REORDER_DUPLICATE_ID");
  });

  it("throws REORDER_MISMATCH when the id list references an unknown prescription", () => {
    let caught: unknown;
    try {
      applyMutation(baseStructure(), {
        op: "REORDER_EXERCISE_PRESCRIPTIONS",
        workoutDayId: "day-a",
        orderedIds: ["p-1", "p-unknown"],
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MutationError);
    expect((caught as MutationError).code).toBe("REORDER_MISMATCH");
  });
});

// ─── REPLACE_STRUCTURE ───────────────────────────────────────────────────────

describe("applyMutation — REPLACE_STRUCTURE", () => {
  it("returns a structure equivalent to the supplied one", () => {
    const replacement = structure([
      workoutDay("day-z", "Full Body", 0, [
        prescription("p-z1", "ex-squat", 0),
      ]),
    ]);
    const next = applyMutation(baseStructure(), {
      op: "REPLACE_STRUCTURE",
      structure: replacement,
    });
    expect(next).toEqual(replacement);
  });

  it("renumbers orderIndex contiguously when the supplied structure's indices are inconsistent", () => {
    const messy = structure([
      workoutDay("day-a", "Push", 7, [
        prescription("p-1", "ex-bench", 4),
        prescription("p-2", "ex-ohp", 2),
      ]),
      workoutDay("day-b", "Pull", 0, []),
    ]);
    const next = applyMutation(baseStructure(), {
      op: "REPLACE_STRUCTURE",
      structure: messy,
    });
    expect(next.workoutDays.map((d) => d.orderIndex)).toEqual([0, 1]);
    expect(next.workoutDays[0]?.prescriptions.map((p) => p.orderIndex)).toEqual([
      0, 1,
    ]);
  });

  it("throws DUPLICATE_WORKOUT_DAY_ID when the supplied structure has repeated day ids", () => {
    const bad = structure([
      workoutDay("day-a", "Push", 0, []),
      workoutDay("day-a", "Pull", 1, []),
    ]);
    let caught: unknown;
    try {
      applyMutation(baseStructure(), {
        op: "REPLACE_STRUCTURE",
        structure: bad,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MutationError);
    expect((caught as MutationError).code).toBe("DUPLICATE_WORKOUT_DAY_ID");
  });

  it("throws DUPLICATE_PRESCRIPTION_ID when the supplied structure repeats a prescription id within one day", () => {
    const bad = structure([
      workoutDay("day-a", "Push", 0, [
        prescription("p-1", "ex-bench", 0),
        prescription("p-1", "ex-ohp", 1),
      ]),
    ]);
    let caught: unknown;
    try {
      applyMutation(baseStructure(), {
        op: "REPLACE_STRUCTURE",
        structure: bad,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MutationError);
    expect((caught as MutationError).code).toBe("DUPLICATE_PRESCRIPTION_ID");
  });
});

// ─── purity / immutability of the input ──────────────────────────────────────

describe("applyMutation — input immutability", () => {
  const allOps: MutationSpec[] = [
    {
      op: "ADD_WORKOUT_DAY",
      day: workoutDay("day-new", "New", 0),
    },
    { op: "REMOVE_WORKOUT_DAY", workoutDayId: "day-a" },
    {
      op: "ADD_EXERCISE_PRESCRIPTION",
      workoutDayId: "day-a",
      prescription: prescription("p-new", "ex-new", 0),
    },
    { op: "REMOVE_EXERCISE_PRESCRIPTION", prescriptionId: "p-1" },
    {
      op: "MODIFY_EXERCISE_PRESCRIPTION",
      prescriptionId: "p-1",
      changes: { targetSets: 9 },
    },
    {
      op: "REORDER_EXERCISE_PRESCRIPTIONS",
      workoutDayId: "day-a",
      orderedIds: ["p-2", "p-1"],
    },
    {
      op: "REPLACE_STRUCTURE",
      structure: structure([workoutDay("day-only", "Only", 0)]),
    },
  ];

  it.each(allOps)(
    "does not mutate the input structure for op $op",
    (mutation) => {
      const input = baseStructure();
      const snapshotBefore = JSON.stringify(input);
      applyMutation(input, mutation);
      expect(JSON.stringify(input)).toBe(snapshotBefore);
    },
  );

  it("returns a structure that shares no object references with the input", () => {
    const input = baseStructure();
    const next = applyMutation(input, {
      op: "MODIFY_EXERCISE_PRESCRIPTION",
      prescriptionId: "p-1",
      changes: { targetSets: 5 },
    });
    expect(next).not.toBe(input);
    expect(next.workoutDays).not.toBe(input.workoutDays);
    expect(next.workoutDays[0]).not.toBe(input.workoutDays[0]);
    expect(next.workoutDays[0]?.prescriptions).not.toBe(
      input.workoutDays[0]?.prescriptions,
    );
    // And the deep clone reached the LoadScheme, which is the only nested
    // object beyond the two levels above.
    expect(next.workoutDays[0]?.prescriptions[0]?.loadScheme).not.toBe(
      input.workoutDays[0]?.prescriptions[0]?.loadScheme,
    );
  });
});