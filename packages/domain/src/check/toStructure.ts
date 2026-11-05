// packages/domain/src/check/toStructure.ts
//
// CompactProgram + a name -> id map -> ProgramStructure, with the defaults the
// Checker documents to the user: RPE 8 and a bodyweight load. The analysis
// reads program structure, not the weights.

import type { ProgramStructure } from "../types";
import type { CompactProgram } from "./types";

export const CHECK_DEFAULT_RPE = 8;

export type StructureResult =
  | { readonly ok: true; readonly structure: ProgramStructure }
  | { readonly ok: false; readonly unknownExercises: readonly string[] };

/** Names must match the library exactly (case-insensitively); unknown names are reported, never guessed. */
export function toProgramStructure(
  program: CompactProgram,
  idsByName: ReadonlyMap<string, string>,
): StructureResult {
  const byLower = new Map([...idsByName].map(([name, id]) => [name.toLowerCase(), id]));
  const unknown = new Set<string>();
  const workoutDays = program.days.map((day, di) => ({
    id: `check-d${di}`,
    orderIndex: di,
    name: day.name,
    prescriptions: day.rows.map(([name, sets, repLow, repHigh], ri) => {
      const exerciseId = byLower.get(name.toLowerCase());
      if (exerciseId === undefined) unknown.add(name);
      return {
        id: `check-d${di}r${ri}`,
        orderIndex: ri,
        exerciseId: exerciseId ?? "",
        targetSets: sets,
        targetRepsLow: repLow,
        targetRepsHigh: repHigh,
        targetRpe: CHECK_DEFAULT_RPE,
        loadScheme: { type: "BODYWEIGHT" as const },
      };
    }),
  }));
  if (unknown.size > 0) return { ok: false, unknownExercises: [...unknown] };
  return { ok: true, structure: { workoutDays } };
}
