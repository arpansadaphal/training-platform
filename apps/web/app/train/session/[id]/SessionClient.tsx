// apps/web/app/train/session/[id]/SessionClient.tsx
//
// The interactive logging UI.
//
// UX bar is "table-stakes, not differentiation" per the Phase 6 file: match
// Strong / Hevy / Boostcamp logging speed, don't try to beat it. Concrete
// choices reflecting that:
//
//   - Large tap targets (min-height 44px, full-width number inputs) so a
//     thumb can hit them mid-workout.
//   - Per-prescription input row, with both "Log one set" and
//     "Log N remaining" (the batch path). Successive identical sets are
//     two taps: set values once, then tap Log repeatedly.
//   - No pre-fill of reps/load/RPE from the plan. Pre-filling would nudge
//     users toward affirming the target without thinking, which pollutes
//     the data Review exists to surface. The plan is shown as reference;
//     the inputs start empty.
//   - Skip session is a first-class button, not hidden in a menu.
//
// HONESTY REQUIREMENT: this component does not reconcile, clamp, or reject a
// deviation from the plan. Whatever is typed is what is logged. The service
// layer also does not reconcile (see performanceService's header). That is
// deliberate: PerformanceRecord = what happened; ExercisePrescription = what
// was planned; the gap is Review's input.
//
// Client-side types: the RSC passes `SessionContext` (with Date fields) and
// `ExerciseRecord[]` (with Date fields); the tRPC mutations return shapes
// whose Date fields are strings on the wire (no superjson transformer). Both
// are assignable to the narrower Client* types below because we read none of
// the Date fields — see the ClientDraft precedent in BuilderClient.tsx.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExerciseRecord } from "@training/db";
import { TRPCProvider, trpc } from "@/src/lib/trpc";
import styles from "../../train.module.css";

type SessionStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";

interface ClientPrescription {
  id: string;
  orderIndex: number;
  exerciseId: string;
  targetSets: number;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe: number | null;
  loadScheme: unknown;
}

interface ClientWorkoutDay {
  id: string;
  name: string;
  orderIndex: number;
  prescriptions: ClientPrescription[];
}

interface ClientSessionContext {
  session: {
    id: string;
    trainingBlockId: string;
    workoutDayId: string;
    sequenceIndex: number;
    status: SessionStatus;
  };
  program: { id: string; name: string };
  workoutDay: ClientWorkoutDay;
}

type ClientPerformanceRecord = {
  id: string;
  sessionId: string;
  exercisePrescriptionId: string;
  setIndex: number;
  actualReps: number | null;
  actualLoad: number | null;
  actualRpe: number | null;
};

type ClientObservation = {
  id: string;
  content: string;
};

interface Props {
  context: ClientSessionContext;
  exercises: ExerciseRecord[];
  initialRecords: ClientPerformanceRecord[];
  initialObservations: ClientObservation[];
}

type InputValues = { reps: string; load: string; rpe: string };

/**
 * Parses a user-typed numeric string into a number | null. Empty or
 * non-numeric input becomes null — never NaN, never 0. A null here means
 * "the user did not record this field," which is stored as SQL NULL, not as
 * a fabricated value.
 */
