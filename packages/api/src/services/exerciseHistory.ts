// packages/api/src/services/exerciseHistory.ts
//
// Maps logged-set rows from the database into the domain's history shapes.
// Shared by the Progress view, the post-workout summary and the next-session
// targets, so they all read a load in the same unit the same way.
//
// Logged loads carry no unit. The unit is read from the prescription's
// LoadScheme (lb only for FIXED_WEIGHT in lb, otherwise kg), the same rule as
// the "Last time" hint.

import type { ExercisePerformanceRecord } from "@training/db";
import {
  convertLoad,
  type LoggedSet,
  type SessionSets,
  type WeightUnit,
} from "@training/domain";

export function unitOf(loadScheme: unknown): WeightUnit {
  const scheme = loadScheme as { type?: string; unit?: string } | null;
  return scheme?.type === "FIXED_WEIGHT" && scheme.unit === "lb" ? "lb" : "kg";
}

export function toSet(row: ExercisePerformanceRecord, unit: WeightUnit): LoggedSet {
  return {
    reps: row.actualReps,
    load:
      row.actualLoad === null
        ? null
        : convertLoad(row.actualLoad, unitOf(row.loadScheme), unit),
    rpe: row.actualRpe,
  };
}

/**
 * Groups rows by Session into the domain's SessionSets, loads expressed in
 * `unit`. Sessions come out in the order their first row appears (newest
 * first when the rows are), and sets in row order.
 */
export function groupBySession(
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
