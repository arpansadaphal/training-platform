// apps/web/app/train/DayPicker.tsx
//
// Phase A2 (ARCH-056): the /train day picker. Defaults to the rotation's
// suggested day; choosing another day says up front which days will be
// recorded as skipped, then posts to startDayAction.

"use client";

import { useState } from "react";
import { startDayAction } from "./actions";
import styles from "./train.module.css";

export interface DayPickerProps {
  programId: string;
  days: { id: string; name: string; isRestDay?: boolean }[];
  suggestedDayId: string;
  /** ARCH-056 addendum: the day the rotation trains next. */
  pointerDayId: string;
  pending: {
    status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
    workoutDayId: string;
    hasRecords: boolean;
  } | null;
}

export type PickOutcome =
  | { kind: "SAME" }
  | { kind: "SKIP"; skipped: string[] }
  | { kind: "EXTRA"; rotationDay: string };

/**
 * What picking a day will do, mirroring sessionService.startDay (ARCH-056
 * addendum): days ahead of the rotation pointer skip the days in between;
 * days behind it are extra sessions that leave the rotation alone.
 */
export function pickOutcome(
  days: { id: string; name: string; isRestDay?: boolean }[],
  pointerDayId: string,
  pending: DayPickerProps["pending"],
  pickedDayId: string,
): PickOutcome {
  if (pending && pending.workoutDayId === pickedDayId) return { kind: "SAME" };
  const index = (id: string) => days.findIndex((d) => d.id === id);
  let pointer = index(pointerDayId);
  const picked = index(pickedDayId);
  // A pending session on the pointer's day that has sets will close as
  // COMPLETED, which moves the pointer past it before the pick applies.
  if (pending && index(pending.workoutDayId) === pointer && pending.hasRecords) {
    pointer = (pointer + 1) % days.length;
  }
  if (picked === pointer) return { kind: "SAME" };
  if (picked > pointer) {
    // ARCH-061: passing over a rest day is not skipping training; leave it out of the warning.
    return {
      kind: "SKIP",
      skipped: days
        .slice(pointer, picked)
        .filter((d) => d.isRestDay !== true)
        .map((d) => d.name),
    };
  }
  return { kind: "EXTRA", rotationDay: days[pointer]?.name ?? "" };
}

/** "Push", or "Rest (rest day)" for a rest day whose name does not already say so. */
function dayLabel(d: { name: string; isRestDay?: boolean }): string {
  return d.isRestDay === true && !/rest/i.test(d.name) ? `${d.name} (rest day)` : d.name;
}

export function DayPicker({ programId, days, suggestedDayId, pointerDayId, pending }: DayPickerProps) {
  const [picked, setPicked] = useState(suggestedDayId);
  const pickedName = days.find((d) => d.id === picked)?.name ?? "session";
  const outcome = pickOutcome(days, pointerDayId, pending, picked);
  const resuming = picked === suggestedDayId && pending?.status === "IN_PROGRESS";

  return (
    <form action={startDayAction} className={styles.dayPicker}>
      <input type="hidden" name="programId" value={programId} />
      <label className={styles.dayPickerLabel}>
        Training today
        <select
          name="workoutDayId"
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
        >
          {days.map((d) => (
            <option key={d.id} value={d.id}>
              {dayLabel(d)}
              {d.id === suggestedDayId ? " (next in rotation)" : ""}
            </option>
          ))}
        </select>
      </label>
      {outcome.kind === "SKIP" && outcome.skipped.length > 0 ? (
        <p className={styles.muted}>
          {outcome.skipped.join(", ")} will be marked as skipped, and the rotation
          continues from {pickedName}.
        </p>
      ) : outcome.kind === "EXTRA" ? (
        <p className={styles.muted}>
          {pickedName} will be an extra session. Your rotation stays at{" "}
          {outcome.rotationDay}.
        </p>
      ) : null}
      <button type="submit" className={styles.primaryButton}>
        {resuming
          ? "Continue training"
          : days.find((d) => d.id === picked)?.isRestDay === true
            ? "Open rest day"
            : "Start training"}
      </button>
    </form>
  );
}
