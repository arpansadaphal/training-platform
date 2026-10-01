// apps/web/app/app/programs/[id]/build/ExercisePicker.tsx
//
// Inline picker: a <select> of all exercises, grouped by movement pattern,
// plus an Add button. Modeled inline rather than as a modal to keep Phase 4's
// interaction model simple — a modal picker with search and filters is a
// Phase 4+ refinement.
//
// The full exercise list is short enough (~40 rows from Phase 1's seed) that
// a <select> is a legitimate control here.

"use client";

import { useMemo, useState } from "react";
import type { ExerciseRecord, MovementPattern } from "@training/db";
import styles from "./build.module.css";

interface Props {
  exercises: ExerciseRecord[];
  onSelect: (exerciseId: string) => void;
}

const PATTERN_LABEL: Record<MovementPattern, string> = {
  SQUAT: "Squat",
  HINGE: "Hinge",
  HORIZONTAL_PUSH: "Horizontal push",
  VERTICAL_PUSH: "Vertical push",
  HORIZONTAL_PULL: "Horizontal pull",
  VERTICAL_PULL: "Vertical pull",
  CARRY: "Carry",
  ISOLATION: "Isolation",
  OTHER: "Other",
};

export function ExercisePicker({ exercises, onSelect }: Props) {
  const [selected, setSelected] = useState<string>("");

  const grouped = useMemo(() => {
    const byPattern = new Map<MovementPattern, ExerciseRecord[]>();
    for (const e of exercises) {
      const list = byPattern.get(e.movementPattern) ?? [];
      list.push(e);
      byPattern.set(e.movementPattern, list);
    }
    return Array.from(byPattern.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [exercises]);

  function handleAdd() {
    if (!selected) return;
    onSelect(selected);
    setSelected("");
  }

  return (
    <div className={styles.picker}>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        aria-label="Choose an exercise"
      >
        <option value="">Choose an exercise…</option>
        {grouped.map(([pattern, list]) => (
          <optgroup key={pattern} label={PATTERN_LABEL[pattern]}>
            {list.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.equipment ? ` — ${e.equipment}` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button type="button" onClick={handleAdd} disabled={!selected}>
        Add exercise
      </button>
    </div>
  );
}