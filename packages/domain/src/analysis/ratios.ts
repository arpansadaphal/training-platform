// packages/domain/src/analysis/ratios.ts
//
// Cross-muscle balance facts: push vs pull, arms vs legs, quads vs hamstrings.
//
// INFORMATIONAL. Tier 3 (a coaching comparison, not a measured threshold). The result is never read by a
// band, a severity, a leverage or the Fit projection (invariant 8 is untouched): it is carried on
// Analysis/Assessment as a plain fact for the UI to state.
//
// How a set is counted. Each prescription contributes `creditedSets` (the same effort-aware hard-set credit
// VOLUME uses) to a group ONCE, however many muscles it works. A muscle-by-muscle sum of VOLUME was tried
// first and rejected: a row credits lats 1 + upper back 0.5 + biceps 0.5 + rear delts 0.5 = 2.5 per set while
// a bench press credits chest 1 + triceps 0.5 = 1.5, so a sum would read any evenly built program as
// pull-heavy. Counting the set once removes that bias.
//
//   push  = a push-pattern exercise (horizontal or vertical), or one whose primary mover is chest, front delts,
//           side delts or triceps
//   pull  = a pull-pattern exercise (horizontal or vertical), or one whose primary mover is lats, upper back,
//           rear delts or biceps
//   arms  = primary mover is biceps or triceps
//   legs  = primary mover is quads, hamstrings, glutes or calves
//   quads / hamstrings = primary mover is that muscle
//
// "Primary mover" is involvementFactor >= 1 (the seed convention: 1.0 primary, 0.5 synergist). Front delts are
// not a goal-relevant group, so a vertical press is recognised by its movement pattern instead.
//
// A pair is null when both of its totals are 0; `ratio` is first / second, or null when second is 0.

import type { ProgramStructure } from "../types";
import type {
  CrossMuscleRatios,
  ExerciseReferenceData,
  GoalProfileConfig,
  MovementPattern,
} from "./types";
import { creditedSets, resolveHardSetCreditConfig } from "./hardSetCredit";

const PUSH_PATTERNS: ReadonlySet<MovementPattern> = new Set(["HORIZONTAL_PUSH", "VERTICAL_PUSH"]);
const PULL_PATTERNS: ReadonlySet<MovementPattern> = new Set(["HORIZONTAL_PULL", "VERTICAL_PULL"]);
const PUSH_MUSCLES: ReadonlySet<string> = new Set(["chest", "front delts", "side delts", "triceps"]);
const PULL_MUSCLES: ReadonlySet<string> = new Set(["lats", "upper back", "rear delts", "biceps"]);
const ARM_MUSCLES: ReadonlySet<string> = new Set(["biceps", "triceps"]);
const LEG_MUSCLES: ReadonlySet<string> = new Set(["quads", "hamstrings", "glutes", "calves"]);

const round1 = (n: number): number => Math.round(n * 10) / 10;

function pair(first: number, second: number): { a: number; b: number; ratio: number | null } | null {
  if (first <= 0 && second <= 0) return null;
  return { a: round1(first), b: round1(second), ratio: second > 0 ? round1(first / second) : null };
}

export function computeCrossMuscleRatios(
  structure: ProgramStructure,
  referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
): CrossMuscleRatios {
  const credit = resolveHardSetCreditConfig(config);
  const nameById = new Map(referenceData.muscleGroups.map((m) => [m.id, m.name]));
  const patternByExercise = new Map(referenceData.exercises.map((e) => [e.id, e.movementPattern]));

  // exerciseId -> names of muscles it moves as a primary mover
  const primaries = new Map<string, Set<string>>();
  for (const inv of referenceData.involvements) {
    if (!(inv.involvementFactor >= 1)) continue;
    const name = nameById.get(inv.muscleGroupId);
    if (name === undefined) continue; // not a goal-relevant group
    let set = primaries.get(inv.exerciseId);
    if (!set) {
      set = new Set();
      primaries.set(inv.exerciseId, set);
    }
    set.add(name);
  }
  const hasAny = (mine: ReadonlySet<string> | undefined, wanted: ReadonlySet<string>): boolean => {
    if (!mine) return false;
    for (const m of mine) if (wanted.has(m)) return true;
    return false;
  };

  let push = 0;
  let pull = 0;
  let arms = 0;
  let legs = 0;
  let quads = 0;
  let hams = 0;

  for (const day of structure.workoutDays) {
    for (const p of day.prescriptions) {
      const sets = creditedSets(p, credit);
      if (sets <= 0) continue;
      const mine = primaries.get(p.exerciseId);
      const pattern = patternByExercise.get(p.exerciseId);
      if ((pattern !== undefined && PUSH_PATTERNS.has(pattern)) || hasAny(mine, PUSH_MUSCLES)) push += sets;
      if ((pattern !== undefined && PULL_PATTERNS.has(pattern)) || hasAny(mine, PULL_MUSCLES)) pull += sets;
      if (hasAny(mine, ARM_MUSCLES)) arms += sets;
      if (hasAny(mine, LEG_MUSCLES)) legs += sets;
      if (mine?.has("quads")) quads += sets;
      if (mine?.has("hamstrings")) hams += sets;
    }
  }

  const pp = pair(push, pull);
  const al = pair(arms, legs);
  const qh = pair(quads, hams);
  return {
    pushPull: pp && { pushSets: pp.a, pullSets: pp.b, ratio: pp.ratio },
    armsLegs: al && { armSets: al.a, legSets: al.b, ratio: al.ratio },
    quadsHamstrings: qh && { quadSets: qh.a, hamstringSets: qh.b, ratio: qh.ratio },
  };
}
