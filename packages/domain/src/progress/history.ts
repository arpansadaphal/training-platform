// packages/domain/src/progress/history.ts
//
// Per-exercise history for the Progress view: one record per completed
// session, built from that session's logged sets.
//
// The domain has no logged-set type of its own (the plan side is
// ProgramStructure), so the shapes here are domain-local. Loads are expected
// in ONE unit per exercise; the api layer converts with `convertLoad` before
// calling in. Dates are ISO strings so records cross the tRPC boundary (no
// transformer) and sort lexicographically.

import { epleyE1rm } from "./e1rm";

export interface LoggedSet {
  reps: number | null;
  load: number | null;
  rpe: number | null;
}

export interface SessionSets {
  sessionId: string;
  /** ISO timestamp of the session's completion. */
  date: string;
  sets: readonly LoggedSet[];
}

export interface TopSet {
  weight: number;
  reps: number;
  rpe: number | null;
}

export interface ExerciseSessionRecord {
  sessionId: string;
  date: string;
  topSet: TopSet;
  estimated1RM: number;
  /** Sum of load × reps over the session's sets that have both. */
  totalVolume: number;
  /** True when this session's estimated1RM is the highest so far for the exercise. */
  isPersonalRecord: boolean;
}

/**
 * The heaviest set that has both a load and reps; ties go to more reps. Same
 * rule as the "Last time" hint. Null when no set carries a positive load and
 * positive reps (a bodyweight-only exercise, or sets logged without a weight).
 */
export function topSetOf(sets: readonly LoggedSet[]): TopSet | null {
  let best: TopSet | null = null;
  for (const s of sets) {
    if (s.load === null || s.reps === null) continue;
    if (!(s.load > 0) || !(s.reps > 0)) continue;
    if (
      best === null ||
      s.load > best.weight ||
      (s.load === best.weight && s.reps > best.reps)
    ) {
      best = { weight: s.load, reps: s.reps, rpe: s.rpe };
    }
  }
  return best;
}

export function totalVolumeOf(sets: readonly LoggedSet[]): number {
  let total = 0;
  for (const s of sets) {
    if (s.load === null || s.reps === null) continue;
    if (!(s.load > 0) || !(s.reps > 0)) continue;
    total += s.load * s.reps;
  }
  return total;
}

/**
 * Builds the oldest-first record list for one exercise. Sessions with no
 * loaded set are dropped (nothing to trend). The personal-record flag marks
 * every session whose estimated 1RM strictly beat all earlier ones, so the
 * first loaded session is a record only in the trivial sense; callers that
 * celebrate PRs should require an earlier session (see computeSessionSummary).
 */
export function buildExerciseHistory(
  sessions: readonly SessionSets[],
): ExerciseSessionRecord[] {
  const ordered = [...sessions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const records: ExerciseSessionRecord[] = [];
  let bestSoFar = 0;
  for (const session of ordered) {
    const top = topSetOf(session.sets);
    if (top === null) continue;
    const e1rm = epleyE1rm(top.weight, top.reps);
    if (e1rm === null) continue;
    records.push({
      sessionId: session.sessionId,
      date: session.date,
      topSet: top,
      estimated1RM: e1rm,
      totalVolume: totalVolumeOf(session.sets),
      isPersonalRecord: e1rm > bestSoFar,
    });
    if (e1rm > bestSoFar) bestSoFar = e1rm;
  }
  return records;
}
