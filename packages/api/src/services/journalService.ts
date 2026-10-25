// packages/api/src/services/journalService.ts
//
// Project 4: the training journal and the data export. Both read the same
// history the Progress view reads (every set in the lifter's COMPLETED
// sessions) and the sessions' notes, and compute on read. Nothing here is
// stored and no schema is involved.
//
// Loads carry no unit; each lift is read in the unit of its newest session
// (as the Progress view does), so a PR in the journal is the PR Progress shows.
// The export writes loads as logged, with the unit beside them.

import {
  listCompletedPerformancesForUser,
  listExercises,
  listJournalSessionsForUser,
  listPrescriptionOrderForUser,
  type ExercisePerformanceRecord,
} from "@training/db";
import {
  buildJournalEntries,
  buildTrainingCsv,
  type JournalEntry,
  type JournalExerciseInput,
  type JournalSessionInput,
  type TrainingCsvRow,
  type WeightUnit,
} from "@training/domain";
import { toSet, unitOf } from "./exerciseHistory";

export const JOURNAL_PAGE_SIZE = 20;

export interface JournalPage {
  /** Newest first. */
  entries: JournalEntry[];
  /** Pass as `before` for the next older page; null when this is the oldest. */
  nextBefore: string | null;
  /** Logged sessions in all. */
  totalSessions: number;
}

/** A session's notes as one block of text, each note as written. */
function joinNotes(notes: readonly string[]): string | null {
  return notes.length === 0 ? null : notes.join("\n\n");
}

interface LoadedJournal {
  inputs: JournalSessionInput[];
  /** The same sessions' sets, ready for the export, oldest session first. */
  csvRows: TrainingCsvRow[];
}

async function loadJournal(userId: string): Promise<LoadedJournal> {
  const [sessions, rows, exercises, prescriptionOrder] = await Promise.all([
    listJournalSessionsForUser(userId),
    listCompletedPerformancesForUser(userId),
    listExercises(),
    listPrescriptionOrderForUser(userId),
  ]);
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));

  // Rows arrive newest session first, so the first row seen for an exercise
  // fixes the unit it is shown in.
  const unitByExercise = new Map<string, WeightUnit>();
  for (const row of rows) {
    if (!unitByExercise.has(row.exerciseId)) {
      unitByExercise.set(row.exerciseId, unitOf(row.loadScheme));
    }
  }

  const bySession = new Map<string, Map<string, ExercisePerformanceRecord[]>>();
  for (const row of rows) {
    let byExercise = bySession.get(row.sessionId);
    if (byExercise === undefined) {
      byExercise = new Map();
      bySession.set(row.sessionId, byExercise);
    }
    const list = byExercise.get(row.exerciseId);
    if (list === undefined) byExercise.set(row.exerciseId, [row]);
    else list.push(row);
  }

  const inputs: JournalSessionInput[] = [];
  const csvRows: TrainingCsvRow[] = [];
  for (const session of sessions) {
    const byExercise = bySession.get(session.id);
    if (byExercise === undefined) continue;
    const note = joinNotes(session.notes);
    const completedAt = session.completedAt.toISOString();

    // The plan's order for the day, then when each lift was first logged.
    const planPlace = (list: ExercisePerformanceRecord[]) =>
      Math.min(...list.map((r) => prescriptionOrder.get(r.exercisePrescriptionId) ?? Infinity));
    const firstLogged = (list: ExercisePerformanceRecord[]) =>
      Math.min(...list.map((r) => r.completedAt.getTime()));
    const ordered = [...byExercise.entries()]
      .map(([exerciseId, list]) => ({
        exerciseId,
        list: [...list].sort(
          (a, b) => a.setIndex - b.setIndex || a.completedAt.getTime() - b.completedAt.getTime(),
        ),
      }))
      .sort((a, b) => {
        const byPlan = planPlace(a.list) - planPlace(b.list);
        return byPlan !== 0 && Number.isFinite(byPlan) ? byPlan : firstLogged(a.list) - firstLogged(b.list);
      });

    const journalExercises: JournalExerciseInput[] = [];
    for (const { exerciseId, list } of ordered) {
      const unit = unitByExercise.get(exerciseId) ?? "kg";
      const name = nameById.get(exerciseId) ?? "Exercise";
      journalExercises.push({
        exerciseId,
        exerciseName: name,
        unit,
        sets: list.map((r) => toSet(r, unit)),
      });
      for (const r of list) {
        csvRows.push({
          sessionCompletedAt: completedAt,
          dayName: session.dayName,
          exerciseName: name,
          setIndex: r.setIndex,
          reps: r.actualReps,
          weight: r.actualLoad,
          unit: unitOf(r.loadScheme),
          rpe: r.actualRpe,
          setCompletedAt: r.completedAt.toISOString(),
          note,
        });
      }
    }
    inputs.push({
      sessionId: session.id,
      dayName: session.dayName,
      startedAt: session.startedAt === null ? null : session.startedAt.toISOString(),
      completedAt,
      note,
      exercises: journalExercises,
    });
  }
  return { inputs, csvRows };
}

/**
 * One page of the journal, newest first. `before` is the `completedAt` of the
 * oldest entry already shown (the previous page's `nextBefore`).
 */
export async function getJournalPage(
  userId: string,
  options: { before?: string; limit?: number } = {},
): Promise<JournalPage> {
  const limit = options.limit ?? JOURNAL_PAGE_SIZE;
  // Entries are built oldest first (a PR needs the sessions before it), then
  // the newest page is cut from the end.
  const { inputs } = await loadJournal(userId);
  const entries = buildJournalEntries(inputs).reverse();
  const older =
    options.before === undefined
      ? entries
      : entries.filter((e) => e.completedAt < options.before!);
  const page = older.slice(0, limit);
  return {
    entries: page,
    nextBefore: older.length > limit ? page[page.length - 1]!.completedAt : null,
    totalSessions: entries.length,
  };
}

/** Every logged set as CSV, oldest session first. */
export async function exportTrainingCsv(userId: string): Promise<string> {
  const { csvRows } = await loadJournal(userId);
  return buildTrainingCsv(csvRows);
}
