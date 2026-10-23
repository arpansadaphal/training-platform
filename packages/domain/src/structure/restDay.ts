// packages/domain/src/structure/restDay.ts
//
// ARCH-061: rest days. A rest day is a WorkoutDay flagged `isRestDay` with no
// prescriptions. It takes part in the rotation (the user is told it is a rest
// day and moves on) but not in analysis or adherence.
//
// Lives outside analysis/: the engine stays untouched and callers strip rest
// days before handing a structure to it, so a rest day cannot change an
// axis whatever the axes come to count later.

import type { ProgramStructure, WorkoutDayStructure } from "./../types";

export const REST_DAY_NAME = "Rest";

export function isRestDay(day: { isRestDay?: boolean | null }): boolean {
  return day.isRestDay === true;
}

/** A new rest day for the Builder. */
export function makeRestDay(id: string, orderIndex: number): WorkoutDayStructure {
  return { id, orderIndex, name: REST_DAY_NAME, prescriptions: [], isRestDay: true };
}

/**
 * The structure as the analysis should see it: training days only, with the
 * same order. Returns the input itself when it has no rest days.
 */
export function withoutRestDays(structure: ProgramStructure): ProgramStructure {
  if (!structure.workoutDays.some(isRestDay)) return structure;
  return { ...structure, workoutDays: structure.workoutDays.filter((d) => !isRestDay(d)) };
}

/** Training days in a week's structure; rest days are not counted. */
export function trainingDayCount(structure: ProgramStructure): number {
  return structure.workoutDays.filter((d) => !isRestDay(d)).length;
}
