// packages/api/src/services/progressService.ts
//
// Phase A3a: the Progress view and the post-workout summary.
//
// This file is the loading-and-mapping layer. The numbers and the copy come
// from the pure functions in @training/domain (progress/); nothing here
// touches the Analysis or Assessment engines, so calibration is unaffected.
//
// Logged loads carry no unit. The unit is read from the prescription's
// LoadScheme (lb only for FIXED_WEIGHT in lb, otherwise kg), the same rule as
// the "Last time" hint. Each exercise is shown in the unit of its newest
// session, and older sessions are converted into it.

import { TRPCError } from "@trpc/server";
import {
  findPreviousCompletedSessionOfDay,
  listAllInvolvements,
  listCompletedPerformancesForExercises,
  listCompletedPerformancesForUser,
  listExercisePerformancesForSession,
  listExercises,
  listMuscleGroups,
  type ExercisePerformanceRecord,
} from "@training/db";
import {
  buildExerciseHistory,
  computeProgressVerdict,
  computeSessionSummary,
  convertLoad,
  progressVerdictLine,
  type ExerciseSessionRecord,
  type LoggedSet,
  type MuscleInvolvement,
  type ProgressVerdict,
  type SessionSets,
  type SessionSummary,
  type SummaryExerciseInput,
  type WeightUnit,
} from "@training/domain";
import { getSessionContext } from "./sessionService";

function unitOf(loadScheme: unknown): WeightUnit {
  const scheme = loadScheme as { type?: string; unit?: string } | null;
  return scheme?.type === "FIXED_WEIGHT" && scheme.unit === "lb" ? "lb" : "kg";
}

function toSet(row: ExercisePerformanceRecord, unit: WeightUnit): LoggedSet {
  return {
    reps: row.actualReps,
    load:
      row.actualLoad === null
        ? null
        : convertLoad(row.actualLoad, unitOf(row.loadScheme), unit),
    rpe: row.actualRpe,
  };
}

/** Groups rows by Session into the domain's SessionSets, loads expressed in `unit`. */
function groupBySession(
  rows: readonly ExercisePerformanceRecord[],
  unit: WeightUnit,
): SessionSets[] {
  const bySession = new Map<string, SessionSets>();
  for (const row of rows) {
    if (row.sessionCompletedAt === null) continue;
    let entry = bySession.get(row.sessionId);
    if (entry === undefined) {
      entry = {
        sessionId: row.sessionId,
        date: row.sessionCompletedAt.toISOString(),
        sets: [],
      };
      bySession.set(row.sessionId, entry);
    }
    (entry.sets as LoggedSet[]).push(toSet(row, unit));
  }
  return [...bySession.values()];
}

// ─── Progress view ──────────────────────────────────────────────────────────

export interface ProgressExercise {
  exerciseId: string;
  exerciseName: string;
  unit: WeightUnit;
  /** Oldest first; sessions with no loaded set are absent. */
  records: ExerciseSessionRecord[];
  /** Completed sessions that included the exercise, loaded or not. */
  sessionsLogged: number;
  verdict: ProgressVerdict;
  verdictLine: string;
  /** The record with the highest estimated 1RM, or null with no loaded session. */
  personalRecord: ExerciseSessionRecord | null;
  /** ISO date of the newest completed session that included the exercise. */
  lastSessionDate: string;
}

/**
 * Every exercise the user has logged in a completed session, most recently
 * trained first.
 */
export async function getProgressForUser(
  userId: string,
): Promise<ProgressExercise[]> {
  const [rows, exercises] = await Promise.all([
    listCompletedPerformancesForUser(userId),
    listExercises(),
  ]);
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));

  // Rows arrive newest Session first, so the first row seen per exercise
  // fixes that exercise's display unit and last-session date.
  const byExercise = new Map<string, ExercisePerformanceRecord[]>();
  for (const row of rows) {
    if (row.sessionCompletedAt === null) continue;
    const list = byExercise.get(row.exerciseId);
    if (list === undefined) byExercise.set(row.exerciseId, [row]);
    else list.push(row);
  }

  const result: ProgressExercise[] = [];
  for (const [exerciseId, exerciseRows] of byExercise) {
    const unit = unitOf(exerciseRows[0]!.loadScheme);
    const sessions = groupBySession(exerciseRows, unit);
    const records = buildExerciseHistory(sessions);
    const verdict = computeProgressVerdict(records);
    const name = nameById.get(exerciseId) ?? "Exercise";
    const personalRecord = records.reduce<ExerciseSessionRecord | null>(
      (best, r) =>
        best === null || r.estimated1RM > best.estimated1RM ? r : best,
      null,
    );
    result.push({
      exerciseId,
      exerciseName: name,
      unit,
      records,
      sessionsLogged: sessions.length,
      verdict,
      verdictLine: progressVerdictLine(name, verdict),
      personalRecord,
      lastSessionDate: exerciseRows[0]!.sessionCompletedAt!.toISOString(),
    });
  }
  return result.sort((a, b) =>
    a.lastSessionDate < b.lastSessionDate ? 1 : a.lastSessionDate > b.lastSessionDate ? -1 : a.exerciseName.localeCompare(b.exerciseName),
  );
}

