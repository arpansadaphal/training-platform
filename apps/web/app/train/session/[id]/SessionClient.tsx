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
//   - No pre-fill of reps/load from the plan. Pre-filling would nudge users
//     toward affirming the target without thinking, which pollutes the data
//     Review exists to surface. The plan is shown as reference; reps and
//     weight start empty (the weight list opens on the plan's weight but
//     chooses nothing). Phase A3c, by the founder's decision: the effort
//     picker starts on the option nearest the plan's target RPE, and says
//     so in its label; "Don't record" clears it.
//   - Skip session is a first-class button, not hidden in a menu.
//   - Phase A3c: before "Start session" only the day, date and exercise names
//     show. Weight and effort are chosen from sheets (components/session),
//     not typed; the stored numbers are unchanged.
//   - Phase A: the planned weight is part of the plan line and the Weight
//     placeholder, and every weight carries its unit ("kg per dumbbell" for
//     dumbbell exercises). Logged weights are read in the plan's unit: lb if
//     the plan says lb, kg otherwise. Only the number is stored.
//
// Phase A2 additions:
//   - A session clock ("Session time: MM:SS") and per-set "since last" gaps
//     while IN_PROGRESS, read from startedAt / completedAt. Client-side only.
//   - "Last: 60 kg × 10 (Mar 15)" under each exercise: display-only, so the
//     no-prefill rule above still holds.
//   - Logged sets can be edited or deleted while IN_PROGRESS (ARCH-055).
//   - "Mark complete" names any exercise with no logged sets and asks first.
//   - A COMPLETED session shows its logged sets with times, read-only.
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

import { useEffect, useState, type FocusEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ExerciseRecord } from "@training/db";
import { TRPCProvider, trpc } from "@/src/lib/trpc";
import { loadUnitLabel } from "@/src/lib/loadLabels";
import { convertLoad, nearestRpeOption } from "@training/domain";
import { RpePicker, WeightPicker } from "@/components/session/LoggingPickers";
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
  /** ARCH-061 */
  isRestDay?: boolean;
  orderIndex: number;
  prescriptions: ClientPrescription[];
}

