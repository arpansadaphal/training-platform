// packages/domain/src/progress/loadSteps.ts
//
// How far a weight moves between sessions, by equipment (ARCH-062), and the
// weight list's grid that every target lands on. Pure.
//
// The step is a product choice (the smallest jump that is one real plate
// change on that equipment), not a measurement; it is a named table so it can
// be tuned from real logs.

import type { WeightUnit } from "./e1rm";

/** The weight picker's grid: every target is a row the lifter can choose. */
export const GRID: Record<WeightUnit, number> = { kg: 2.5, lb: 5 };

/** Load step per equipment, in kg. Bodyweight never changes weight. */
const STEP_KG: Record<string, number> = {
  barbell: 2.5,
  dumbbell: 2.5,
  cable: 2.5,
  machine: 5,
  bodyweight: 0,
};
const DEFAULT_STEP_KG = 2.5;

/** The same steps in pounds (a 2.5 kg plate is two 5 lb plates; a machine pin moves 10 lb). */
const STEP_LB: Record<string, number> = {
  barbell: 5,
  dumbbell: 5,
  cable: 5,
  machine: 10,
  bodyweight: 0,
};
const DEFAULT_STEP_LB = 5;

/** The weight added when a lift advances, in `unit`. 0 means progress by reps only. */
export function loadStepFor(equipment: string | null, unit: WeightUnit): number {
  const key = equipment === null ? "" : equipment.trim().toLowerCase();
  if (unit === "lb") return STEP_LB[key] ?? DEFAULT_STEP_LB;
  return STEP_KG[key] ?? DEFAULT_STEP_KG;
}

function clean(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Nearest grid row. */
export function roundToGrid(value: number, unit: WeightUnit): number {
  const g = GRID[unit];
  return clean(Math.round(value / g) * g);
}

/** The grid row at or below `value`: a suggestion never overshoots. */
export function floorToGrid(value: number, unit: WeightUnit): number {
  const g = GRID[unit];
  return clean(Math.floor(value / g + 1e-9) * g);
}
