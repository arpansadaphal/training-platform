// packages/domain/src/progress/nextTargets.ts
//
// What to lift next: a fixed double-progression rule (ARCH-062). Pure and
// deterministic; the same inputs always give the same target and the same
// reason, and the reason is written for the lifter.
//
//   Fill the top of the rep range on every set (at the planned effort) and the
//   next session adds one load step. Fall short of the bottom of the range on
//   most sets and the weight holds; do it two sessions running and it drops
//   10%. After 10 or more days off the next session is 10% lighter.
//
// The numbers are product judgement, named below so they can be tuned from
// real logs. Targets are computed when a page is read and never stored, so a
// target is never the plan and no ProgramVersion changes.

import type { LoggedSet, SessionSets } from "./history";
import type { WeightUnit } from "./e1rm";
import { GRID, loadStepFor, roundToGrid } from "./loadSteps";
import { startingWeightFromSession } from "./startingWeight";

/** Days away from training (any exercise) after which the next session is lighter. */
export const COMEBACK_AFTER_DAYS = 10;
/** How much lighter a comeback session, and a two-misses deload, run. */
export const LIGHTER_BY = 0.1;
/** How many of the most recent sessions that all MISS trigger a deload. */
export const DELOAD_AFTER_MISSES = 2;

export interface TargetPrescription {
  targetSets: number;
  repsLow: number;
  repsHigh: number;
  /** The planned effort; null when the plan states none. */
  plannedRpe: number | null;
}

export interface NextTargetInput {
  /** Earlier COMPLETED sessions of this exercise, NEWEST first, loads already in `unit`. */
  history: readonly SessionSets[];
  prescription: TargetPrescription;
  equipment: string | null;
  unit: WeightUnit;
  /** Whole days since the lifter's last COMPLETED session of anything; null if none. */
  daysSinceLastTraining: number | null;
}

export type SessionOutcome = "ADVANCE" | "HOLD" | "MISS" | "TOO_HARD";

export type TargetKind =
  | "FIRST_TIME" // no loaded history: find your starting weight
  | "START" // a first session spent finding a weight: start from its estimate
  | "UP"
  | "HOLD"
  | "DELOAD"
  | "COMEBACK"
  | "MORE_REPS"; // bodyweight: progress by reps

export interface NextTarget {
  kind: TargetKind;
  /** The weight to aim for, in `unit`; null for FIRST_TIME. 0 is bodyweight. */
  weight: number | null;
  /** The rep range to work in. */
  repsLow: number;
  repsHigh: number;
  /** The load the last session was judged at; null with no loaded history. */
  lastLoad: number | null;
  /** One plain sentence for the lifter. */
  reason: string;
}

