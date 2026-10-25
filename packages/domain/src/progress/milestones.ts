// packages/domain/src/progress/milestones.ts
//
// Project 4: facts that happen once, shown once, inline on the post-workout
// summary: "Your 10th session.", "Four weeks since your first session.",
// "First session at 60 kg on Back Squat." No badge, no cabinet, no stored
// "shown" flag: each fact is true of exactly one session (the tenth is only
// ever the tenth; a weight is crossed once), so it is recomputed on read and a
// revisit of the same summary says the same thing.
//
// Not a streak. "Six weeks since your first session" is a date, and nothing
// here counts consecutive anything.

import type { WeightUnit } from "./e1rm";

export const SESSION_COUNT_MILESTONES: readonly number[] = [10, 25, 50, 100];
export const WEEK_MILESTONES: readonly number[] = [4, 8, 12];
/** A "round plate" is a multiple of 5 kg or 5 lb. */
export const ROUND_WEIGHT_STEP: Readonly<Record<WeightUnit, number>> = { kg: 5, lb: 5 };

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

const WEEK_WORDS: Readonly<Record<number, string>> = { 4: "Four", 8: "Eight", 12: "Twelve" };

export interface MilestoneExercise {
  exerciseName: string;
  unit: WeightUnit;
  /** Heaviest weight lifted for at least one rep this session; null when none. */
  topWeight: number | null;
  /** Heaviest weight lifted in any earlier session; null when the lift has no earlier loaded session. */
  priorMaxWeight: number | null;
}

export interface MilestoneInput {
  /** This session's place among the lifter's logged sessions, 1-based. */
  sessionNumber: number;
  /** ISO. */
  completedAt: string;
  /** ISO of the lifter's first logged session. */
  firstSessionAt: string;
  /** ISO of the logged session before this one; null for the first. */
  previousSessionAt: string | null;
  exercises: readonly MilestoneExercise[];
}

export function ordinalText(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Whole weeks between two ISO timestamps. */
export function weeksBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / MS_PER_WEEK) : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The highest round weight this session reached that no earlier session had. */
function weightMilestone(exercises: readonly MilestoneExercise[]): string | null {
  let best: { weight: number; name: string; unit: WeightUnit } | null = null;
  for (const ex of exercises) {
    // A lift with no earlier loaded session sets a baseline; there is
    // nothing yet that it is the first time past.
    if (ex.topWeight === null || ex.priorMaxWeight === null) continue;
    const step = ROUND_WEIGHT_STEP[ex.unit];
    const top = round2(ex.topWeight);
    const crossed = Math.floor(top / step) * step;
    if (crossed <= 0 || crossed <= round2(ex.priorMaxWeight)) continue;
    if (
      best === null ||
      crossed > best.weight ||
      (crossed === best.weight && ex.exerciseName < best.name)
    ) {
      best = { weight: crossed, name: ex.exerciseName, unit: ex.unit };
    }
  }
  return best === null ? null : `First session at ${best.weight} ${best.unit} on ${best.name}.`;
}

/**
 * The one fact worth saying about this session, or null. A session count wins
 * over weeks since the first session, which wins over a new round weight.
 */
export function sessionMilestone(input: MilestoneInput): string | null {
  if (SESSION_COUNT_MILESTONES.includes(input.sessionNumber)) {
    return `Your ${ordinalText(input.sessionNumber)} session.`;
  }

  if (input.previousSessionAt !== null) {
    const now = weeksBetween(input.firstSessionAt, input.completedAt);
    const before = weeksBetween(input.firstSessionAt, input.previousSessionAt);
    const crossed = WEEK_MILESTONES.filter((w) => now >= w && before < w);
    const highest = crossed[crossed.length - 1];
    if (highest !== undefined) {
      return `${WEEK_WORDS[highest]} weeks since your first session.`;
    }
  }

  return weightMilestone(input.exercises);
}
