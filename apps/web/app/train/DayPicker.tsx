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
  days: { id: string; name: string }[];
  suggestedDayId: string;
  pending: { status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED"; workoutDayId: string } | null;
}

/** Days passed over when jumping from `fromIndex` to `toIndex`, in rotation order (ARCH-056). */
export function daysPassedOver<T>(days: T[], fromIndex: number, toIndex: number): T[] {
  const passed: T[] = [];
  if (fromIndex === toIndex || days.length === 0) return passed;
  for (let i = fromIndex; i !== toIndex; i = (i + 1) % days.length) {
    const day = days[i];
    if (day !== undefined) passed.push(day);
  }
  return passed;
}

export function DayPicker({ programId, days, suggestedDayId, pending }: DayPickerProps) {
  const [picked, setPicked] = useState(suggestedDayId);
  const suggestedIndex = days.findIndex((d) => d.id === suggestedDayId);
  const pickedIndex = days.findIndex((d) => d.id === picked);
  const pickedName = days[pickedIndex]?.name ?? "session";
  const skipped = daysPassedOver(days, suggestedIndex, pickedIndex);
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
              {d.name}
              {d.id === suggestedDayId ? " (next in rotation)" : ""}
            </option>
          ))}
        </select>
      </label>
      {skipped.length > 0 ? (
        <p className={styles.muted}>
          {skipped.map((d) => d.name).join(", ")} will be marked as skipped, and the
          rotation continues from {pickedName}.
        </p>
      ) : null}
      <button type="submit" className={styles.primaryButton}>
        {resuming ? "Continue training" : "Start training"}
      </button>
    </form>
  );
}