interface ClientSessionContext {
  /** COMPLETED sessions in the block up to and including this one. */
  completedInBlockThrough: number;
  session: {
    id: string;
    trainingBlockId: string;
    workoutDayId: string;
    sequenceIndex: number;
    status: SessionStatus;
    /** Date from the RSC path; ISO string over tRPC. */
    startedAt: Date | string | null;
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
  /** Date from the RSC path; ISO string over tRPC. */
  completedAt: Date | string;
};

/** Display-only "last time" hint (sessionService.getLastTimeHints). */
export interface ClientLastTimeHint {
  exerciseId: string;
  load: number | null;
  reps: number | null;
  unit: "kg" | "lb";
  sessionCompletedAt: Date | string;
}

type ClientObservation = {
  id: string;
  content: string;
};

interface Props {
  context: ClientSessionContext;
  exercises: ExerciseRecord[];
  initialRecords: ClientPerformanceRecord[];
  initialObservations: ClientObservation[];
  lastTimeHints: ClientLastTimeHint[];
  /** ARCH-057: sessions the start that led here auto-saved (COMPLETED), for the banner. */
  autoSaved: { sessionId: string; dayName: string; completedAtIso: string }[];
}

/** Display text for a session status ("In progress", not "IN_PROGRESS"). */
const STATUS_LABEL: Record<SessionStatus, string> = {
  PLANNED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  SKIPPED: "Skipped",
};

/** "3 hours ago", "1 hour ago", "under an hour ago". */
/**
 * On a phone the keyboard can cover the log buttons under the input just
 * focused. After it has opened, bring the card's log buttons back into view.
 */
function revealLogButtons(e: FocusEvent<HTMLElement>): void {
  const target = e.currentTarget.closest("li")?.querySelector("[data-log-actions]");
  if (!target) return;
  window.setTimeout(() => target.scrollIntoView({ block: "nearest", behavior: "smooth" }), 300);
}

function hoursAgo(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "under an hour ago";
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
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

/** The plan's weight, if the load scheme names one. Tolerant of the Json column's unknown shape. */
function plannedWeight(p: ClientPrescription): { weight: number; unit: string } | null {
  const scheme = p.loadScheme as { type?: string; weight?: unknown; unit?: unknown } | null;
  if (scheme?.type !== "FIXED_WEIGHT" || typeof scheme.weight !== "number") return null;
  return { weight: scheme.weight, unit: scheme.unit === "lb" ? "lb" : "kg" };
}

/** The unit logged weights are read in for this prescription: the plan's, else kg. */
function logUnit(p: ClientPrescription): string {
  return plannedWeight(p)?.unit ?? "kg";
}

/**
 * A human-readable description of a prescription's plan, shown above the log
 * inputs as a reference. Intentionally tolerant of a Decimal-serialized
 * targetRpe (string) from the wire — the RSC path gives a number, the tRPC
 * path would give a string; both are handled.
 */
function describePlan(p: ClientPrescription, equipment: string | null): string {
  const reps =
    p.targetRepsLow === p.targetRepsHigh
      ? `${p.targetRepsHigh}`
      : `${p.targetRepsLow}-${p.targetRepsHigh}`;
  const rpe = p.targetRpe !== null && p.targetRpe !== undefined ? Number(p.targetRpe) : null;
  const rpePart = rpe !== null ? ` @ RPE ${rpe} (${Math.max(0, 10 - rpe)} RIR)` : "";
  const scheme = p.loadScheme as { type?: string; percent?: unknown } | null;
  const planned = plannedWeight(p);
  const weightPart = planned
    ? ` · ${planned.weight} ${loadUnitLabel(planned.unit, equipment)}`
    : scheme?.type === "BODYWEIGHT"
      ? // Before Phase A2 every exercise defaulted to bodyweight; on loaded
        // equipment that default was never the lifter's choice, so show it
        // as unspecified rather than as a claim.
        equipment && equipment !== "bodyweight"
        ? " · —"
        : " · bodyweight"
      : scheme?.type === "PERCENT_1RM" && typeof scheme.percent === "number"
        ? ` · ${scheme.percent > 1 ? scheme.percent : Math.round(scheme.percent * 100)}% 1RM`
        : "";
  return `${p.targetSets} × ${reps}${rpePart}${weightPart}`;
}

/**
 * The weight "Same as last" repeats: the previous set of this exercise in
 * this session, else last session's load (in this exercise's logging unit).
 */
function lastWeightFor(
  p: ClientPrescription,
  logged: ClientPerformanceRecord[],
  hint: ClientLastTimeHint | undefined,
): number | null {
  const inSession = [...logged].reverse().find((r) => r.actualLoad !== null);
  if (inSession) return inSession.actualLoad;
  if (!hint || hint.load === null) return null;
  const unit = logUnit(p);
  if (hint.unit === unit) return hint.load;
  const converted = convertLoad(hint.load, hint.unit, unit === "lb" ? "lb" : "kg");
  const step = unit === "lb" ? 5 : 2.5;
  return Math.round(converted / step) * step;
}

const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d));

