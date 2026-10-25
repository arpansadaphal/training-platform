// packages/api/src/services/todayService.ts
//
// The dashboard's "Today" card: what the lifter is doing today, with a target
// for every lift (ARCH-062), or, for a few hours after a session, what they
// just did and what is next. Facts from the lifter's own logs only: no streaks,
// no schedule it cannot know (the rotation says which day is next, not which
// weekday), no promises.
//
// Pure: identityService loads the rows in one step and hands them here.

import type {
  ExercisePerformanceRecord,
  ExerciseRecord,
  PrescriptionRow,
  SessionRecord,
  WorkoutDayRow,
} from "@training/db";
import { buildExerciseHistory, type WeightUnit } from "@training/domain";
import { groupBySession, unitOf } from "./exerciseHistory";
import { replayRotationPointer, STALE_SESSION_AFTER_MS, lastTimeHintsFromRows } from "./sessionService";
import { computeTargetsForPrescriptions, wholeDaysSince } from "./targetsService";

/** For this long after finishing a session the card says "Done" before it offers the next one. */
export const JUST_FINISHED_MS = STALE_SESSION_AFTER_MS;

export interface TodayExercise {
  prescriptionId: string;
  exerciseId: string;
  name: string;
  equipment: string | null;
  sets: number;
  repsLow: number;
  repsHigh: number;
  /** The weight to aim for, in `unit`; null when there is nothing to base one on yet. */
  targetWeight: number | null;
  unit: WeightUnit;
  /** One plain sentence on why that target. */
  reason: string;
  /** "47.5 × 10" for the top set last time, or null. */
  last: { load: number | null; reps: number | null } | null;
}

export interface TodayPr {
  exerciseName: string;
  load: number;
  reps: number;
  unit: WeightUnit;
}

export interface TodayPlan {
  /**
   * NEXT: a day to start. IN_PROGRESS: a session is open. JUST_FINISHED:
   * a session was completed within JUST_FINISHED_MS and nothing is open.
   */
  state: "NEXT" | "IN_PROGRESS" | "JUST_FINISHED";
  dayName: string;
  isRestDay: boolean;
  /** The open Session's id when there is one. */
  sessionId: string | null;
  /** Rough, in minutes; null for a rest day. */
  estimatedMinutes: number | null;
  exercises: TodayExercise[];
  /** Set when the targets are lighter because of a gap (days since the last session). */
  comebackDays: number | null;
  /** JUST_FINISHED: the session just done. */
  finished: { dayName: string; sessionId: string; prs: TodayPr[] } | null;
  /** JUST_FINISHED: the day the rotation trains next. */
  nextDayName: string | null;
}

export interface TodayInput {
  now: Date;
  days: readonly WorkoutDayRow[];
  prescriptions: ReadonlyArray<PrescriptionRow & { workoutDayId: string }>;
  exercises: readonly ExerciseRecord[];
  /** Every Session of the block, in sequence order. */
  blockSessions: readonly SessionRecord[];
  /** The block's PLANNED or non-stale IN_PROGRESS Session, or null. */
  pending: SessionRecord | null;
  /** A stale IN_PROGRESS Session with logged sets will close COMPLETED on the next start. */
  staleHasRecords: boolean;
  staleSessionId: string | null;
  /** The lifter's earlier COMPLETED sets of this version's exercises, newest Session first. */
  history: readonly ExercisePerformanceRecord[];
  /** When the lifter last completed any session. */
  lastCompletedAt: Date | null;
}

const MS_PER_MINUTE = 60_000;

/** The middle value, or null for an empty list. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round5 = (n: number) => Math.round(n / 5) * 5;

/**
 * How long a day takes: the median of the lifter's own completed sessions of
 * that day (a session under 10 minutes is a test or a mis-tap, not a measure),
 * else 5 minutes plus a little under 3 minutes a set. Rounded to 5.
 */
export function estimateMinutes(
  dayName: string,
  totalSets: number,
  sessions: readonly SessionRecord[],
  daysById: ReadonlyMap<string, WorkoutDayRow>,
): number {
  const own = sessions
    .filter((s) => s.status === "COMPLETED" && s.startedAt !== null && s.completedAt !== null)
    .filter((s) => daysById.get(s.workoutDayId)?.name.toLowerCase() === dayName.toLowerCase())
    .map((s) => (s.completedAt!.getTime() - s.startedAt!.getTime()) / MS_PER_MINUTE)
    .filter((m) => m >= 10 && m <= 180);
  const measured = median(own);
  const minutes = measured ?? 5 + 2.75 * totalSets;
  return Math.max(5, Math.min(120, round5(minutes)));
}

