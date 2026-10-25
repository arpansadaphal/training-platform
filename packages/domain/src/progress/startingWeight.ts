// packages/domain/src/progress/startingWeight.ts
//
// "Find your starting weight" (ARCH-062): for an exercise the lifter has no
// history with. After each set they say how many more they could have done;
// the answer is stored as the set's effort, and a weight is suggested for the
// next set. Pure; the screen shows the suggestion and never fills it in.
//
// The arithmetic is the Epley estimate used everywhere else (e1rm.ts), run
// forwards (reps at a load -> estimated max) and backwards (a max -> the load
// for a chosen rep count). It is an estimate for choosing a first weight to
// try, which is all it is presented as.

import { floorToGrid, GRID } from "./loadSteps";
import type { LoggedSet } from "./history";
import type { WeightUnit } from "./e1rm";
import { RPE_OPTIONS } from "../session/loggingOptions";

export interface RepsLeftAnswer {
  /** The button's text: "0", "1-2", "3-4", "5-6", "7+". */
  id: string;
  /** Reps left in the tank, the middle of the answer. */
  repsLeft: number;
  /** What is stored as the set's RPE: ten minus the reps left. */
  rpe: number;
}

export const REPS_LEFT_ANSWERS: readonly RepsLeftAnswer[] = [
  { id: "0", repsLeft: 0, rpe: 10 },
  { id: "1-2", repsLeft: 1.5, rpe: 8.5 },
  { id: "3-4", repsLeft: 3.5, rpe: 6.5 },
  { id: "5-6", repsLeft: 5.5, rpe: 4.5 },
  { id: "7+", repsLeft: 8, rpe: 2 },
];

/** Reps left after an RPE, in the picker's own words ("1-2 reps left"). */
export function repsLeftText(rpe: number): string {
  const answer = REPS_LEFT_ANSWERS.find((a) => a.rpe === rpe);
  if (answer) return answer.id === "7+" ? "7+ reps left" : `${answer.id} reps left`;
  const option = RPE_OPTIONS.find((o) => o.rpe === rpe);
  if (option) return option.rpe === 9 ? "1 rep left" : `${option.detail}`;
  return `${Math.max(0, Math.round(10 - rpe))} reps left`;
}

/** The effort a plan asks for as an instruction: "stop with 2-3 reps left". */
export function stopWithText(plannedRpe: number | null): string | null {
  if (plannedRpe === null || !Number.isFinite(plannedRpe)) return null;
  const text = repsLeftText(plannedRpe);
  return `stop with ${text}`;
}

/** Where the start-light weight aims: the middle of the rep range, 2-3 reps left. */
const AIM_REPS_LEFT = 2.5;
/** A first-session weight never jumps more than this over the set just done. */
const MAX_JUMP = 1.2;

/**
 * The weight to try for the next set (or the next session), from one set:
 * its load, its reps, and how many more the lifter could have done. Null when
 * the set has no usable load or reps. Rounded down to the weight list's grid.
 */
export function suggestWeight(args: {
  load: number | null;
  reps: number | null;
  repsLeft: number;
  repsLow: number;
  repsHigh: number;
  unit: WeightUnit;
}): number | null {
  const { load, reps, repsLeft, repsLow, repsHigh, unit } = args;
  if (load === null || reps === null || !(load > 0) || !(reps > 0)) return null;
  const estimatedMax = load * (1 + (reps + repsLeft) / 30);
  const aimReps = (repsLow + repsHigh) / 2;
  const raw = estimatedMax / (1 + (aimReps + AIM_REPS_LEFT) / 30);
  const capped = Math.min(raw, load * MAX_JUMP);
  const grid = GRID[unit];
  return Math.max(grid, floorToGrid(capped, unit));
}

/**
 * The starting weight for the NEXT session, from a session that was spent
 * finding it: the suggestion from the last set that carries a load, reps and
 * an effort. Null when no set does.
 */
export function startingWeightFromSession(args: {
  sets: readonly LoggedSet[];
  repsLow: number;
  repsHigh: number;
  unit: WeightUnit;
}): number | null {
  for (let i = args.sets.length - 1; i >= 0; i--) {
    const s = args.sets[i]!;
    if (s.rpe === null) continue;
    const suggestion = suggestWeight({
      load: s.load,
      reps: s.reps,
      repsLeft: Math.max(0, 10 - s.rpe),
      repsLow: args.repsLow,
      repsHigh: args.repsHigh,
      unit: args.unit,
    });
    if (suggestion !== null) return suggestion;
  }
  return null;
}
