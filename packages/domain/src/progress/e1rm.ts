// packages/domain/src/progress/e1rm.ts
//
// Estimated one-rep max and load-unit helpers for the Progress view.
//
// Epley: e1RM = load × (1 + reps / 30). A single rep is the load itself
// (the formula's +1/30 on one rep would overstate a tested max). Like
// `epleyMaxReps` in analysis/progressionSoundness.ts, this is an estimate for
// trend-reading, not a measurement; the Progress view never presents it as one.

export type WeightUnit = "kg" | "lb";

const KG_PER_LB = 0.45359237;

/** Epley estimated 1RM, or null when load or reps is missing or not positive. */
export function epleyE1rm(
  load: number | null,
  reps: number | null,
): number | null {
  if (load === null || reps === null) return null;
  if (!(load > 0) || !(reps > 0)) return null;
  if (reps === 1) return load;
  return load * (1 + reps / 30);
}

/** Converts a logged load between units; identity when the units match. */
export function convertLoad(
  load: number,
  from: WeightUnit,
  to: WeightUnit,
): number {
  if (from === to) return load;
  return from === "lb" ? load * KG_PER_LB : load / KG_PER_LB;
}
