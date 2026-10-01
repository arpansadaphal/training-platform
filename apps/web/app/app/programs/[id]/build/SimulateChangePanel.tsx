// apps/web/app/app/programs/[id]/build/SimulateChangePanel.tsx
//
// The Phase 5 manual simulate/apply UI. Deliberately minimal: a dropdown to
// pick one MutationSpec op, the fields that op needs, a Simulate button, and
// — for the two persistable branches (COMPUTED, CANNOT_COMPUTE) — an Apply
// button that calls programVersion.commitFromSimulation.
//
// What this panel is for: proving the full simulate → persist → apply stack
// works end-to-end before Phase 8 adds an AI Coach in front of it. It is not
// a general editor; the general editor is the StructureEditor next door. The
// panel exists so the invariant-2 path has a manual trigger that isn't the
// manual Commit button, letting the two paths be exercised side by side.
//
// Scope notes:
//   - It operates against the Program's ACTIVE version, never against a
//     draft (Q3: the Phase 1 schema's Simulation.baseVersionId is a non-null
//     FK to ProgramVersion; drafts are not a legal base).
//   - It supports 5 of the 7 MutationSpec ops. REPLACE_STRUCTURE and
//     REORDER_EXERCISE_PRESCRIPTIONS are excluded — the first is trivially
//     equivalent to the manual commit path, the second is a rare adjustment
//     better served by a real editor.
//   - On Apply success it calls router.refresh() so the RSC page re-loads
//     with the new active version — the panel's props update in place.

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ExercisePrescriptionStructure,
  MutationSpec,
  ProgramStructure,
  SimulationResult,
  WorkoutDayStructure,
} from "@training/domain";
import type { ExerciseRecord } from "@training/db";
import { trpc } from "@/src/lib/trpc";
import { GainCostNetDisplay } from "@/components/simulation/GainCostNetDisplay";
import styles from "@/components/simulation/simulation.module.css";

type PanelOp =
  | "MODIFY_EXERCISE_PRESCRIPTION"
  | "ADD_EXERCISE_PRESCRIPTION"
  | "REMOVE_EXERCISE_PRESCRIPTION"
  | "ADD_WORKOUT_DAY"
  | "REMOVE_WORKOUT_DAY";

const OP_LABELS: Record<PanelOp, string> = {
  MODIFY_EXERCISE_PRESCRIPTION: "Change target sets on an exercise",
  ADD_EXERCISE_PRESCRIPTION: "Add an exercise to a workout day",
  REMOVE_EXERCISE_PRESCRIPTION: "Remove an exercise",
  ADD_WORKOUT_DAY: "Add a workout day",
  REMOVE_WORKOUT_DAY: "Remove a workout day",
};

interface Props {
  programId: string;
  activeVersionId: string | null;
  activeVersionStructure: ProgramStructure | null;
  exercises: ExerciseRecord[];
}

