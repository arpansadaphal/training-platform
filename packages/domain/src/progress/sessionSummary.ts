// packages/domain/src/progress/sessionSummary.ts
//
// The post-workout summary: what the session just completed looked like,
// compared with the previous session of the same day. Pure and computed on
// read from stored data, so revisiting a summary later shows the same thing
// (callers pass only history from before this session).
//
// Copy is factual and uses invariants 9 and 10 as a filter: no promises, no
// cause, no guilt. A session short of its planned sets is stated as a count,
// not as a shortfall.

import { convertLoad, epleyE1rm, type WeightUnit } from "./e1rm";
import { topSetOf, totalVolumeOf, type LoggedSet } from "./history";

export interface MuscleInvolvement {
  muscle: string;
  /** 0–1: how much one set of the exercise counts toward the muscle. */
  factor: number;
}

export interface SummaryExerciseInput {
  exerciseId: string;
  exerciseName: string;
  /** Unit every load in this exercise's set lists is expressed in. */
  unit: WeightUnit;
  plannedSets: number;
  involvements: readonly MuscleInvolvement[];
  /** This session's sets of the exercise. */
  current: readonly LoggedSet[];
  /** The previous same-day session's sets of this exercise; empty when it was not in that session. */
  previous: readonly LoggedSet[];
  /** Highest estimated 1RM from sessions completed before this one; null when none. */
  priorBestE1rm: number | null;
}

export interface SessionSummaryInput {
  /** ISO timestamps. */
  startedAt: string | null;
  completedAt: string | null;
  /** Whether an earlier session of the same day exists to compare with. */
  hasPreviousSession: boolean;
  exercises: readonly SummaryExerciseInput[];
}

export interface MuscleVolumeDelta {
  muscle: string;
  /** Credited sets this session (sets × involvement factor), one decimal. */
  sets: number;
  /** Credited sets last time; null when there is no previous session. */
  previousSets: number | null;
  /** sets − previousSets; null when there is no previous session. */
  delta: number | null;
}

export interface NewPersonalRecord {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  unit: WeightUnit;
}

export interface SessionSummary {
  durationSeconds: number | null;
  plannedSets: number;
  loggedSets: number;
  /** Total load × reps this session, in kg. */
  totalVolumeKg: number;
  /** Percent change in volume against last time, over exercises logged with a load in both; null when none are shared. */
  volumeChangePercent: number | null;
  volumeDeltaPerMuscle: MuscleVolumeDelta[];
  newPRs: NewPersonalRecord[];
  verdict: string;
}

function volumeKg(sets: readonly LoggedSet[], unit: WeightUnit): number {
  return convertLoad(totalVolumeOf(sets), unit, "kg");
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeSessionSummary(
  input: SessionSummaryInput,
): SessionSummary {
  let durationSeconds: number | null = null;
  if (input.startedAt !== null && input.completedAt !== null) {
    const ms = Date.parse(input.completedAt) - Date.parse(input.startedAt);
    if (Number.isFinite(ms)) durationSeconds = Math.max(0, Math.round(ms / 1000));
  }

  let plannedSets = 0;
  let loggedSets = 0;
  let totalVolumeKg = 0;
  let sharedNow = 0;
  let sharedBefore = 0;
  const muscleNow = new Map<string, number>();
  const musclePrev = new Map<string, number>();
  const newPRs: NewPersonalRecord[] = [];

  for (const ex of input.exercises) {
    plannedSets += ex.plannedSets;
    loggedSets += ex.current.length;
    const nowVol = volumeKg(ex.current, ex.unit);
    totalVolumeKg += nowVol;

    const prevVol = volumeKg(ex.previous, ex.unit);
    if (nowVol > 0 && prevVol > 0) {
      sharedNow += nowVol;
      sharedBefore += prevVol;
    }

    for (const inv of ex.involvements) {
      muscleNow.set(
        inv.muscle,
        (muscleNow.get(inv.muscle) ?? 0) + inv.factor * ex.current.length,
      );
      musclePrev.set(
        inv.muscle,
        (musclePrev.get(inv.muscle) ?? 0) + inv.factor * ex.previous.length,
      );
    }

    // A PR needs history to beat: a first-ever session is a baseline.
    const top = topSetOf(ex.current);
    if (top !== null && ex.priorBestE1rm !== null) {
      const e1rm = epleyE1rm(top.weight, top.reps);
      if (e1rm !== null && e1rm > ex.priorBestE1rm) {
        newPRs.push({
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          weight: top.weight,
          reps: top.reps,
          unit: ex.unit,
        });
      }
    }
  }

  const volumeChangePercent =
    sharedBefore > 0 ? ((sharedNow - sharedBefore) / sharedBefore) * 100 : null;

  const volumeDeltaPerMuscle: MuscleVolumeDelta[] = [...muscleNow.entries()]
    .filter(([, sets]) => sets > 0)
    .map(([muscle, sets]) => {
      const prev = input.hasPreviousSession ? (musclePrev.get(muscle) ?? 0) : null;
      return {
        muscle,
        sets: round1(sets),
        previousSets: prev === null ? null : round1(prev),
        delta: prev === null ? null : round1(sets - prev),
      };
    })
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));

  return {
    durationSeconds,
    plannedSets,
    loggedSets,
    totalVolumeKg,
    volumeChangePercent,
    volumeDeltaPerMuscle,
    newPRs,
    verdict: summaryVerdict({
      plannedSets,
      loggedSets,
      volumeChangePercent,
      hasPreviousSession: input.hasPreviousSession,
      newPRCount: newPRs.length,
      firstPRName: newPRs[0]?.exerciseName ?? null,
    }),
  };
}

function summaryVerdict(args: {
  plannedSets: number;
  loggedSets: number;
  volumeChangePercent: number | null;
  hasPreviousSession: boolean;
  newPRCount: number;
  firstPRName: string | null;
}): string {
  if (args.loggedSets === 0) return "Session complete. No sets were logged.";

  const parts: string[] = [
    args.loggedSets >= args.plannedSets ? "Solid session." : "Session complete.",
  ];

  if (args.newPRCount === 1 && args.firstPRName !== null) {
    parts.push(`New PR on ${args.firstPRName}.`);
  } else if (args.newPRCount > 1) {
    parts.push(`New PRs on ${args.newPRCount} lifts.`);
  }

  if (args.volumeChangePercent !== null) {
    const pct = Math.round(Math.abs(args.volumeChangePercent));
    if (pct < 1) parts.push("Total volume is about the same as last time.");
    else if (args.volumeChangePercent > 0) parts.push(`Total volume up ${pct}% from last time.`);
    else parts.push(`Total volume down ${pct}% from last time.`);
  } else if (!args.hasPreviousSession) {
    parts.push("This is your first logged session of this day, so it sets the baseline.");
  }

  return parts.join(" ");
}
