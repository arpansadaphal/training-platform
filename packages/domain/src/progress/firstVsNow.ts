// packages/domain/src/progress/firstVsNow.ts
//
// Project 4: "how far have I come?" for one lift, in one line under its
// charts: the first top set the lifter logged and the latest, with the
// dates. Facts only: no verdict, no cause.
//
// Structured first, so the dates can be formatted in the lifter's own time
// zone in the browser; `firstVsNowLine` then turns it into text with the
// caller's formatter.

import type { WeightUnit } from "./e1rm";
import type { ExerciseSessionRecord } from "./history";

export interface FirstVsNowPoint {
  weight: number;
  reps: number;
  /** ISO. */
  date: string;
}

export type FirstVsNow =
  | { kind: "NONE" }
  | { kind: "BASELINE"; first: FirstVsNowPoint }
  | {
      kind: "COMPARE";
      first: FirstVsNowPoint;
      now: FirstVsNowPoint;
      sessions: number;
      /** now.weight - first.weight; null with fewer than DELTA_MIN_SESSIONS sessions. */
      deltaWeight: number | null;
    };

/** Two or three sessions show first and now; the change in weight needs a few more. */
export const DELTA_MIN_SESSIONS = 4;

function point(r: ExerciseSessionRecord): FirstVsNowPoint {
  return { weight: r.topSet.weight, reps: r.topSet.reps, date: r.date };
}

/** `records` are one lift's loaded sessions, oldest first (as the Progress view builds them). */
export function firstVsNow(records: readonly ExerciseSessionRecord[]): FirstVsNow {
  const first = records[0];
  if (first === undefined) return { kind: "NONE" };
  const last = records[records.length - 1]!;
  if (records.length === 1) return { kind: "BASELINE", first: point(first) };
  return {
    kind: "COMPARE",
    first: point(first),
    now: point(last),
    sessions: records.length,
    deltaWeight:
      records.length >= DELTA_MIN_SESSIONS
        ? Math.round((last.topSet.weight - first.topSet.weight) * 100) / 100
        : null,
  };
}

function load(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/**
 * "Your first: 40 kg × 10 (25 Oct). Now: 55 kg × 10 (24 Dec). Up 15 kg."
 * `formatDate` turns an ISO timestamp into the short date shown in brackets.
 */
export function firstVsNowLine(
  result: FirstVsNow,
  unit: WeightUnit,
  formatDate: (iso: string) => string,
): string | null {
  if (result.kind === "NONE") return null;
  if (result.kind === "BASELINE") return "Your first session on this lift. Baseline set.";
  const show = (p: FirstVsNowPoint) => `${load(p.weight)} ${unit} × ${p.reps} (${formatDate(p.date)})`;
  let line = `Your first: ${show(result.first)}. Now: ${show(result.now)}.`;
  if (result.deltaWeight !== null && result.deltaWeight !== 0) {
    line += result.deltaWeight > 0
      ? ` Up ${load(result.deltaWeight)} ${unit}.`
      : ` Down ${load(Math.abs(result.deltaWeight))} ${unit}.`;
  }
  return line;
}