export function SimulateChangePanel({
  programId,
  activeVersionId,
  activeVersionStructure,
  exercises,
}: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [op, setOp] = useState<PanelOp>("MODIFY_EXERCISE_PRESCRIPTION");
  const [workoutDayId, setWorkoutDayId] = useState<string>("");
  const [prescriptionId, setPrescriptionId] = useState<string>("");
  const [targetSets, setTargetSets] = useState<number>(4);
  const [addExerciseId, setAddExerciseId] = useState<string>("");
  const [newDayName, setNewDayName] = useState<string>("");

  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [simulateError, setSimulateError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  const exerciseNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const ex of exercises) m.set(ex.id, ex.name);
    return m;
  }, [exercises]);

  const days: readonly WorkoutDayStructure[] =
    activeVersionStructure?.workoutDays ?? [];

  const selectedDay = useMemo(
    () => days.find((d) => d.id === workoutDayId) ?? null,
    [days, workoutDayId],
  );

  // ── Mutations ────────────────────────────────────────────────────────────

  const simulateMutation = trpc.simulation.simulate.useMutation({
    onSuccess: ({ simulationId: sid, result: res }) => {
      setSimulationId(sid);
      setResult(res);
      setSimulateError(null);
      setApplyMessage(null);
    },
    onError: (err) => {
      setSimulateError(err.message);
      setSimulationId(null);
      setResult(null);
    },
  });

  const applyMutation = trpc.programVersion.commitFromSimulation.useMutation({
    onSuccess: (version) => {
      setApplyMessage(`Applied as version ${version.versionNumber}.`);
      setSimulationId(null);
      setResult(null);
      // Refresh the RSC payload so this panel (and the Versions list on the
      // program page) see the new active version.
      void utils.programVersion.listForProgram.invalidate({ programId });
      router.refresh();
    },
    onError: (err) => {
      // The errorFormatter projects StaleSimulationError /
      // SimulationAlreadyAppliedError onto error.data.cause. Inspect
      // structured data rather than parse the message.
      const cause = (
        err.data as
          | {
              cause?: {
                code?: string;
                currentVersionId?: string | null;
                appliedAsVersionId?: string;
              };
            }
          | undefined
      )?.cause;
      if (cause?.code === "STALE_SIMULATION") {
        setSimulateError(
          "The program moved on since this simulation was run. Re-run Simulate and try again.",
        );
      } else if (cause?.code === "SIMULATION_ALREADY_APPLIED") {
        setSimulateError(
          "This simulation has already been applied. Refresh to see the new version.",
        );
      } else {
        setSimulateError(err.message);
      }
      // Either way, drop the current simulation — it is no longer actionable.
      setSimulationId(null);
      setResult(null);
    },
  });

  // ── MutationSpec builder ─────────────────────────────────────────────────

  function buildMutation(): MutationSpec | { error: string } {
    switch (op) {
      case "MODIFY_EXERCISE_PRESCRIPTION": {
        if (!prescriptionId) {
          return { error: "Choose an exercise to modify." };
        }
        return {
          op: "MODIFY_EXERCISE_PRESCRIPTION",
          prescriptionId,
          changes: { targetSets },
        };
      }
      case "ADD_EXERCISE_PRESCRIPTION": {
        if (!workoutDayId) return { error: "Choose a workout day." };
        if (!addExerciseId) return { error: "Choose an exercise to add." };
        const prescription: ExercisePrescriptionStructure = {
          // The id is generated client-side. applyMutation only requires
          // uniqueness within the resulting structure; a random id is fine.
          id: `rx-sim-${crypto.randomUUID()}`,
          orderIndex: selectedDay?.prescriptions.length ?? 0,
          exerciseId: addExerciseId,
          targetSets,
          targetRepsLow: 5,
          targetRepsHigh: 8,
          loadScheme: { type: "BODYWEIGHT" },
        };
        return {
          op: "ADD_EXERCISE_PRESCRIPTION",
          workoutDayId,
          prescription,
        };
      }
      case "REMOVE_EXERCISE_PRESCRIPTION": {
        if (!prescriptionId) {
          return { error: "Choose an exercise to remove." };
        }
        return {
          op: "REMOVE_EXERCISE_PRESCRIPTION",
          prescriptionId,
        };
      }
      case "ADD_WORKOUT_DAY": {
        const name = newDayName.trim();
        if (!name) return { error: "Give the new workout day a name." };
        return {
          op: "ADD_WORKOUT_DAY",
          day: {
            id: `day-sim-${crypto.randomUUID()}`,
            orderIndex: days.length,
            name,
            prescriptions: [],
          },
        };
      }
      case "REMOVE_WORKOUT_DAY": {
        if (!workoutDayId) return { error: "Choose a workout day." };
        return { op: "REMOVE_WORKOUT_DAY", workoutDayId };
      }
    }
  }

  function handleOpChange(next: PanelOp) {
    setOp(next);
    setResult(null);
    setSimulationId(null);
    setSimulateError(null);
    setApplyMessage(null);
  }

  function handleSimulate() {
    setApplyMessage(null);
    setSimulateError(null);
    const built = buildMutation();
    if ("error" in built) {
      setSimulateError(built.error);
      return;
    }
    simulateMutation.mutate({ programId, mutation: built });
  }

  function handleApply() {
    if (!simulationId) return;
    setSimulateError(null);
    applyMutation.mutate({ simulationId });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (activeVersionId === null || activeVersionStructure === null) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.panelHeading}>Try a specific change</h2>
        <p className={styles.panelHint}>
          Commit a version first. Simulation always runs against the current
          active version.
        </p>
      </section>
    );
  }

  const canApply =
    simulationId !== null &&
    result !== null &&
    (result.kind === "COMPUTED" || result.kind === "CANNOT_COMPUTE");

  return (
    <section className={styles.panel}>
      <h2 className={styles.panelHeading}>Try a specific change</h2>
      <p className={styles.panelHint}>
        Propose one atomic change to the active version, see what the
        assessment engine says about it, then apply it — a new immutable
        version is created through the same code path as a manual commit.
      </p>

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Operation</span>
          <select
            className={styles.select}
            value={op}
            onChange={(e) => handleOpChange(e.target.value as PanelOp)}
          >
            {(Object.keys(OP_LABELS) as PanelOp[]).map((k) => (
              <option key={k} value={k}>
                {OP_LABELS[k]}
              </option>
            ))}
          </select>
        </label>

        {(op === "MODIFY_EXERCISE_PRESCRIPTION" ||
          op === "ADD_EXERCISE_PRESCRIPTION" ||
          op === "REMOVE_EXERCISE_PRESCRIPTION") && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Workout day</span>
            <select
              className={styles.select}
              value={workoutDayId}
              onChange={(e) => {
                setWorkoutDayId(e.target.value);
                setPrescriptionId("");
              }}
            >
              <option value="">Choose a workout day…</option>
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {(op === "MODIFY_EXERCISE_PRESCRIPTION" ||
          op === "REMOVE_EXERCISE_PRESCRIPTION") && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Prescription</span>
            <select
              className={styles.select}
              value={prescriptionId}
              onChange={(e) => setPrescriptionId(e.target.value)}
              disabled={!selectedDay}
            >
              <option value="">Choose an exercise…</option>
              {(selectedDay?.prescriptions ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {exerciseNameById.get(p.exerciseId) ?? p.exerciseId}
                </option>
              ))}
            </select>
          </label>
        )}

        {op === "ADD_EXERCISE_PRESCRIPTION" && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>New exercise</span>
            <select
              className={styles.select}
              value={addExerciseId}
              onChange={(e) => setAddExerciseId(e.target.value)}
            >
              <option value="">Choose an exercise…</option>
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {(op === "MODIFY_EXERCISE_PRESCRIPTION" ||
          op === "ADD_EXERCISE_PRESCRIPTION") && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Target sets</span>
            <input
              type="number"
              min={1}
              className={styles.input}
              value={targetSets}
              onChange={(e) => setTargetSets(Number(e.target.value))}
            />
          </label>
        )}

        {op === "ADD_WORKOUT_DAY" && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>New day name</span>
            <input
              type="text"
              maxLength={120}
              className={styles.input}
              value={newDayName}
              onChange={(e) => setNewDayName(e.target.value)}
            />
          </label>
        )}

        {op === "REMOVE_WORKOUT_DAY" && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Workout day</span>
            <select
              className={styles.select}
              value={workoutDayId}
              onChange={(e) => setWorkoutDayId(e.target.value)}
            >
              <option value="">Choose a workout day…</option>
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {simulateError ? (
        <p className={styles.errorBanner}>{simulateError}</p>
      ) : null}
      {applyMessage ? (
        <p className={styles.successBanner}>{applyMessage}</p>
      ) : null}

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={handleSimulate}
          disabled={simulateMutation.isPending}
        >
          {simulateMutation.isPending ? "Simulating…" : "Simulate"}
        </button>
        {canApply ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleApply}
            disabled={applyMutation.isPending}
          >
            {applyMutation.isPending ? "Applying…" : "Apply this change"}
          </button>
        ) : null}
      </div>

      {result ? <GainCostNetDisplay result={result} /> : null}
    </section>
  );
}