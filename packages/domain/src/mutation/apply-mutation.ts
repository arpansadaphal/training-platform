// packages/domain/src/mutation/apply-mutation.ts
//
// The single mutation function. PURE: no Prisma, no HTTP, no session, no I/O.
// Takes a ProgramStructure and a MutationSpec, returns a new ProgramStructure.
//
// This is the function whose existence makes invariant 2 ("simulate and apply
// share one mutation function") literally true in code rather than true by
// convention. If you find yourself adding a second applyX function alongside
// this one — even for a "trivial" case — stop. That is the failure invariant 2
// forbids.

import type {
  ExercisePrescriptionStructure,
  LoadScheme,
  ProgramStructure,
  WorkoutDayStructure,
} from "../types";
import { MutationError, type MutationSpec } from "./types";

export function applyMutation(
  structure: ProgramStructure,
  mutation: MutationSpec,
): ProgramStructure {
  return normalizeStructure(dispatch(structure, mutation));
}

// ─── dispatch ────────────────────────────────────────────────────────────────

function dispatch(
  structure: ProgramStructure,
  mutation: MutationSpec,
): ProgramStructure {
  switch (mutation.op) {
    case "ADD_WORKOUT_DAY":
      return addWorkoutDay(structure, mutation.day);
    case "REMOVE_WORKOUT_DAY":
      return removeWorkoutDay(structure, mutation.workoutDayId);
    case "ADD_EXERCISE_PRESCRIPTION":
      return addExercisePrescription(
        structure,
        mutation.workoutDayId,
        mutation.prescription,
      );
    case "REMOVE_EXERCISE_PRESCRIPTION":
      return removeExercisePrescription(structure, mutation.prescriptionId);
    case "MODIFY_EXERCISE_PRESCRIPTION":
      return modifyExercisePrescription(
        structure,
        mutation.prescriptionId,
        mutation.changes,
      );
    case "REORDER_EXERCISE_PRESCRIPTIONS":
      return reorderExercisePrescriptions(
        structure,
        mutation.workoutDayId,
        mutation.orderedIds,
      );
    case "REPLACE_STRUCTURE":
      // Returned as-is; normalizeStructure below does the deep clone, the
      // orderIndex renumber, and the duplicate-id safety check.
      return mutation.structure;
  }
}

// ─── operations ──────────────────────────────────────────────────────────────

function addWorkoutDay(
  base: ProgramStructure,
  day: WorkoutDayStructure,
): ProgramStructure {
  // `day.orderIndex` is treated as an insertion hint, not an override:
  // a day with orderIndex 1 inserts before what is currently at index 1,
  // and a day with orderIndex >= length appends. normalizeStructure then
  // renumbers everyone contiguously.
  const insertAt = clamp(day.orderIndex, 0, base.workoutDays.length);
  const days = [...base.workoutDays];
  days.splice(insertAt, 0, day);
  return { ...base, workoutDays: days };
}

function removeWorkoutDay(
  base: ProgramStructure,
  workoutDayId: string,
): ProgramStructure {
  const idx = base.workoutDays.findIndex((d) => d.id === workoutDayId);
  if (idx < 0) {
    throw new MutationError(
      "WORKOUT_DAY_NOT_FOUND",
      `No workout day with id "${workoutDayId}".`,
      { workoutDayId },
    );
  }
  const days = base.workoutDays.filter((_, i) => i !== idx);
  return { ...base, workoutDays: days };
}

function addExercisePrescription(
  base: ProgramStructure,
  workoutDayId: string,
  prescription: ExercisePrescriptionStructure,
): ProgramStructure {
  const dayIndex = base.workoutDays.findIndex((d) => d.id === workoutDayId);
  if (dayIndex < 0) {
    throw new MutationError(
      "WORKOUT_DAY_NOT_FOUND",
      `No workout day with id "${workoutDayId}".`,
      { workoutDayId },
    );
  }
  const day = base.workoutDays[dayIndex];
  if (day === undefined) {
    // Unreachable given the findIndex check above; the guard exists only
    // because noUncheckedIndexedAccess types the index access as `| undefined`.
    throw new Error(
      "Unreachable: findIndex returned a valid index but array access returned undefined.",
    );
  }

  const insertAt = clamp(
    prescription.orderIndex,
    0,
    day.prescriptions.length,
  );
  const prescriptions = [...day.prescriptions];
  prescriptions.splice(insertAt, 0, prescription);

  const days = base.workoutDays.map((d, i) =>
    i === dayIndex ? { ...d, prescriptions } : d,
  );
  return { ...base, workoutDays: days };
}

function removeExercisePrescription(
  base: ProgramStructure,
  prescriptionId: string,
): ProgramStructure {
  const located = locatePrescription(base, prescriptionId);
  const day = base.workoutDays[located.dayIndex];
  if (day === undefined) throw new Error("Unreachable: located day missing.");

  const prescriptions = day.prescriptions.filter(
    (_, i) => i !== located.prescriptionIndex,
  );
  const days = base.workoutDays.map((d, i) =>
    i === located.dayIndex ? { ...d, prescriptions } : d,
  );
  return { ...base, workoutDays: days };
}