// ─── Post-workout summary ───────────────────────────────────────────────────

export interface SessionSummaryView {
  sessionId: string;
  programName: string;
  dayName: string;
  /** ISO. */
  completedAt: string;
  summary: SessionSummary;
  hasPreviousSession: boolean;
  /** Unit for `totalVolume`: lb only when every exercise with logged sets is in lb. */
  volumeUnit: WeightUnit;
  /** summary.totalVolumeKg expressed in `volumeUnit`. */
  totalVolume: number;
}

/** Computed on read from stored data; only history from before this session is used. */
export async function getSessionSummary(
  userId: string,
  sessionId: string,
): Promise<SessionSummaryView> {
  const ctx = await getSessionContext(userId, sessionId);
  const { session } = ctx;
  if (session.status !== "COMPLETED" || session.completedAt === null) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "A summary is only available for a completed session.",
    });
  }
  const completedAt = session.completedAt;

  const prescriptions = ctx.workoutDay.prescriptions;
  const exerciseIds = [...new Set(prescriptions.map((p) => p.exerciseId))];

  const previousSession = await findPreviousCompletedSessionOfDay(
    userId,
    ctx.program.id,
    ctx.workoutDay.name,
    completedAt,
    sessionId,
  );

  const [currentRows, previousRows, historyRows, involvements, muscleGroups] =
    await Promise.all([
      listExercisePerformancesForSession(sessionId),
      previousSession === null
        ? Promise.resolve([] as ExercisePerformanceRecord[])
        : listExercisePerformancesForSession(previousSession.id),
      listCompletedPerformancesForExercises(userId, exerciseIds, sessionId),
      listAllInvolvements(),
      listMuscleGroups(),
    ]);

  const muscleName = new Map(muscleGroups.map((m) => [m.id, m.name]));
  const involvementsByExercise = new Map<string, MuscleInvolvement[]>();
  for (const inv of involvements) {
    const muscle = muscleName.get(inv.muscleGroupId);
    if (muscle === undefined) continue;
    const list = involvementsByExercise.get(inv.exerciseId) ?? [];
    list.push({ muscle, factor: inv.involvementFactor });
    involvementsByExercise.set(inv.exerciseId, list);
  }

  // Only sessions completed before this one: a revisit never shifts.
  const earlierRows = historyRows.filter(
    (r) => r.sessionCompletedAt !== null && r.sessionCompletedAt < completedAt,
  );

  const exercises: SummaryExerciseInput[] = exerciseIds.map((exerciseId) => {
    const exercisePrescriptions = prescriptions.filter((p) => p.exerciseId === exerciseId);
    const own = currentRows.filter((r) => r.exerciseId === exerciseId);
    const unit = unitOf(own[0]?.loadScheme ?? exercisePrescriptions[0]!.loadScheme);
    const earlier = buildExerciseHistory(
      groupBySession(earlierRows.filter((r) => r.exerciseId === exerciseId), unit),
    );
    return {
      exerciseId,
      exerciseName: exercisePrescriptions[0]!.exerciseName,
      unit,
      plannedSets: exercisePrescriptions.reduce((n, p) => n + p.targetSets, 0),
      involvements: involvementsByExercise.get(exerciseId) ?? [],
      current: own.map((r) => toSet(r, unit)),
      previous: previousRows
        .filter((r) => r.exerciseId === exerciseId)
        .map((r) => toSet(r, unit)),
      priorBestE1rm:
        earlier.length === 0 ? null : Math.max(...earlier.map((r) => r.estimated1RM)),
    };
  });

  const summary = computeSessionSummary({
    startedAt: session.startedAt === null ? null : session.startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    hasPreviousSession: previousSession !== null,
    exercises,
  });

  const logged = exercises.filter((e) => e.current.length > 0);
  const volumeUnit: WeightUnit =
    logged.length > 0 && logged.every((e) => e.unit === "lb") ? "lb" : "kg";

  return {
    sessionId,
    programName: ctx.program.name,
    dayName: ctx.workoutDay.name,
    completedAt: completedAt.toISOString(),
    summary,
    hasPreviousSession: previousSession !== null,
    volumeUnit,
    totalVolume: convertLoad(summary.totalVolumeKg, "kg", volumeUnit),
  };
}