function parseNullableNumber(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * A human-readable description of a prescription's plan, shown above the log
 * inputs as a reference. Intentionally tolerant of a Decimal-serialized
 * targetRpe (string) from the wire — the RSC path gives a number, the tRPC
 * path would give a string; both are handled.
 */
function describePlan(p: ClientPrescription): string {
  const reps =
    p.targetRepsLow === p.targetRepsHigh
      ? `${p.targetRepsHigh}`
      : `${p.targetRepsLow}-${p.targetRepsHigh}`;
  const rpePart =
    p.targetRpe !== null && p.targetRpe !== undefined
      ? ` @ RPE ${p.targetRpe}`
      : "";
  return `${p.targetSets} × ${reps}${rpePart}`;
}

export function SessionClient(props: Props) {
  return (
    <TRPCProvider>
      <SessionClientInner {...props} />
    </TRPCProvider>
  );
}

function SessionClientInner({
  context,
  exercises,
  initialRecords,
  initialObservations,
}: Props) {
  const router = useRouter();

  const [records, setRecords] = useState<ClientPerformanceRecord[]>(
    initialRecords,
  );
  const [observations, setObservations] =
    useState<ClientObservation[]>(initialObservations);
  const [inputs, setInputs] = useState<Record<string, InputValues>>(() => {
    // Inputs start empty, per the no-prefill rule above. One row per
    // prescription; the key is prescription id.
    const init: Record<string, InputValues> = {};
    for (const p of context.workoutDay.prescriptions) {
      init[p.id] = { reps: "", load: "", rpe: "" };
    }
    return init;
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [observationText, setObservationText] = useState("");

  const exerciseNameById = new Map(exercises.map((e) => [e.id, e.name]));

  function recordsFor(prescriptionId: string): ClientPerformanceRecord[] {
    return records.filter((r) => r.exercisePrescriptionId === prescriptionId);
  }

  function setInputValue(
    prescriptionId: string,
    field: keyof InputValues,
    value: string,
  ) {
    setInputs((prev) => ({
      ...prev,
      [prescriptionId]: { ...prev[prescriptionId], [field]: value } as InputValues,
    }));
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  const logSetMutation = trpc.performance.logSet.useMutation({
    onSuccess: (created) => {
      setRecords((prev) => [...prev, created]);
      setStatusMessage("Set logged.");
      setErrorMessage(null);
      // Inputs are NOT cleared — logging successive identical sets should be
      // a single tap each. The user edits values only when the next set
      // differs (which is exactly the deviation case Review cares about).
    },
    onError: (err) => {
      setErrorMessage(err.message);
      setStatusMessage(null);
    },
  });

  const logBatchMutation = trpc.performance.logBatch.useMutation({
    onSuccess: (created) => {
      setRecords((prev) => [...prev, ...created]);
      setStatusMessage(`${created.length} sets logged.`);
      setErrorMessage(null);
    },
    onError: (err) => {
      setErrorMessage(err.message);
      setStatusMessage(null);
    },
  });

  const markStartedMutation = trpc.session.markStarted.useMutation({
    onSuccess: () => {
      setStatusMessage("Session started.");
      setErrorMessage(null);
      // Refresh the RSC payload so the header (which reads session.status
      // from props) reflects the new state.
      router.refresh();
    },
    onError: (err) => {
      setErrorMessage(err.message);
      setStatusMessage(null);
    },
  });

  const markCompletedMutation = trpc.session.markCompleted.useMutation({
    onSuccess: () => {
      setStatusMessage("Session completed.");
      setErrorMessage(null);
      router.refresh();
    },
    onError: (err) => {
      setErrorMessage(err.message);
      setStatusMessage(null);
    },
  });

  const markSkippedMutation = trpc.session.markSkipped.useMutation({
    onSuccess: () => {
      setStatusMessage("Session skipped.");
      setErrorMessage(null);
      router.refresh();
    },
    onError: (err) => {
      setErrorMessage(err.message);
      setStatusMessage(null);
    },
  });

  const createObservationMutation = trpc.observation.create.useMutation({
    onSuccess: (created) => {
      setObservations((prev) => [...prev, created]);
      setObservationText("");
      setStatusMessage("Note saved.");
      setErrorMessage(null);
    },
    onError: (err) => {
      setErrorMessage(err.message);
      setStatusMessage(null);
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleLogOne(p: ClientPrescription) {
    const vals = inputs[p.id];
    if (!vals) return;
    const nextIndex = recordsFor(p.id).length;
    logSetMutation.mutate({
      sessionId: context.session.id,
      entry: {
        exercisePrescriptionId: p.id,
        setIndex: nextIndex,
        actualReps: parseNullableNumber(vals.reps),
        actualLoad: parseNullableNumber(vals.load),
        actualRpe: parseNullableNumber(vals.rpe),
      },
    });
  }

  function handleLogRemaining(p: ClientPrescription) {
    const vals = inputs[p.id];
    if (!vals) return;
    const already = recordsFor(p.id).length;
    const remaining = Math.max(0, p.targetSets - already);
    if (remaining === 0) return;
    const entries = Array.from({ length: remaining }, (_, i) => ({
      exercisePrescriptionId: p.id,
      setIndex: already + i,
      actualReps: parseNullableNumber(vals.reps),
      actualLoad: parseNullableNumber(vals.load),
      actualRpe: parseNullableNumber(vals.rpe),
    }));
    logBatchMutation.mutate({ sessionId: context.session.id, entries });
  }

  function handleSaveObservation() {
    const content = observationText.trim();
    if (!content) return;
    createObservationMutation.mutate({
      sessionId: context.session.id,
      content,
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const { session, program, workoutDay } = context;
  const isLogging = session.status === "PLANNED" || session.status === "IN_PROGRESS";

  return (
    <>
      <h1 className={styles.heading}>
        {program.name} — {workoutDay.name}
      </h1>
      <p className={styles.muted}>
        Session {session.sequenceIndex + 1} · {session.status}
      </p>

      {errorMessage ? (
        <p className={styles.errorBanner}>{errorMessage}</p>
      ) : null}
      {statusMessage ? (
        <p className={styles.successBanner}>{statusMessage}</p>
      ) : null}

      {session.status === "COMPLETED" ? (
        <p className={styles.statusBanner}>
          This session is complete. Logs below are final.
        </p>
      ) : null}
      {session.status === "SKIPPED" ? (
        <p className={styles.statusBanner}>This session was skipped.</p>
      ) : null}

      {session.status === "PLANNED" ? (
        <div className={styles.sessionActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() =>
              markStartedMutation.mutate({ sessionId: session.id })
            }
            disabled={markStartedMutation.isPending}
          >
            {markStartedMutation.isPending ? "Starting…" : "Start session"}
          </button>
        </div>
      ) : null}

      {isLogging ? (
        <>
          {workoutDay.prescriptions.length === 0 ? (
            <p className={styles.emptyState}>
              This workout day has no exercises. Add some in the Builder, or
              skip the session.
            </p>
          ) : (
            <ul className={styles.exerciseList}>
              {workoutDay.prescriptions.map((p) => {
                const logged = recordsFor(p.id);
                const remaining = Math.max(0, p.targetSets - logged.length);
                const name = exerciseNameById.get(p.exerciseId) ?? p.exerciseId;
                const vals = inputs[p.id] ?? { reps: "", load: "", rpe: "" };
                return (
                  <li key={p.id} className={styles.exerciseCard}>
                    <div className={styles.exerciseHeader}>
                      <span className={styles.exerciseName}>{name}</span>
                      <span className={styles.exercisePlan}>
                        {describePlan(p)} · {logged.length}/{p.targetSets} logged
                      </span>
                    </div>

                    {logged.length > 0 ? (
                      <ul className={styles.setList}>
                        {logged.map((r) => (
                          <li key={r.id} className={styles.setItem}>
                            Set {r.setIndex + 1}:{" "}
                            {r.actualReps !== null
                              ? `${r.actualReps} reps`
                              : "reps not recorded"}
                            {r.actualLoad !== null
                              ? ` @ ${r.actualLoad}`
                              : ""}
                            {r.actualRpe !== null
                              ? ` @ RPE ${r.actualRpe}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {remaining > 0 ? (
                      <>
                        <div className={styles.inputRow}>
                          <label className={styles.inputField}>
                            <span className={styles.inputLabel}>Reps</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              className={styles.numberInput}
                              value={vals.reps}
                              onChange={(e) =>
                                setInputValue(p.id, "reps", e.target.value)
                              }
                              placeholder={String(p.targetRepsHigh)}
                            />
                          </label>
                          <label className={styles.inputField}>
                            <span className={styles.inputLabel}>Load</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              className={styles.numberInput}
                              value={vals.load}
                              onChange={(e) =>
                                setInputValue(p.id, "load", e.target.value)
                              }
                            />
                          </label>
                          <label className={styles.inputField}>
                            <span className={styles.inputLabel}>RPE</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              className={styles.numberInput}
                              value={vals.rpe}
                              onChange={(e) =>
                                setInputValue(p.id, "rpe", e.target.value)
                              }
                              placeholder={
                                p.targetRpe !== null
                                  ? String(p.targetRpe)
                                  : undefined
                              }
                            />
                          </label>
                        </div>
                        <div className={styles.actionRow}>
                          <button
                            type="button"
                            className={styles.primaryButton}
                            onClick={() => handleLogOne(p)}
                            disabled={logSetMutation.isPending}
                          >
                            Log one set
                          </button>
                          {remaining > 1 ? (
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => handleLogRemaining(p)}
                              disabled={logBatchMutation.isPending}
                            >
                              Log {remaining} remaining sets
                            </button>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <p className={styles.muted}>
                        All {p.targetSets} sets logged.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className={styles.sessionActions}>
            {session.status === "IN_PROGRESS" ? (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() =>
                  markCompletedMutation.mutate({ sessionId: session.id })
                }
                disabled={markCompletedMutation.isPending}
              >
                {markCompletedMutation.isPending
                  ? "Completing…"
                  : "Mark complete"}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.skipButton}
              onClick={() =>
                markSkippedMutation.mutate({ sessionId: session.id })
              }
              disabled={markSkippedMutation.isPending}
            >
              Skip session
            </button>
          </div>
        </>
      ) : null}

      <section className={styles.observationBox}>
        <h2 className={styles.sectionHeading}>Post-session notes</h2>
        <p className={styles.muted}>
          Optional. Soreness, energy, life context — anything that isn&apos;t
          captured by the logged sets.
        </p>
        <textarea
          className={styles.observationTextarea}
          value={observationText}
          onChange={(e) => setObservationText(e.target.value)}
          maxLength={4000}
          placeholder="How did it go?"
        />
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSaveObservation}
            disabled={
              createObservationMutation.isPending ||
              observationText.trim().length === 0
            }
          >
            {createObservationMutation.isPending ? "Saving…" : "Save note"}
          </button>
        </div>

        {observations.length > 0 ? (
          <ul className={styles.observationList}>
            {observations.map((o) => (
              <li key={o.id} className={styles.observationItem}>
                {o.content}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}