export interface SessionJudgement {
  outcome: SessionOutcome;
  /** The load the session is judged at (the most-used load; ties go heavier). */
  load: number;
  /** How many sets were judged (the sets at that load). */
  sets: number;
  /** How many of them fell below the bottom of the range. */
  below: number;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function repsOf(s: LoggedSet): number | null {
  return s.reps !== null && s.reps > 0 ? s.reps : null;
}

/**
 * The load a session is judged at: the load used on the most sets, ties to the
 * heavier. Bodyweight work (step 0) is judged at 0. Null when nothing usable.
 */
function sessionLoad(sets: readonly LoggedSet[], bodyweight: boolean): number | null {
  if (bodyweight) return sets.some((s) => repsOf(s) !== null) ? 0 : null;
  const counts = new Map<number, number>();
  for (const s of sets) {
    if (repsOf(s) === null || s.load === null || !(s.load > 0)) continue;
    counts.set(s.load, (counts.get(s.load) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [load, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && load > best)) {
      best = load;
      bestCount = count;
    }
  }
  return best;
}

/** Judges one past session against the rep range and planned effort. Null when it has no usable sets. */
export function judgeSession(
  sets: readonly LoggedSet[],
  rx: TargetPrescription,
  bodyweight: boolean,
): SessionJudgement | null {
  const load = sessionLoad(sets, bodyweight);
  if (load === null) return null;
  const atLoad = sets.filter((s) =>
    bodyweight ? repsOf(s) !== null : repsOf(s) !== null && s.load === load,
  );
  const below = atLoad.filter((s) => repsOf(s)! < rx.repsLow).length;
  const allTop = atLoad.every((s) => repsOf(s)! >= rx.repsHigh);
  const enough = atLoad.length >= rx.targetSets;
  const tooHard =
    rx.plannedRpe !== null &&
    atLoad.some((s) => s.rpe !== null && s.rpe > rx.plannedRpe! + 1);

  let outcome: SessionOutcome;
  if (below >= Math.ceil(atLoad.length / 2)) outcome = "MISS";
  else if (allTop && enough) outcome = tooHard ? "TOO_HARD" : "ADVANCE";
  else outcome = "HOLD";
  return { outcome, load, sets: atLoad.length, below };
}

/** "10% lighter" than `load`, on the grid, and at least one grid row down. */
function lighter(load: number, unit: WeightUnit): number {
  // Nothing lighter than the lightest row: leave the weight alone.
  if (load <= GRID[unit]) return load;
  const target = roundToGrid(load * (1 - LIGHTER_BY), unit);
  return Math.max(GRID[unit], Math.min(target, load - GRID[unit]));
}

/**
 * True when the sets show no working load: more than one weight was used and
 * none was used for a full set of sets. That is a session spent finding a
 * weight (20, 30, 40 once each), not a warm-up set before the work (one light
 * set, then three at the working weight).
 */
function isWeightFinding(sets: readonly LoggedSet[], targetSets: number): boolean {
  const counts = new Map<number, number>();
  for (const s of sets) {
    if (repsOf(s) === null || s.load === null || !(s.load > 0)) continue;
    counts.set(s.load, (counts.get(s.load) ?? 0) + 1);
  }
  return counts.size > 1 && Math.max(...counts.values()) < targetSets;
}

export function computeNextTargets(input: NextTargetInput): NextTarget {
  const { history, prescription: rx, equipment, unit, daysSinceLastTraining } = input;
  const step = loadStepFor(equipment, unit);
  const bodyweight = step === 0;
  const range = { repsLow: rx.repsLow, repsHigh: rx.repsHigh };

  // Judge the sessions newest first; sessions with nothing usable are skipped.
  const judged: Array<{ j: SessionJudgement; sets: readonly LoggedSet[] }> = [];
  for (const h of history) {
    const j = judgeSession(h.sets, rx, bodyweight);
    if (j !== null) judged.push({ j, sets: h.sets });
  }

  if (judged.length === 0) {
    return {
      kind: "FIRST_TIME",
      weight: bodyweight ? 0 : null,
      ...range,
      lastLoad: null,
      reason:
        history.length > 0 && !bodyweight
          ? "No weight was logged last time. Pick one to start from."
          : bodyweight
            ? `First time. Work in the ${rx.repsLow}–${rx.repsHigh} range.`
            : "First time. Find your starting weights.",
    };
  }

  const last = judged[0]!;
  const lastLoad = last.j.load;

  // A first session spent finding a weight: start from what it found.
  if (judged.length === 1 && !bodyweight && isWeightFinding(last.sets, rx.targetSets)) {
    const found = startingWeightFromSession({
      sets: last.sets,
      repsLow: rx.repsLow,
      repsHigh: rx.repsHigh,
      unit,
    });
    if (found !== null) {
      return {
        kind: "START",
        weight: found,
        ...range,
        lastLoad,
        reason: `Start at ${trim(found)} ${unit}, from how last time's sets felt.`,
      };
    }
  }

  // Comeback: a long gap makes the next session lighter, whatever the rule says.
  if (
    !bodyweight &&
    daysSinceLastTraining !== null &&
    daysSinceLastTraining >= COMEBACK_AFTER_DAYS
  ) {
    return {
      kind: "COMEBACK",
      weight: lighter(lastLoad, unit),
      ...range,
      lastLoad,
      reason: `Comeback: 10% lighter after ${daysSinceLastTraining} days off.`,
    };
  }

  const recent = judged.slice(0, DELOAD_AFTER_MISSES);
  if (
    recent.length === DELOAD_AFTER_MISSES &&
    recent.every((r) => r.j.outcome === "MISS") &&
    !bodyweight
  ) {
    return {
      kind: "DELOAD",
      weight: lighter(lastLoad, unit),
      ...range,
      lastLoad,
      reason: `Down 10%: two sessions in a row under ${rx.repsLow} reps. Build back up from here.`,
    };
  }

  if (bodyweight) return bodyweightTarget(last, rx, range);

  switch (last.j.outcome) {
    case "ADVANCE":
      return {
        kind: "UP",
        weight: lastLoad + step,
        ...range,
        lastLoad,
        reason: `Up ${trim(step)} ${unit}: you hit ${rx.repsHigh} reps on every set last time.`,
      };
    case "TOO_HARD":
      return {
        kind: "HOLD",
        weight: lastLoad,
        ...range,
        lastLoad,
        reason: `Same weight: you hit ${rx.repsHigh} reps, but it was harder than planned. Go up once it feels easier.`,
      };
    case "MISS":
      return {
        kind: "HOLD",
        weight: lastLoad,
        ...range,
        lastLoad,
        reason: `Same weight: ${last.j.below} of ${last.j.sets} sets were under ${rx.repsLow} reps last time.`,
      };
    default:
      return {
        kind: "HOLD",
        weight: lastLoad,
        ...range,
        lastLoad,
        reason: `Same weight: work up to ${rx.repsHigh} reps on every set, then go up.`,
      };
  }
}

/** Bodyweight work moves by reps: one more than the weakest set, up to the top of the range. */
function bodyweightTarget(
  last: { j: SessionJudgement; sets: readonly LoggedSet[] },
  rx: TargetPrescription,
  range: { repsLow: number; repsHigh: number },
): NextTarget {
  const reps = last.sets.map(repsOf).filter((r): r is number => r !== null);
  const weakest = Math.min(...reps);
  if (last.j.outcome === "ADVANCE" || weakest >= rx.repsHigh) {
    return {
      kind: "MORE_REPS",
      weight: 0,
      ...range,
      lastLoad: 0,
      reason: `You hit ${rx.repsHigh} on every set. Add weight or a harder variation when you can.`,
    };
  }
  const goal = Math.min(rx.repsHigh, weakest + 1);
  return {
    kind: "MORE_REPS",
    weight: 0,
    ...range,
    lastLoad: 0,
    reason: `Aim for ${goal} reps on every set, one more than your lowest set last time.`,
  };
}
