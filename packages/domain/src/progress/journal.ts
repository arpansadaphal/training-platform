// packages/domain/src/progress/journal.ts
//
// Project 4: the training journal. One entry per completed session: the day,
// how long it took, the top set of each lift, the lifts that set a new PR in
// words, and the lifter's own note, echoed as written. Pure and computed on
// read; nothing is stored.
//
// The caller (api) hands sessions oldest first with every load already in ONE
// unit per exercise, the same arrangement as the Progress view, so a PR means
// the same thing here as it does there and in the post-workout summary: the
// top set's estimated 1RM beats every earlier session of that lift, and a
// first session is a baseline, not a record.

import { epleyE1rm, type WeightUnit } from "./e1rm";
import { topSetOf, type LoggedSet } from "./history";

export interface JournalExerciseInput {
  exerciseId: string;
  exerciseName: string;
  /** Unit every load in `sets` is expressed in; the same for every session of this exercise. */
  unit: WeightUnit;
  sets: readonly LoggedSet[];
}

export interface JournalSessionInput {
  sessionId: string;
  dayName: string;
  /** ISO. */
  startedAt: string | null;
  /** ISO. */
  completedAt: string;
  /** The lifter's notes for the session, verbatim and joined, or null. */
  note: string | null;
  /** In the order the lifter did them. */
  exercises: readonly JournalExerciseInput[];
}

export interface JournalTopSet {
  exerciseId: string;
  exerciseName: string;
  unit: WeightUnit;
  /** Null for a lift logged without a weight (bodyweight). */
  weight: number | null;
  reps: number;
  /** "Squat 47.5 kg × 10" or "Pull-up × 12". */
  text: string;
}

export interface JournalEntry {
  sessionId: string;
  dayName: string;
  startedAt: string | null;
  completedAt: string;
  /** Whole minutes from start to finish, or null when the session has no start time. */
  durationMinutes: number | null;
  topSets: JournalTopSet[];
  /** Lifts whose top set beat every earlier session. */
  prExerciseNames: string[];
  /** "New PR on Squat and Bench", or null. */
  prLine: string | null;
  note: string | null;
}

function round1(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** "Squat 47.5 kg × 10", or "Pull-up × 12" with no weight. */
export function topSetText(name: string, weight: number | null, reps: number, unit: WeightUnit): string {
  return weight === null
    ? `${name} × ${reps}`
    : `${name} ${round1(weight)} ${unit} × ${reps}`;
}

/** The set a journal line shows: the heaviest loaded set, else the most reps. Null when no reps were logged. */
function journalTopSet(
  ex: JournalExerciseInput,
): { weight: number | null; reps: number } | null {
  const loaded = topSetOf(ex.sets);
  if (loaded !== null) return { weight: loaded.weight, reps: loaded.reps };
  let bestReps = 0;
  for (const s of ex.sets) {
    if (s.reps !== null && s.reps > bestReps) bestReps = s.reps;
  }
  return bestReps > 0 ? { weight: null, reps: bestReps } : null;
}

/** "Squat", "Squat and Bench", "Squat, Bench and Row", "Squat, Bench and 2 more". */
export function joinLifts(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export function durationMinutesOf(startedAt: string | null, completedAt: string): number | null {
  if (startedAt === null) return null;
  const ms = Date.parse(completedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 60000);
}

/** "45 min", "1 h 5 min", "Under 1 min". */
export function durationText(minutes: number): string {
  if (minutes < 1) return "Under 1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Entries for `sessions` (oldest first), in the same order. Walk the sessions
 * in time order so each lift's earlier best is known when a session is judged.
 */
export function buildJournalEntries(
  sessions: readonly JournalSessionInput[],
): JournalEntry[] {
  const bestE1rm = new Map<string, number>();
  const entries: JournalEntry[] = [];

  for (const session of sessions) {
    const topSets: JournalTopSet[] = [];
    const prNames: string[] = [];

    for (const ex of session.exercises) {
      const top = journalTopSet(ex);
      if (top !== null) {
        topSets.push({
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          unit: ex.unit,
          weight: top.weight,
          reps: top.reps,
          text: topSetText(ex.exerciseName, top.weight, top.reps, ex.unit),
        });
      }
      const loaded = topSetOf(ex.sets);
      const e1rm = loaded === null ? null : epleyE1rm(loaded.weight, loaded.reps);
      if (e1rm !== null) {
        const before = bestE1rm.get(ex.exerciseId);
        if (before !== undefined && e1rm > before) prNames.push(ex.exerciseName);
        if (before === undefined || e1rm > before) bestE1rm.set(ex.exerciseId, e1rm);
      }
    }

    entries.push({
      sessionId: session.sessionId,
      dayName: session.dayName,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      durationMinutes: durationMinutesOf(session.startedAt, session.completedAt),
      topSets,
      prExerciseNames: prNames,
      prLine: prNames.length === 0 ? null : `New PR on ${joinLifts(prNames)}`,
      note: session.note,
    });
  }
  return entries;
}
