// apps/web/app/app/programs/[id]/build/StructureEditor.tsx
//
// Local, in-memory editor for a ProgramStructure. Every change is passed back
// via onChange; the parent holds the authoritative local state. This
// component never calls the API directly.
//
// Reorder uses simple up/down buttons — a drag-and-drop library is out of
// scope for Phase 4. Same for prescriptions within a day.

"use client";

import type {
  ExercisePrescriptionStructure,
  LoadScheme,
  ProgramStructure,
  WorkoutDayStructure,
} from "@training/domain";
import type { ExerciseRecord } from "@training/db";
import { ExercisePicker } from "./ExercisePicker";
import styles from "./build.module.css";

interface Props {
  structure: ProgramStructure;
  exercises: ExerciseRecord[];
  onChange: (next: ProgramStructure) => void;
}

function nextId(prefix: string): string {
  // Client-local ids — used only for React keys and array identity within a
  // single edit session. At commit time the ids survive into the snapshot
  // as-is, but nothing downstream treats them as stable across versions.
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyPrescription(
  exerciseId: string,
  orderIndex: number,
): ExercisePrescriptionStructure {
  return {
    id: nextId("rx"),
    orderIndex,
    exerciseId,
    targetSets: 3,
    targetRepsLow: 8,
    targetRepsHigh: 12,
    loadScheme: { type: "BODYWEIGHT" },
  };
}

export function StructureEditor({ structure, exercises, onChange }: Props) {
  function updateDays(workoutDays: WorkoutDayStructure[]) {
    onChange({
      ...structure,
      workoutDays: workoutDays.map((d, i) => ({ ...d, orderIndex: i })),
    });
  }

  function updateDay(
    dayId: string,
    updater: (day: WorkoutDayStructure) => WorkoutDayStructure,
  ) {
    updateDays(
      structure.workoutDays.map((d) => (d.id === dayId ? updater(d) : d)),
    );
  }

  function addDay() {
    const day: WorkoutDayStructure = {
      id: nextId("day"),
      orderIndex: structure.workoutDays.length,
      name: `Day ${structure.workoutDays.length + 1}`,
      prescriptions: [],
    };
    updateDays([...structure.workoutDays, day]);
  }

  function removeDay(dayId: string) {
    updateDays(structure.workoutDays.filter((d) => d.id !== dayId));
  }

  function moveDay(dayId: string, delta: -1 | 1) {
    const idx = structure.workoutDays.findIndex((d) => d.id === dayId);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= structure.workoutDays.length) return;
    const days = [...structure.workoutDays];
    const [item] = days.splice(idx, 1);
    if (item === undefined) return;
    days.splice(target, 0, item);
    updateDays(days);
  }

  function addPrescription(dayId: string, exerciseId: string) {
    updateDay(dayId, (day) => ({
      ...day,
      prescriptions: [
        ...day.prescriptions,
        emptyPrescription(exerciseId, day.prescriptions.length),
      ],
    }));
  }

  function removePrescription(dayId: string, prescriptionId: string) {
    updateDay(dayId, (day) => ({
      ...day,
      prescriptions: day.prescriptions.filter((p) => p.id !== prescriptionId),
    }));
  }

  function updatePrescription(
    dayId: string,
    prescriptionId: string,
    changes: Partial<ExercisePrescriptionStructure>,
  ) {
    updateDay(dayId, (day) => ({
      ...day,
      prescriptions: day.prescriptions.map((p) =>
        p.id === prescriptionId ? { ...p, ...changes, id: p.id } : p,
      ),
    }));
  }

  function movePrescription(
    dayId: string,
    prescriptionId: string,
    delta: -1 | 1,
  ) {
    updateDay(dayId, (day) => {
      const idx = day.prescriptions.findIndex((p) => p.id === prescriptionId);
      if (idx < 0) return day;
      const target = idx + delta;
      if (target < 0 || target >= day.prescriptions.length) return day;
      const list = [...day.prescriptions];
      const [item] = list.splice(idx, 1);
      if (item === undefined) return day;
      list.splice(target, 0, item);
      return {
        ...day,
        prescriptions: list.map((p, i) => ({ ...p, orderIndex: i })),
      };
    });
  }

  return (
    <div className={styles.structureEditor}>
      {structure.workoutDays.length === 0 ? (
        <p className={styles.muted}>
          No workout days yet. Add one to start.
        </p>
      ) : null}

      {structure.workoutDays.map((day, dayIdx) => (
        <div key={day.id} className={styles.dayCard}>
          <div className={styles.dayHeader}>
            <input
              value={day.name}
              onChange={(e) =>
                updateDay(day.id, (d) => ({ ...d, name: e.target.value }))
              }
              maxLength={120}
              className={styles.dayNameInput}
              aria-label="Workout day name"
            />
            <div className={styles.dayControls}>
              <button
                type="button"
                onClick={() => moveDay(day.id, -1)}
                disabled={dayIdx === 0}
                className={styles.iconButton}
                aria-label="Move day up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveDay(day.id, 1)}
                disabled={dayIdx === structure.workoutDays.length - 1}
                className={styles.iconButton}
                aria-label="Move day down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeDay(day.id)}
                className={styles.iconButton}
                aria-label="Remove day"
              >
                ×
              </button>
            </div>
          </div>

          <ul className={styles.prescriptionList}>
            {day.prescriptions.map((p, pIdx) => (
              <li key={p.id} className={styles.prescriptionRow}>
                <div className={styles.prescriptionMain}>
                  <span className={styles.prescriptionExercise}>
                    {exercises.find((e) => e.id === p.exerciseId)?.name ??
                      p.exerciseId}
                  </span>
                  <label className={styles.inlineField}>
                    Sets
                    <input
                      type="number"
                      min={1}
                      value={p.targetSets}
                      onChange={(e) =>
                        updatePrescription(day.id, p.id, {
                          targetSets: Number(e.target.value) || 1,
                        })
                      }
                    />
                  </label>
                  <label className={styles.inlineField}>
                    Reps low
                    <input
                      type="number"
                      min={1}
                      value={p.targetRepsLow}
                      onChange={(e) =>
                        updatePrescription(day.id, p.id, {
                          targetRepsLow: Number(e.target.value) || 1,
                        })
                      }
                    />
                  </label>
                  <label className={styles.inlineField}>
                    Reps high
                    <input
                      type="number"
                      min={1}
                      value={p.targetRepsHigh}
                      onChange={(e) =>
                        updatePrescription(day.id, p.id, {
                          targetRepsHigh: Number(e.target.value) || 1,
                        })
                      }
                    />
                  </label>
                  <label className={styles.inlineField}>
                    Load
                    <LoadSchemeInput
                      value={p.loadScheme}
                      onChange={(scheme) =>
                        updatePrescription(day.id, p.id, {
                          loadScheme: scheme,
                        })
                      }
                    />
                  </label>
                  <div className={styles.prescriptionControls}>
                    <button
                      type="button"
                      onClick={() => movePrescription(day.id, p.id, -1)}
                      disabled={pIdx === 0}
                      className={styles.iconButton}
                      aria-label="Move exercise up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => movePrescription(day.id, p.id, 1)}
                      disabled={pIdx === day.prescriptions.length - 1}
                      className={styles.iconButton}
                      aria-label="Move exercise down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removePrescription(day.id, p.id)}
                      className={styles.iconButton}
                      aria-label="Remove exercise"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <ExercisePicker
            exercises={exercises}
            onSelect={(exerciseId) => addPrescription(day.id, exerciseId)}
          />
        </div>
      ))}

      <button type="button" onClick={addDay} className={styles.addDayButton}>
        + Add workout day
      </button>
    </div>
  );
}

/**
 * Inline load-scheme editor. Only BODYWEIGHT and FIXED_WEIGHT are exposed
 * here — the schema supports all four variants, but a Builder-complete UI
 * for PERCENT_1RM / RPE_BASED is deferred; those inputs need context (a
 * current 1RM or RPE scale) that Phase 4 does not carry. Structurally the
 * full union is supported end-to-end (the schema and the domain both accept
 * all four), so a load scheme set by a future phase or by direct API call
 * round-trips cleanly.
 */
function LoadSchemeInput({
  value,
  onChange,
}: {
  value: LoadScheme;
  onChange: (v: LoadScheme) => void;
}) {
  if (value.type === "BODYWEIGHT") {
    return (
      <select
        value="BODYWEIGHT"
        onChange={(e) => {
          const t = e.target.value;
          if (t === "BODYWEIGHT") onChange({ type: "BODYWEIGHT" });
          else if (t === "FIXED_WEIGHT")
            onChange({ type: "FIXED_WEIGHT", weight: 20, unit: "kg" });
        }}
      >
        <option value="BODYWEIGHT">Bodyweight</option>
        <option value="FIXED_WEIGHT">Fixed weight</option>
      </select>
    );
  }
  if (value.type === "FIXED_WEIGHT") {
    return (
      <span className={styles.fixedWeight}>
        <input
          type="number"
          min={0}
          value={value.weight}
          onChange={(e) =>
            onChange({
              type: "FIXED_WEIGHT",
              weight: Number(e.target.value) || 0,
              unit: value.unit,
            })
          }
          style={{ width: "4.5rem" }}
        />
        <select
          value={value.unit}
          onChange={(e) =>
            onChange({
              type: "FIXED_WEIGHT",
              weight: value.weight,
              unit: e.target.value === "lb" ? "lb" : "kg",
            })
          }
        >
          <option value="kg">kg</option>
          <option value="lb">lb</option>
        </select>
      </span>
    );
  }
  // PERCENT_1RM / RPE_BASED — round-trip them as-is; editing deferred.
  return <span className={styles.muted}>{value.type}</span>;
}