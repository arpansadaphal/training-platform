// packages/domain/src/progress/trainingCsv.ts
//
// Project 4: "Download my data". One row per logged set, with the session it
// belongs to and the lifter's note for it. Plain CSV (RFC 4180: CRLF line
// ends, quotes doubled), so any spreadsheet opens it. Export is free and
// ungated.
//
// A text cell that starts with = + - @ (or a tab or carriage return) would be
// run as a formula by Excel and Sheets, and a note is whatever the lifter typed.
// Such cells get a leading apostrophe. Numbers are written as numbers.

import type { WeightUnit } from "./e1rm";

export interface TrainingCsvRow {
  /** ISO. The session's finish time. */
  sessionCompletedAt: string;
  dayName: string;
  exerciseName: string;
  /** 0-based, as stored. Written 1-based. */
  setIndex: number;
  reps: number | null;
  /** As logged, in `unit`; null when none was recorded. */
  weight: number | null;
  unit: WeightUnit;
  rpe: number | null;
  /** ISO. When the set was logged. */
  setCompletedAt: string;
  /** The session's note, or null. Repeated on every row of the session. */
  note: string | null;
}

export const TRAINING_CSV_HEADER = [
  "session_date",
  "day",
  "exercise",
  "set_number",
  "reps",
  "weight",
  "unit",
  "rpe",
  "completed_at",
  "session_note",
] as const;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvText(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function csvNumber(value: number | null): string {
  return value === null ? "" : String(value);
}

/** Calendar date of an ISO timestamp, in UTC (the server does not know the lifter's zone). */
export function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

export function buildTrainingCsv(rows: readonly TrainingCsvRow[]): string {
  const lines: string[] = [TRAINING_CSV_HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        isoDate(r.sessionCompletedAt),
        csvText(r.dayName),
        csvText(r.exerciseName),
        String(r.setIndex + 1),
        csvNumber(r.reps),
        csvNumber(r.weight),
        r.unit,
        csvNumber(r.rpe),
        r.setCompletedAt,
        r.note === null ? "" : csvText(r.note),
      ].join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