export function buildTodayPlan(input: TodayInput): TodayPlan | null {
  const { now, days, prescriptions, exercises, blockSessions, pending, history } = input;
  if (days.length === 0) return null;

  const daysById = new Map(days.map((d) => [d.id, d]));
  const indexOf = (dayId: string) => days.findIndex((d) => d.id === dayId);
  const closed = blockSessions
    .filter(
      (s) =>
        s.status === "COMPLETED" ||
        s.status === "SKIPPED" ||
        (input.staleHasRecords && s.id === input.staleSessionId),
    )
    .map((s) => indexOf(s.workoutDayId));
  const pointer = replayRotationPointer(days.length, closed);

  const completed = blockSessions
    .filter((s) => s.status === "COMPLETED" && s.completedAt !== null)
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime());
  const lastFinished = completed[0] ?? null;
  const justFinished =
    pending === null &&
    lastFinished !== null &&
    now.getTime() - lastFinished.completedAt!.getTime() <= JUST_FINISHED_MS;

  const equipmentByExerciseId = new Map(exercises.map((e) => [e.id, e.equipment]));
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));

  if (justFinished && lastFinished) {
    const doneDay = daysById.get(lastFinished.workoutDayId);
    return {
      state: "JUST_FINISHED",
      dayName: doneDay?.name ?? "Workout",
      isRestDay: false,
      sessionId: null,
      estimatedMinutes: null,
      exercises: [],
      comebackDays: null,
      finished: {
        dayName: doneDay?.name ?? "Workout",
        sessionId: lastFinished.id,
        prs: personalRecordsOf(lastFinished, history, nameById),
      },
      nextDayName: days[pointer]?.name ?? null,
    };
  }

  const day = pending ? daysById.get(pending.workoutDayId) ?? days[pointer]! : days[pointer]!;
  const dayRx = prescriptions
    .filter((p) => p.workoutDayId === day.id)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const daysSince = wholeDaysSince(input.lastCompletedAt, now);
  const targets = computeTargetsForPrescriptions({
    prescriptions: dayRx,
    equipmentByExerciseId,
    history,
    daysSinceLastTraining: daysSince,
  });
  const hints = new Map(lastTimeHintsFromRows(history).map((h) => [h.exerciseId, h]));

  const todayExercises: TodayExercise[] = dayRx.map((p, i) => {
    const t = targets[i]!;
    const hint = hints.get(p.exerciseId);
    return {
      prescriptionId: p.id,
      exerciseId: p.exerciseId,
      name: nameById.get(p.exerciseId) ?? "Exercise",
      equipment: equipmentByExerciseId.get(p.exerciseId) ?? null,
      sets: p.targetSets,
      repsLow: p.targetRepsLow,
      repsHigh: p.targetRepsHigh,
      targetWeight: t.weight,
      unit: t.unit,
      reason: t.reason,
      last: hint ? { load: hint.load, reps: hint.reps } : null,
    };
  });

  const totalSets = dayRx.reduce((n, p) => n + p.targetSets, 0);
  return {
    state: pending?.status === "IN_PROGRESS" ? "IN_PROGRESS" : "NEXT",
    dayName: day.name,
    isRestDay: day.isRestDay,
    sessionId: pending?.id ?? null,
    estimatedMinutes: day.isRestDay ? null : estimateMinutes(day.name, totalSets, blockSessions, daysById),
    exercises: todayExercises,
    comebackDays: targets.some((t) => t.kind === "COMEBACK") ? daysSince : null,
    finished: null,
    nextDayName: null,
  };
}

/**
 * Lifts where the session just finished set a personal record: the highest
 * estimated 1RM so far, with an earlier session to beat (a first session is a
 * baseline, not a record). Same rule as the post-workout summary.
 */
function personalRecordsOf(
  finished: SessionRecord,
  history: readonly ExercisePerformanceRecord[],
  nameById: ReadonlyMap<string, string>,
): TodayPr[] {
  const byExercise = new Map<string, ExercisePerformanceRecord[]>();
  for (const r of history) {
    const list = byExercise.get(r.exerciseId) ?? [];
    list.push(r);
    byExercise.set(r.exerciseId, list);
  }
  const prs: TodayPr[] = [];
  for (const [exerciseId, rows] of byExercise) {
    if (!rows.some((r) => r.sessionId === finished.id)) continue;
    const unit = unitOf(rows[0]!.loadScheme);
    const records = buildExerciseHistory(groupBySession(rows, unit));
    const latest = records[records.length - 1];
    if (records.length >= 2 && latest && latest.sessionId === finished.id && latest.isPersonalRecord) {
      prs.push({
        exerciseName: nameById.get(exerciseId) ?? "Exercise",
        load: latest.topSet.weight,
        reps: latest.topSet.reps,
        unit,
      });
    }
  }
  return prs;
}