function modifyExercisePrescription(
  base: ProgramStructure,
  prescriptionId: string,
  changes: Partial<ExercisePrescriptionStructure>,
): ProgramStructure {
  const located = locatePrescription(base, prescriptionId);
  const day = base.workoutDays[located.dayIndex];
  if (day === undefined) throw new Error("Unreachable: located day missing.");
  const original = day.prescriptions[located.prescriptionIndex];
  if (original === undefined) {
    throw new Error("Unreachable: located prescription missing.");
  }

  // `id` is pinned back to the original so MODIFY can never rename a
  // prescription (that would break every reference held elsewhere). Any
  // orderIndex change that comes in via `changes` is intentionally
  // overridden by normalizeStructure, which renumbers by array position.
  // Reordering is REORDER_EXERCISE_PRESCRIPTIONS' job.
  const updated: ExercisePrescriptionStructure = {
    ...original,
    ...changes,
    id: original.id,
  };

  const prescriptions = day.prescriptions.map((p, i) =>
    i === located.prescriptionIndex ? updated : p,
  );
  const days = base.workoutDays.map((d, i) =>
    i === located.dayIndex ? { ...d, prescriptions } : d,
  );
  return { ...base, workoutDays: days };
}

function reorderExercisePrescriptions(
  base: ProgramStructure,
  workoutDayId: string,
  orderedIds: string[],
): ProgramStructure {
  const dayIndex = base.workoutDays.findIndex((d) => d.id === workoutDayId);
  if (dayIndex < 0) {
    throw new MutationError(
      "WORKOUT_DAY_NOT_FOUND",
      `No workout day with id "${workoutDayId}".`,
      { workoutDayId },
    );
  }
  const day = base.workoutDays[dayIndex];
  if (day === undefined) throw new Error("Unreachable: located day missing.");

  if (orderedIds.length !== day.prescriptions.length) {
    throw new MutationError(
      "REORDER_MISMATCH",
      `Reorder list has ${orderedIds.length} id(s) but workout day "${workoutDayId}" has ${day.prescriptions.length} prescription(s).`,
      {
        workoutDayId,
        expected: day.prescriptions.length,
        got: orderedIds.length,
      },
    );
  }

  const requested = new Set(orderedIds);
  if (requested.size !== orderedIds.length) {
    throw new MutationError(
      "REORDER_DUPLICATE_ID",
      `Reorder list for workout day "${workoutDayId}" contains duplicate ids.`,
      { workoutDayId, orderedIds },
    );
  }

  const byId = new Map(day.prescriptions.map((p) => [p.id, p]));
  const reordered: ExercisePrescriptionStructure[] = [];
  for (const id of orderedIds) {
    const p = byId.get(id);
    if (p === undefined) {
      throw new MutationError(
        "REORDER_MISMATCH",
        `Reorder list for workout day "${workoutDayId}" references unknown prescription id "${id}".`,
        { workoutDayId, prescriptionId: id },
      );
    }
    reordered.push(p);
  }

  const days = base.workoutDays.map((d, i) =>
    i === dayIndex ? { ...d, prescriptions: reordered } : d,
  );
  return { ...base, workoutDays: days };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

interface LocatedPrescription {
  dayIndex: number;
  prescriptionIndex: number;
}

function locatePrescription(
  structure: ProgramStructure,
  prescriptionId: string,
): LocatedPrescription {
  for (let dayIndex = 0; dayIndex < structure.workoutDays.length; dayIndex++) {
    const day = structure.workoutDays[dayIndex];
    if (day === undefined) continue;
    const prescriptionIndex = day.prescriptions.findIndex(
      (p) => p.id === prescriptionId,
    );
    if (prescriptionIndex >= 0) {
      return { dayIndex, prescriptionIndex };
    }
  }
  throw new MutationError(
    "PRESCRIPTION_NOT_FOUND",
    `No exercise prescription with id "${prescriptionId}" exists in this structure.`,
    { prescriptionId },
  );
}

/**
 * Deep-clones the structure, renumbers orderIndex contiguously (day order by
 * array position, prescription order within each day by array position), and
 * asserts id uniqueness. Every applyMutation branch funnels through here, so
 * the returned structure is always a fresh object tree that shares no
 * references with the input — the purity contract that lets callers treat
 * inputs as values, not as shared mutable state.
 */
function normalizeStructure(structure: ProgramStructure): ProgramStructure {
  const cloned: ProgramStructure = {
    ...structure,
    workoutDays: structure.workoutDays.map((day, dayIndex) => ({
      ...day,
      orderIndex: dayIndex,
      prescriptions: day.prescriptions.map((p, pIndex) => ({
        ...p,
        orderIndex: pIndex,
        loadScheme: cloneLoadScheme(p.loadScheme),
      })),
    })),
  };

  assertUniqueIds(cloned);

  return cloned;
}

function assertUniqueIds(structure: ProgramStructure): void {
  const seenDayIds = new Set<string>();
  for (const day of structure.workoutDays) {
    if (seenDayIds.has(day.id)) {
      throw new MutationError(
        "DUPLICATE_WORKOUT_DAY_ID",
        `Duplicate workout day id "${day.id}".`,
        { workoutDayId: day.id },
      );
    }
    seenDayIds.add(day.id);

    const seenPrescriptionIds = new Set<string>();
    for (const p of day.prescriptions) {
      if (seenPrescriptionIds.has(p.id)) {
        throw new MutationError(
          "DUPLICATE_PRESCRIPTION_ID",
          `Duplicate prescription id "${p.id}" in workout day "${day.id}".`,
          { workoutDayId: day.id, prescriptionId: p.id },
        );
      }
      seenPrescriptionIds.add(p.id);
    }
  }
}

function cloneLoadScheme(scheme: LoadScheme): LoadScheme {
  switch (scheme.type) {
    case "PERCENT_1RM":
      return { type: "PERCENT_1RM", percent: scheme.percent };
    case "RPE_BASED":
      return { type: "RPE_BASED", rpe: scheme.rpe };
    case "FIXED_WEIGHT":
      return { type: "FIXED_WEIGHT", weight: scheme.weight, unit: scheme.unit };
    case "BODYWEIGHT":
      return { type: "BODYWEIGHT" };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}