/** "04:07", or "1:04:07" past an hour. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "2m 05s". */
export function formatGap(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** "Last: 60 kg × 10 (Mar 15)". */
export function formatHint(h: ClientLastTimeHint, unitLabel: string): string {
  const loadText = h.load === 0 ? "bodyweight" : h.load === null ? "" : `${h.load} ${unitLabel}`;
  const what =
    h.load !== null && h.reps !== null
      ? `${loadText} × ${h.reps}`
      : h.load !== null
        ? loadText
        : h.reps !== null
          ? `${h.reps} reps`
          : "logged";
  const when = toDate(h.sessionCompletedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `Last: ${what} (${when})`;
}

/** Ticking "Session time" for an IN_PROGRESS session. */
function SessionTimer({ startedAt }: { startedAt: Date }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    // Locale/clock text differs between the server render and the browser;
    // the client value wins (suppressHydrationWarning covers this text only).
    <p className={styles.sessionTimer} aria-live="off" suppressHydrationWarning>
      Session time: {formatClock((now - startedAt.getTime()) / 1000)}
    </p>
  );
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
  lastTimeHints,
  autoSaved,
}: Props) {
  const router = useRouter();
  const hintByExercise = new Map(lastTimeHints.map((h) => [h.exerciseId, h]));

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
      const target = p.targetRpe === null || p.targetRpe === undefined ? null : Number(p.targetRpe);
      init[p.id] = {
        reps: "",
        load: "",
        rpe: target === null || !Number.isFinite(target) ? "" : String(nearestRpeOption(target).rpe),
      };
    }
    return init;
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [observationText, setObservationText] = useState("");
  // ARCH-055: the set being edited inline, and its draft values.
  const [editing, setEditing] = useState<{ id: string } & InputValues | null>(null);
  // "Mark complete" with unlogged exercises asks first; this holds their names.
  const [unloggedPrompt, setUnloggedPrompt] = useState<string[] | null>(null);
  const [autoSavedDismissed, setAutoSavedDismissed] = useState(false);

  const exerciseNameById = new Map(exercises.map((e) => [e.id, e.name]));
  const equipmentById = new Map(exercises.map((e) => [e.id, e.equipment]));

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

  const updateSetMutation = trpc.performance.updateSet.useMutation({
    onSuccess: (updated) => {
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setEditing(null);
      setStatusMessage("Set updated.");
      setErrorMessage(null);
    },
    onError: (err) => {
      setErrorMessage(err.message);
      setStatusMessage(null);
    },
  });

  const deleteSetMutation = trpc.performance.deleteSet.useMutation({
    onSuccess: ({ id }) => {
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setStatusMessage("Set deleted.");
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
      // Phase A3a: completing a session lands on its summary, the reward
      // moment, rather than refreshing this page in place.
      router.push(`/train/session/${context.session.id}/summary`);
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

  function handleMarkComplete() {
    const unlogged = context.workoutDay.prescriptions
      .filter((p) => recordsFor(p.id).length === 0)
      .map((p) => exerciseNameById.get(p.exerciseId) ?? p.exerciseId);
    if (unlogged.length > 0) {
      setUnloggedPrompt(unlogged);
      return;
    }
    markCompletedMutation.mutate({ sessionId: context.session.id });
  }

  function handleSaveEdit() {
    if (!editing) return;
    updateSetMutation.mutate({
      sessionId: context.session.id,
      recordId: editing.id,
      changes: {
        actualReps: parseNullableNumber(editing.reps),
        actualLoad: parseNullableNumber(editing.load),
        actualRpe: parseNullableNumber(editing.rpe),
      },
    });
  }

  function handleDeleteSet(recordId: string) {
    if (!window.confirm("Delete this set?")) return;
    deleteSetMutation.mutate({ sessionId: context.session.id, recordId });
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
  const inProgress = session.status === "IN_PROGRESS";
  const startedAt = session.startedAt ? toDate(session.startedAt) : null;
  // ARCH-061: a rest day shows its own screen; it is moved past, not logged.
  const restDay = workoutDay.isRestDay === true && (session.status === "PLANNED" || session.status === "IN_PROGRESS");
  const planned = session.status === "PLANNED" && !restDay;
  const todayText = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // "Since last" gaps: each set against the previous set logged in this
  // session (any exercise), the first against startedAt.
  const ordered = [...records].sort(
    (a, b) => toDate(a.completedAt).getTime() - toDate(b.completedAt).getTime(),
  );
  const gapSecondsById = new Map<string, number>();
  ordered.forEach((r, i) => {
    const prev = i === 0 ? startedAt : toDate(ordered[i - 1]!.completedAt);
    if (prev) gapSecondsById.set(r.id, (toDate(r.completedAt).getTime() - prev.getTime()) / 1000);
  });

  return (
    <>
      <h1 className={styles.heading}>
        {program.name} — {workoutDay.name}
      </h1>
      <p className={styles.muted}>
        Session {session.sequenceIndex + 1} ({context.completedInBlockThrough} completed) ·{" "}
        {STATUS_LABEL[session.status]}
      </p>
      {autoSaved.length > 0 && !autoSavedDismissed ? (
        <div className={styles.autoSavedBanner} role="status">
          {autoSaved.map((a) => (
            <p key={a.sessionId} suppressHydrationWarning>
              Your previous {a.dayName} session was auto-saved {hoursAgo(a.completedAtIso)}.{" "}
              <Link href={`/train/session/${a.sessionId}`}>View log</Link>
            </p>
          ))}
          <button
            type="button"
            className={styles.smallSecondaryButton}
            onClick={() => setAutoSavedDismissed(true)}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {inProgress && startedAt ? <SessionTimer startedAt={startedAt} /> : null}

      {errorMessage ? (
        <p className={styles.errorBanner}>{errorMessage}</p>
      ) : null}
      {statusMessage ? (
        <p className={styles.successBanner}>{statusMessage}</p>
      ) : null}

      {session.status === "COMPLETED" ? (
        <>
          <p className={styles.statusBanner}>
            This session is complete. Logs below are final.
          </p>
          <Link href={`/train/session/${session.id}/summary`} className={styles.viewSummary}>
            View summary
          </Link>
          <details className={styles.frozenNote}>
            <summary>Sets from completed sessions can&apos;t be edited. Why?</summary>
            The record of what you did is frozen once the session is complete, so
            future progress reflects what actually happened.
          </details>
          <CompletedLog
            prescriptions={workoutDay.prescriptions}
            records={records}
            exerciseNameById={exerciseNameById}
            unitLabelFor={(p) =>
              loadUnitLabel(logUnit(p), equipmentById.get(p.exerciseId) ?? null)
            }
          />
        </>
      ) : null}
      {session.status === "SKIPPED" ? (
        workoutDay.isRestDay === true ? (
          <p className={styles.statusBanner}>
            Rest day done. <Link href="/train">Back to training</Link>
          </p>
        ) : (
          <p className={styles.statusBanner}>This session was skipped.</p>
        )
      ) : null}

      {restDay ? (
        <section className={styles.preStart} aria-label="Rest day">
          <p className={styles.preStartDate} suppressHydrationWarning>
            {todayText}
          </p>
          <p className={styles.restDayText}>Rest day — no training scheduled.</p>
          <button
            type="button"
            className={`${styles.primaryButton} ${styles.preStartCta}`}
            onClick={() => markSkippedMutation.mutate({ sessionId: session.id })}
            disabled={markSkippedMutation.isPending}
          >
            {markSkippedMutation.isPending ? "Moving on…" : "Continue to next day"}
          </button>
          <p className={styles.muted}>
            A rest day is not counted as a missed session.
          </p>
        </section>
      ) : null}

      {planned ? (
        <section className={styles.preStart} aria-label="Before you start">
          <p className={styles.preStartDate} suppressHydrationWarning>
            {todayText}
          </p>
          <button
            type="button"
            className={`${styles.primaryButton} ${styles.preStartCta}`}
            onClick={() => markStartedMutation.mutate({ sessionId: session.id })}
            disabled={markStartedMutation.isPending}
          >
            {markStartedMutation.isPending ? "Starting…" : "Start session"}
          </button>
          {workoutDay.prescriptions.length === 0 ? (
            <p className={styles.emptyState}>
              This workout day has no exercises. Add some in the Builder, or
              skip the session.
            </p>
          ) : (
            <ul className={styles.preStartList} aria-label="Exercises">
              {workoutDay.prescriptions.map((p) => (
                <li key={p.id}>{exerciseNameById.get(p.exerciseId) ?? p.exerciseId}</li>
              ))}
            </ul>
          )}
          <div className={styles.sessionActions}>
            <button
              type="button"
              className={styles.skipButton}
              onClick={() => markSkippedMutation.mutate({ sessionId: session.id })}
              disabled={markSkippedMutation.isPending}
            >
              Skip session
            </button>
          </div>
        </section>
      ) : null}

      {inProgress && !restDay ? (
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
                const equipment = equipmentById.get(p.exerciseId) ?? null;
                const unitLabel = loadUnitLabel(logUnit(p), equipment);
                const plan = plannedWeight(p);
                const hint = hintByExercise.get(p.exerciseId);
                return (
                  <li key={p.id} className={styles.exerciseCard}>
                    <div className={styles.exerciseHeader}>
                      <span className={styles.exerciseName}>{name}</span>
                      <span className={styles.exercisePlan}>
                        {describePlan(p, equipment)} · {logged.length}/{p.targetSets} logged
                      </span>
                    </div>
                    {hint ? (
                      <p className={styles.lastTimeHint} suppressHydrationWarning>
                        {formatHint(hint, loadUnitLabel(hint.unit, equipment))}
                      </p>
                    ) : null}

                    {logged.length > 0 ? (
                      <ul className={styles.setList}>
                        {logged.map((r, i) =>
                          editing?.id === r.id ? (
                            <li key={r.id} className={styles.setItem}>
                              <span className={styles.setEditRow}>
                                <span className={styles.setEditTitle}>Set {i + 1}</span>
                                <span className={styles.setEditFields}>
                                  <span className={styles.setEditField}>
                                    <span className={styles.setEditCaption}>Reps</span>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      aria-label="Edit reps"
                                      className={styles.setEditInput}
                                      value={editing.reps}
                                      onChange={(e) => setEditing({ ...editing, reps: e.target.value })}
                                    />
                                  </span>
                                  <span className={styles.setEditField}>
                                    <span className={styles.setEditCaption}>Weight ({unitLabel})</span>
                                    <WeightPicker
                                      label={`Edit weight (${unitLabel})`}
                                      unit={logUnit(p) === "lb" ? "lb" : "kg"}
                                      unitText={logUnit(p)}
                                      value={editing.load}
                                      onChange={(v) => setEditing({ ...editing, load: v })}
                                      plannedWeight={plan ? plan.weight : null}
                                      lastWeight={null}
                                    />
                                  </span>
                                  <span className={`${styles.setEditField} ${styles.setEditFieldWide}`}>
                                    <span className={styles.setEditCaption}>Effort (RPE)</span>
                                    <RpePicker
                                      label="Edit effort (RPE)"
                                      value={editing.rpe}
                                      onChange={(v) => setEditing({ ...editing, rpe: v })}
                                    />
                                  </span>
                                </span>
                                <span className={styles.setEditButtons}>
                                  <button
                                    type="button"
                                    className={styles.smallButton}
                                    onClick={handleSaveEdit}
                                    disabled={updateSetMutation.isPending}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.smallSecondaryButton}
                                    onClick={() => setEditing(null)}
                                  >
                                    Cancel
                                  </button>
                                </span>
                              </span>
                            </li>
                          ) : (
                            <li key={r.id} className={styles.setItem}>
                              Set {i + 1}:{" "}
                              {r.actualReps !== null
                                ? `${r.actualReps} reps`
                                : "reps not recorded"}
                              {r.actualLoad !== null
                                ? r.actualLoad === 0
                                  ? " @ bodyweight"
                                  : ` @ ${r.actualLoad} ${unitLabel}`
                                : ""}
                              {r.actualRpe !== null
                                ? ` @ RPE ${r.actualRpe}`
                                : ""}
                              {inProgress && gapSecondsById.has(r.id) ? (
                                <span className={styles.setGap}>
                                  {" "}
                                  ({formatGap(gapSecondsById.get(r.id)!)} since last)
                                </span>
                              ) : null}
                              {inProgress ? (
                                <span className={styles.setControls}>
                                  <button
                                    type="button"
                                    className={styles.iconButton}
                                    aria-label={`Edit set ${i + 1}`}
                                    onClick={() =>
                                      setEditing({
                                        id: r.id,
                                        reps: r.actualReps === null ? "" : String(r.actualReps),
                                        load: r.actualLoad === null ? "" : String(r.actualLoad),
                                        rpe: r.actualRpe === null ? "" : String(r.actualRpe),
                                      })
                                    }
                                  >
                                    ✎
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.iconButton}
                                    aria-label={`Delete set ${i + 1}`}
                                    onClick={() => handleDeleteSet(r.id)}
                                    disabled={deleteSetMutation.isPending}
                                  >
                                    ×
                                  </button>
                                </span>
                              ) : null}
                            </li>
                          ),
                        )}
                      </ul>
                    ) : null}

                    {remaining > 0 ? (
                      <>
                        <div className={styles.inputRow} onFocusCapture={revealLogButtons}>
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
                          <div className={styles.inputField}>
                            <span className={styles.inputLabel}>Weight ({unitLabel})</span>
                            <WeightPicker
                              label={`Weight (${unitLabel})`}
                              unit={logUnit(p) === "lb" ? "lb" : "kg"}
                              unitText={logUnit(p)}
                              value={vals.load}
                              onChange={(v) => setInputValue(p.id, "load", v)}
                              plannedWeight={plan ? plan.weight : null}
                              lastWeight={lastWeightFor(p, logged, hint)}
                              testId={`weight-${p.id}`}
                            />
                          </div>
                          <div className={`${styles.inputField} ${styles.inputFieldWide}`}>
                            <span className={styles.inputLabel}>Effort (RPE)</span>
                            <RpePicker
                              label="Effort (RPE)"
                              value={vals.rpe}
                              onChange={(v) => setInputValue(p.id, "rpe", v)}
                              testId={`rpe-${p.id}`}
                            />
                          </div>
                        </div>
                        <div className={styles.actionRow}>
                          <button
                            type="button"
                            data-log-actions
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

          {unloggedPrompt ? (
            <div className={styles.confirmPanel} role="alertdialog" aria-labelledby="unlogged-prompt">
              <p id="unlogged-prompt">
                {unloggedPrompt.join(", ")} had no logged sets. Complete anyway?
              </p>
              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => {
                    setUnloggedPrompt(null);
                    markCompletedMutation.mutate({ sessionId: session.id });
                  }}
                  disabled={markCompletedMutation.isPending}
                >
                  Complete anyway
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setUnloggedPrompt(null)}
                >
                  Keep session open
                </button>
              </div>
            </div>
          ) : null}

          <div className={styles.sessionActions}>
            {session.status === "IN_PROGRESS" ? (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleMarkComplete}
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

      {planned || restDay ? null : (
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
      )}
    </>
  );
}

/** G: a completed session's sets, read-only, with the time each was logged. */
function CompletedLog({
  prescriptions,
  records,
  exerciseNameById,
  unitLabelFor,
}: {
  prescriptions: ClientPrescription[];
  records: ClientPerformanceRecord[];
  exerciseNameById: Map<string, string>;
  unitLabelFor: (p: ClientPrescription) => string;
}) {
  const hhmm = (d: Date | string) =>
    toDate(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <ul className={styles.exerciseList} aria-label="Logged sets">
      {prescriptions.map((p) => {
        const sets = records
          .filter((r) => r.exercisePrescriptionId === p.id)
          .sort((a, b) => toDate(a.completedAt).getTime() - toDate(b.completedAt).getTime());
        const unit = unitLabelFor(p);
        return (
          <li key={p.id} className={styles.exerciseCard}>
            <div className={styles.exerciseHeader}>
              <span className={styles.exerciseName}>
                {exerciseNameById.get(p.exerciseId) ?? p.exerciseId}
              </span>
              <span className={styles.exercisePlan}>
                {sets.length}/{p.targetSets} sets
              </span>
            </div>
            {sets.length === 0 ? (
              <p className={styles.muted}>No sets logged.</p>
            ) : (
              <ul className={styles.setList}>
                {sets.map((r, i) => (
                  <li key={r.id} className={styles.setItem}>
                    Set {i + 1}: {r.actualReps !== null ? `${r.actualReps} reps` : "reps not recorded"}
                    {r.actualLoad !== null ? (r.actualLoad === 0 ? " @ bodyweight" : ` @ ${r.actualLoad} ${unit}`) : ""}
                    {r.actualRpe !== null ? ` @ RPE ${r.actualRpe}` : ""}
                    <span className={styles.setGap} suppressHydrationWarning>
                      {" "}· {hhmm(r.completedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
