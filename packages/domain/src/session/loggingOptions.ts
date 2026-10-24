// packages/domain/src/session/loggingOptions.ts
//
// The choices offered while logging a set: the weight list and the effort
// (RPE) list. Pure, outside the engine. The picker shows these; what is
// stored is still the plain number (a load, an RPE).
//
// RPE labels are the user's own words for effort, in reps left in the tank.
// They state what the number means; they do not judge it.

import { convertLoad, type WeightUnit } from "../progress/e1rm";

export const WEIGHT_STEP: Record<WeightUnit, number> = { kg: 2.5, lb: 5 };
export const WEIGHT_MAX: Record<WeightUnit, number> = { kg: 200, lb: 440 };
/** Where the list opens when the plan names no weight. */
export const DEFAULT_TARGET: Record<WeightUnit, number> = { kg: 20, lb: 45 };

export interface WeightOption {
  /** The number that is stored. 0 is bodyweight. */
  value: number;
  /** "52.5 kg", or "Bodyweight" for 0. */
  label: string;
  /** The same load in the other unit, shown small and grey; null for bodyweight. */
  otherLabel: string | null;
}

const OTHER: Record<WeightUnit, WeightUnit> = { kg: "lb", lb: "kg" };

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

export function weightOption(value: number, unit: WeightUnit): WeightOption {
  if (value === 0) return { value: 0, label: "Bodyweight", otherLabel: null };
  const other = OTHER[unit];
  const converted = convertLoad(value, unit, other);
  return {
    value,
    label: `${trim(value)} ${unit}`,
    // Whole pounds; kilograms to one decimal.
    otherLabel: `${trim(other === "lb" ? Math.round(converted) : converted)} ${other}`,
  };
}

/**
 * The weight list in ascending order: 0 (bodyweight), then every step up to
 * the maximum. `extras` (the plan's weight, a value already logged) that fall
 * between steps are added so they can always be chosen and found.
 */
export function weightOptions(unit: WeightUnit, extras: readonly number[] = []): WeightOption[] {
  const step = WEIGHT_STEP[unit];
  const values = new Set<number>();
  for (let v = 0; v <= WEIGHT_MAX[unit] + 1e-9; v += step) values.add(Math.round(v * 100) / 100);
  for (const e of extras) if (Number.isFinite(e) && e >= 0) values.add(Math.round(e * 100) / 100);
  return [...values].sort((a, b) => a - b).map((v) => weightOption(v, unit));
}

/** The value the list opens on: the plan's weight, else the default. */
export function weightTarget(unit: WeightUnit, planned: number | null): number {
  return planned !== null && planned > 0 ? planned : DEFAULT_TARGET[unit];
}

export interface RpeOption {
  rpe: number;
  /** "Hard" */
  name: string;
  /** "2-3 reps left" */
  detail: string;
}

export const RPE_OPTIONS: readonly RpeOption[] = [
  { rpe: 4, name: "Easy", detail: "6+ reps left" },
  { rpe: 6, name: "Moderate", detail: "4-5 reps left" },
  { rpe: 8, name: "Hard", detail: "2-3 reps left" },
  { rpe: 9, name: "Very hard", detail: "1 rep left" },
  { rpe: 10, name: "Max effort", detail: "0 reps left" },
];

/** "Hard — 2-3 reps left" */
export function rpeOptionText(o: RpeOption): string {
  return `${o.name} — ${o.detail}`;
}

/** "Hard — 2-3 reps left (RPE 8)"; a stored value between the options reads "RPE 7". */
export function rpeLabel(rpe: number): string {
  const o = RPE_OPTIONS.find((x) => x.rpe === rpe);
  return o ? `${rpeOptionText(o)} (RPE ${rpe})` : `RPE ${trim(rpe)}`;
}

/** The option nearest a plan's target RPE; a tie goes to the harder one. */
export function nearestRpeOption(target: number): RpeOption {
  let best = RPE_OPTIONS[0]!;
  for (const o of RPE_OPTIONS) {
    const d = Math.abs(o.rpe - target);
    const bd = Math.abs(best.rpe - target);
    if (d < bd || (d === bd && o.rpe > best.rpe)) best = o;
  }
  return best;
}
