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
//     chooses nothing). Phase A3a.1, by the founder's decision: the effort
//     picker starts on the option nearest the plan's target RPE, and says
//     so in its label; "Don't record" clears it.
//   - Skip session is a first-class button, not hidden in a menu.
//   - Phase A3a.1: before "Start session" only the day, date and exercise names
//     show. Weight and effort are chosen from sheets (components/session),
//     not typed; the stored numbers are unchanged.
//   - Phase A: the planned weight is part of the plan line and the Weight
//     placeholder, and every weight carries its unit ("kg per dumbbell" for
//     dumbbell exercises). Logged weights are read in the plan's unit: lb if
//     the plan says lb, kg otherwise. Only the number is stored.
//
// Product-depth roadmap (Week 1 + Project 1, ARCH-062):
//   - Logging is optimistic: a tapped set is on screen at once, saved in the
//     background with the client's own id (a retry is the same set) and its
//     tap time, retried on a bad connection, and marked "saving" / "saved" /
//     "not saved". Mark complete waits for sets still saving.
//   - A set needs reps before it can be logged; weight may be bodyweight.
//   - Each exercise states a TARGET from the lifter's own history (ARCH-062).
//     It is shown, offered as the weight list's top row and where it opens,
//     and never filled in: the no-prefill rule still holds for reps and weight.
//   - A first-ever exercise runs "find your starting weight": after each set,
//     "How many more could you have done?", and a suggested next weight.
//   - Finished exercises fold to one line; the next one scrolls into view.
//   - Delete set and Skip session act at once and offer Undo (no confirm).
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

import { useEffect, useRef, useState, type FocusEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ExerciseRecord } from "@training/db";
import { TRPCProvider, trpc } from "@/src/lib/trpc";
import { loadUnitLabel } from "@/src/lib/loadLabels";
import {
  REPS_LEFT_ANSWERS,
  convertLoad,
  nearestRpeOption,
  repsLeftText,
  startingWeightFromSession,
  stopWithText,
  suggestWeight,
} from "@training/domain";
import { RpePicker, WeightPicker } from "@/components/session/LoggingPickers";
import { UndoToast, type ToastState } from "@/components/session/UndoToast";
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

/** Where a set stands while it is being saved in the background. Absent = saved long ago. */
type SaveState = "saving" | "saved" | "failed";
type ClientRecord = ClientPerformanceRecord & {
  _state?: SaveState;
  /** Logged by "Log N remaining": every set shares one tap time, so no rest gap is shown. */
  _batch?: boolean;
};

/** ARCH-062: what to lift, from the lifter's own earlier sets (sessionService.getSessionPage). */
export interface ClientTarget {
  prescriptionId: string;
  kind: "FIRST_TIME" | "START" | "UP" | "HOLD" | "DELOAD" | "COMEBACK" | "MORE_REPS";
  weight: number | null;
  repsLow: number;
  repsHigh: number;
  reason: string;
  unit: "kg" | "lb";
}

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
  targets: ClientTarget[];
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
 * The plan as a sentence: "3 sets × 8–12 · stop with 2–3 reps left". Effort is
 * told in reps left, the picker's own words, not as RPE and RIR together. The
 * plan's weight is not shown: with a history, the TARGET says what to lift
 * (ARCH-062), and a plan weight the lifter has moved past would contradict it.
 * Tolerant of a Decimal-serialized targetRpe (string) from the wire.
 */
function describePlan(p: ClientPrescription, equipment: string | null): string {
  const reps =
    p.targetRepsLow === p.targetRepsHigh
      ? `${p.targetRepsHigh}`
      : `${p.targetRepsLow}–${p.targetRepsHigh}`;
  const rpe = p.targetRpe !== null && p.targetRpe !== undefined ? Number(p.targetRpe) : null;
  const stop = stopWithText(rpe !== null && Number.isFinite(rpe) ? rpe : null);
  const scheme = p.loadScheme as { type?: string; percent?: unknown } | null;
  const loadPart =
    scheme?.type === "PERCENT_1RM" && typeof scheme.percent === "number"
      ? ` · ${scheme.percent > 1 ? scheme.percent : Math.round(scheme.percent * 100)}% 1RM`
      : scheme?.type === "BODYWEIGHT" && (!equipment || equipment === "bodyweight")
        ? " · bodyweight"
        : "";
  return `${p.targetSets} sets × ${reps}${stop ? ` · ${stop.replace("-", "–")}` : ""}${loadPart}`;
}

/** "50 kg" / "bodyweight". */
function weightText(weight: number, unitLabel: string): string {
  return weight === 0 ? "bodyweight" : `${weight} ${unitLabel}`;
}

/** The bold line over an exercise: "Target: 50 kg × 8–12". */
function targetHeadline(t: ClientTarget, unitLabel: string, finding: boolean): string {
  if (finding) return "First time: find your starting weight.";
  const reps = t.repsLow === t.repsHigh ? `${t.repsHigh}` : `${t.repsLow}–${t.repsHigh}`;
  if (t.weight === null) return `Target: ${reps} reps`;
  if (t.weight === 0) return `Target: ${reps} reps`;
  return `Target: ${weightText(t.weight, unitLabel)} × ${reps}`;
}

/** The short form on the pre-start list: "50 kg × 8–12", or "first time". */
function targetShort(t: ClientTarget, unitLabel: string, finding: boolean): string {
  if (finding) return "first time";
  const reps = t.repsLow === t.repsHigh ? `${t.repsHigh}` : `${t.repsLow}–${t.repsHigh}`;
  if (t.weight === null || t.weight === 0) return `${reps} reps`;
  return `${weightText(t.weight, unitLabel)} × ${reps}`;
}

/** One line for a finished exercise: "3 × 10 · 40 kg", or "10, 10, 8 reps · 40–45 kg". */
function summarizeSets(sets: readonly ClientPerformanceRecord[], unitLabel: string): string {
  const reps = sets.map((r) => r.actualReps).filter((n): n is number => n !== null);
  const loads = sets.map((r) => r.actualLoad).filter((n): n is number => n !== null);
  const uniform = reps.length === sets.length && reps.every((n) => n === reps[0]);
  const repsText = uniform && reps.length > 0 ? `${sets.length} × ${reps[0]}` : `${reps.join(", ")} reps`;
  if (loads.length === 0) return repsText;
  const lo = Math.min(...loads);
  const hi = Math.max(...loads);
  if (hi === 0) return `${repsText} · bodyweight`;
  return `${repsText} · ${lo === hi ? `${lo}` : `${lo}–${hi}`} ${unitLabel}`;
}

/** A set's id, chosen on the device so a retried save is the same set. */
function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
}

/** How long Skip session can be undone before it is sent. */
const SKIP_UNDO_MS = 6000;
const RETRY_DELAYS_MS = [1500, 4000, 9000];

/** A failure worth retrying: no answer from the server, or the server's own trouble. */
function isRetryable(err: unknown): boolean {
  const status = (err as { data?: { httpStatus?: unknown } | null } | null)?.data?.httpStatus;
  if (typeof status === "number") return status >= 500 || status === 408 || status === 429;
  return true;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isRetryable(err)) throw err;
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }
  }
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
  targets,
  autoSaved,
}: Props) {
  const router = useRouter();
  const hintByExercise = new Map(lastTimeHints.map((h) => [h.exerciseId, h]));
  const targetByRx = new Map(targets.map((t) => [t.prescriptionId, t]));

  const [records, setRecords] = useState<ClientRecord[]>(initialRecords);
  // Async code (retries, undo) needs the latest sets, not the render it began in.
  const recordsRef = useRef<ClientRecord[]>(records);
  recordsRef.current = records;
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
  const [toast, setToast] = useState<ToastState | null>(null);
  // Exercises the lifter opened again after finishing them.
  const [reopened, setReopened] = useState<ReadonlySet<string>>(new Set());
  const [completing, setCompleting] = useState(false);
  // Skip session acts at once and can be undone until this timer fires.
  const [skipPending, setSkipPending] = useState(false);
  const skipTimer = useRef<number | null>(null);
  const skipFiredRef = useRef(false);
  // A moment of "Saved" after the last background save lands.
  const [justSaved, setJustSaved] = useState(false);

  const exerciseNameById = new Map(exercises.map((e) => [e.id, e.name]));
  const equipmentById = new Map(exercises.map((e) => [e.id, e.equipment]));

  function recordsFor(prescriptionId: string): ClientRecord[] {
    return records
      .filter((r) => r.exercisePrescriptionId === prescriptionId)
      .sort(
        (a, b) =>
          toDate(a.completedAt).getTime() - toDate(b.completedAt).getTime() ||
          a.setIndex - b.setIndex,
      );
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

  function patchRecord(id: string, patch: Partial<ClientRecord>) {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  const logSetMutation = trpc.performance.logSet.useMutation();
  const logBatchMutation = trpc.performance.logBatch.useMutation();
  const deleteSetMutation = trpc.performance.deleteSet.useMutation();

  const updateSetMutation = trpc.performance.updateSet.useMutation({
    onSuccess: (updated) => {
      setRecords((prev) =>
        prev.map((r) => (r.id === updated.id ? { ...r, ...updated, _state: r._state } : r)),
      );
      setEditing(null);
      setStatusMessage("Set updated.");
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
      setCompleting(false);
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
      setSkipPending(false);
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

  // ── Saving sets in the background ────────────────────────────────────────

  // Saves still running, by set id. Mark complete waits for these.
  const inflight = useRef(new Map<string, Promise<void>>());
  // Deletes still running, so an Undo cannot overtake its own delete.
  const deleting = useRef(new Map<string, Promise<void>>());

  function noteSaved() {
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2000);
  }

  function entryOf(rec: ClientRecord) {
    return {
      id: rec.id,
      exercisePrescriptionId: rec.exercisePrescriptionId,
      setIndex: rec.setIndex,
      actualReps: rec.actualReps,
      actualLoad: rec.actualLoad,
      actualRpe: rec.actualRpe,
      completedAt: toDate(rec.completedAt).toISOString(),
    };
  }

  /** Saves one set (the record is already on screen). Safe to call again: the id makes a retry the same set. */
  function persistOne(rec: ClientRecord): Promise<void> {
    const existing = inflight.current.get(rec.id);
    if (existing) return existing;
    patchRecord(rec.id, { _state: "saving" });
    const run = (async () => {
      try {
        const saved = await withRetry(() =>
          logSetMutation.mutateAsync({ sessionId: context.session.id, entry: entryOf(rec) }),
        );
        setRecords((prev) =>
          prev.map((r) => (r.id === rec.id ? { ...r, ...saved, _state: "saved" } : r)),
        );
        window.setTimeout(() => patchRecord(rec.id, { _state: undefined }), 1500);
        setErrorMessage(null);
        noteSaved();
      } catch {
        patchRecord(rec.id, { _state: "failed" });
      } finally {
        inflight.current.delete(rec.id);
      }
    })();
    inflight.current.set(rec.id, run);
    return run;
  }

  /** Saves several sets as one batch (Log N remaining). */
  function persistBatch(recs: ClientRecord[]): void {
    const ids = recs.map((r) => r.id);
    recs.forEach((r) => patchRecord(r.id, { _state: "saving" }));
    const run = (async () => {
      try {
        const saved = await withRetry(() =>
          logBatchMutation.mutateAsync({
            sessionId: context.session.id,
            entries: recs.map(entryOf),
          }),
        );
        const byId = new Map(saved.map((s) => [s.id, s]));
        setRecords((prev) =>
          prev.map((r) => (byId.has(r.id) ? { ...r, ...byId.get(r.id)!, _state: "saved" } : r)),
        );
        window.setTimeout(() => ids.forEach((id) => patchRecord(id, { _state: undefined })), 1500);
        setErrorMessage(null);
        noteSaved();
      } catch {
        ids.forEach((id) => patchRecord(id, { _state: "failed" }));
      } finally {
        ids.forEach((id) => inflight.current.delete(id));
      }
    })();
    ids.forEach((id) => inflight.current.set(id, run));
  }

  function retryFailed() {
    for (const r of recordsRef.current) {
      if (r._state === "failed") void persistOne(r);
    }
  }

  // Back on the network: try the sets that did not save.
  useEffect(() => {
    const onOnline = () => retryFailed();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // retryFailed reads the latest sets through a ref.
  }, []);

  // Leaving with sets unsaved would lose them: ask first.
  const unsavedCount = records.filter((r) => r._state === "saving" || r._state === "failed").length;
  useEffect(() => {
    if (unsavedCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsavedCount]);

  /** Waits for every save in flight; false when something still has not saved. */
  async function flushSaves(): Promise<boolean> {
    await Promise.all([...inflight.current.values()]);
    return !recordsRef.current.some((r) => r._state === "failed");
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  /** The reps a set needs before it can be logged. */
  function repsOf(vals: InputValues): number | null {
    const reps = parseNullableNumber(vals.reps);
    return reps !== null && reps > 0 ? reps : null;
  }

  function isFindingWeight(p: ClientPrescription): boolean {
    const t = targetByRx.get(p.id);
    return (
      t !== undefined &&
      t.kind === "FIRST_TIME" &&
      t.weight === null &&
      equipmentById.get(p.exerciseId) !== "bodyweight"
    );
  }

  function newRecord(p: ClientPrescription, vals: InputValues, setIndex: number, at: Date, batch: boolean): ClientRecord {
    return {
      id: newId(),
      sessionId: context.session.id,
      exercisePrescriptionId: p.id,
      setIndex,
      actualReps: repsOf(vals),
      actualLoad: parseNullableNumber(vals.load),
      // While finding a starting weight, effort comes from the question after the set.
      actualRpe: isFindingWeight(p) ? null : parseNullableNumber(vals.rpe),
      completedAt: at,
      _state: "saving",
      ...(batch ? { _batch: true } : {}),
    };
  }

  function handleLogOne(p: ClientPrescription) {
    const vals = inputs[p.id];
    if (!vals || repsOf(vals) === null) return;
    const rec = newRecord(p, vals, recordsFor(p.id).length, new Date(), false);
    setRecords((prev) => [...prev, rec]);
    setStatusMessage(null);
    void persistOne(rec);
  }

  function handleLogRemaining(p: ClientPrescription) {
    const vals = inputs[p.id];
    if (!vals || repsOf(vals) === null) return;
    const already = recordsFor(p.id).length;
    const remaining = Math.max(0, p.targetSets - already);
    if (remaining === 0) return;
    const at = new Date();
    const recs = Array.from({ length: remaining }, (_, i) =>
      newRecord(p, vals, already + i, at, true),
    );
    setRecords((prev) => [...prev, ...recs]);
    setStatusMessage(null);
    persistBatch(recs);
  }

  async function completeNow() {
    setCompleting(true);
    setUnloggedPrompt(null);
    const allSaved = await flushSaves();
    if (!allSaved) {
      setCompleting(false);
      setErrorMessage(
        "Some sets have not saved yet. Check your connection, then try Mark complete again.",
      );
      return;
    }
    markCompletedMutation.mutate({ sessionId: context.session.id });
  }

  function handleMarkComplete() {
    const unlogged = context.workoutDay.prescriptions
      .filter((p) => recordsFor(p.id).length === 0)
      .map((p) => exerciseNameById.get(p.exerciseId) ?? p.exerciseId);
    if (unlogged.length > 0) {
      setUnloggedPrompt(unlogged);
      return;
    }
    void completeNow();
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

  /** Puts a deleted set back exactly as it was: same id, place and time. */
  async function restoreSet(rec: ClientRecord) {
    await deleting.current.get(rec.id)?.catch(() => undefined);
    const back: ClientRecord = { ...rec, _state: "saving" };
    setRecords((prev) => [...prev.filter((r) => r.id !== rec.id), back]);
    void persistOne(back);
  }

  function handleDeleteSet(rec: ClientRecord) {
    setRecords((prev) => prev.filter((r) => r.id !== rec.id));
    setToast({
      key: Date.now(),
      message: "Set deleted.",
      actionLabel: "Undo",
      onAction: () => void restoreSet(rec),
    });
    const run = deleteSetMutation
      .mutateAsync({ sessionId: context.session.id, recordId: rec.id })
      .then(() => undefined)
      .catch((err: { message?: string }) => {
        // The delete did not happen: the set belongs back on screen.
        setRecords((prev) => (prev.some((r) => r.id === rec.id) ? prev : [...prev, { ...rec, _state: undefined }]));
        setErrorMessage(err.message ?? "Could not delete that set.");
        setToast(null);
      })
      .finally(() => deleting.current.delete(rec.id));
    deleting.current.set(rec.id, run);
  }

  /** Skip acts at once on screen; the request goes out after a few seconds unless undone. */
  function commitSkip() {
    if (skipFiredRef.current) return;
    skipFiredRef.current = true;
    skipTimer.current = null;
    markSkippedMutation.mutate({ sessionId: context.session.id });
  }

  function requestSkip() {
    setSkipPending(true);
    skipFiredRef.current = false;
    skipTimer.current = window.setTimeout(commitSkip, SKIP_UNDO_MS);
  }

  function undoSkip() {
    if (skipTimer.current !== null) window.clearTimeout(skipTimer.current);
    skipTimer.current = null;
    setSkipPending(false);
  }

  // Leaving the page makes the skip final: the lifter chose it.
  useEffect(
    () => () => {
      if (skipTimer.current !== null) {
        window.clearTimeout(skipTimer.current);
        skipTimer.current = null;
        if (!skipFiredRef.current) {
          skipFiredRef.current = true;
          markSkippedMutation.mutate({ sessionId: context.session.id });
        }
      }
    },
    [],
  );

  function handleSaveObservation() {
    const content = observationText.trim();
    if (!content) return;
    createObservationMutation.mutate({
      sessionId: context.session.id,
      content,
    });
  }

  /** "How many more could you have done?" answered for a set. */
  async function answerRepsLeft(rec: ClientRecord, rpe: number) {
    patchRecord(rec.id, { actualRpe: rpe });
    await inflight.current.get(rec.id);
    try {
      await updateSetMutation.mutateAsync({
        sessionId: context.session.id,
        recordId: rec.id,
        changes: { actualRpe: rpe },
      });
    } catch {
      patchRecord(rec.id, { actualRpe: null });
    }
  }

  // Finished exercises fold to one line; when one finishes, the next unfinished card comes into view.
  const doneKey = context.workoutDay.prescriptions
    .filter((p) => recordsFor(p.id).length >= p.targetSets)
    .map((p) => p.id)
    .join(",");
  const seenDone = useRef<string | null>(null);
  useEffect(() => {
    const previous = seenDone.current;
    seenDone.current = doneKey;
    if (previous === null || previous.split(",").filter(Boolean).length >= doneKey.split(",").filter(Boolean).length) return;
    const t = window.setTimeout(() => {
      document
        .querySelector<HTMLElement>('[data-exercise-card][data-done="false"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => window.clearTimeout(t);
  }, [doneKey]);

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
  const comeback = targets.some((t) => t.kind === "COMEBACK");
  // The first exercise still to do: the one that explains why Log is greyed out.
  const activeId = workoutDay.prescriptions.find((p) => recordsFor(p.id).length < p.targetSets)?.id ?? null;
  const failedCount = records.filter((r) => r._state === "failed").length;
  const savingCount = records.filter((r) => r._state === "saving").length;

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
      {inProgress && startedAt ? (
        <div className={styles.timerRow}>
          <SessionTimer startedAt={startedAt} />
          <p
            className={`${styles.saveStatus} ${failedCount > 0 ? styles.saveStatusFailed : ""}`}
            role="status"
            aria-live="polite"
          >
            {failedCount > 0 ? (
              <>
                {failedCount === 1 ? "1 set isn't saved yet." : `${failedCount} sets aren't saved yet.`}{" "}
                <button type="button" className={styles.linkButton} onClick={retryFailed}>
                  Retry
                </button>
              </>
            ) : savingCount > 0 ? (
              "Saving…"
            ) : justSaved ? (
              "Saved ✓"
            ) : null}
          </p>
        </div>
      ) : null}

      {errorMessage ? (
        <p className={styles.errorBanner}>{errorMessage}</p>
      ) : null}
      {statusMessage ? (
        <p className={styles.successBanner}>{statusMessage}</p>
      ) : null}
      {comeback && !skipPending && (planned || inProgress) ? (
        <p className={styles.statusBanner}>
          Welcome back. Today runs about 10% lighter on purpose.
        </p>
      ) : null}

      {skipPending ? (
        <div className={styles.statusBanner} role="status">
          <p className={styles.skipUndoText}>Session skipped.</p>
          <button type="button" className={styles.smallSecondaryButton} onClick={undoSkip}>
            Undo
          </button>
        </div>
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

      {planned && !skipPending ? (
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
              {workoutDay.prescriptions.map((p) => {
                const t = targetByRx.get(p.id);
                const equipment = equipmentById.get(p.exerciseId) ?? null;
                return (
                  <li key={p.id}>
                    <span>{exerciseNameById.get(p.exerciseId) ?? p.exerciseId}</span>
                    {t ? (
                      <span className={styles.preStartTarget}>
                        {" "}
                        · {targetShort(t, loadUnitLabel(t.unit, equipment), isFindingWeight(p))}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <div className={styles.sessionActions}>
            <button
              type="button"
              className={styles.skipButton}
              onClick={requestSkip}
            >
              Skip session
            </button>
          </div>
        </section>
      ) : null}

      {inProgress && !restDay && !skipPending ? (
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
                const unit = logUnit(p) === "lb" ? "lb" : "kg";
                const plan = plannedWeight(p);
                const hint = hintByExercise.get(p.exerciseId);
                const target = targetByRx.get(p.id);
                const finding = isFindingWeight(p);
                const done = remaining === 0;
                const expanded = !done || reopened.has(p.id);
                const lastSet = logged[logged.length - 1];
                // Finding a starting weight: ask after the latest set, then suggest the next weight.
                const asking = finding && lastSet !== undefined && lastSet.actualRpe === null && lastSet._state !== "failed";
                const answered = [...logged].reverse().find((r) => r.actualRpe !== null);
                const suggestion =
                  finding && answered
                    ? suggestWeight({
                        load: answered.actualLoad,
                        reps: answered.actualReps,
                        repsLeft: Math.max(0, 10 - (answered.actualRpe ?? 10)),
                        repsLow: p.targetRepsLow,
                        repsHigh: p.targetRepsHigh,
                        unit,
                      })
                    : null;
                const baseline =
                  finding && done
                    ? startingWeightFromSession({
                        sets: logged.map((r) => ({ reps: r.actualReps, load: r.actualLoad, rpe: r.actualRpe })),
                        repsLow: p.targetRepsLow,
                        repsHigh: p.targetRepsHigh,
                        unit,
                      })
                    : null;
                const pickerTarget = finding ? suggestion : target && target.weight !== null && target.weight > 0 ? target.weight : null;
                const canLog = repsOf(vals) !== null;
                return (
                  <li
                    key={p.id}
                    className={`${styles.exerciseCard} ${done && !expanded ? styles.exerciseCardDone : ""}`}
                    data-exercise-card
                    data-done={done ? "true" : "false"}
                  >
                    {done ? (
                      <button
                        type="button"
                        className={styles.doneHeader}
                        aria-expanded={expanded}
                        onClick={() =>
                          setReopened((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.id)) next.delete(p.id);
                            else next.add(p.id);
                            return next;
                          })
                        }
                      >
                        <span className={styles.doneName}>✓ {name}</span>
                        <span className={styles.doneSummary}>{summarizeSets(logged, unitLabel)}</span>
                      </button>
                    ) : (
                      <div className={styles.exerciseHeader}>
                        <span className={styles.exerciseName}>{name}</span>
                        <span className={styles.exercisePlan}>
                          {describePlan(p, equipment)} · {logged.length}/{p.targetSets} logged
                        </span>
                      </div>
                    )}
                    {!done || expanded ? (
                      <>
                        {target ? (
                          <p className={styles.targetLine}>
                            <strong>{targetHeadline(target, loadUnitLabel(target.unit, equipment), finding)}</strong>
                            <span className={styles.targetReason}>
                              {finding && logged.length === 0
                                ? "Start light and tell us how each set felt."
                                : finding
                                  ? null
                                  : target.reason}
                            </span>
                          </p>
                        ) : null}
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
                                          unit={unit}
                                          unitText={logUnit(p)}
                                          value={editing.load}
                                          onChange={(v) => setEditing({ ...editing, load: v })}
                                          plannedWeight={plan ? plan.weight : null}
                                          targetWeight={pickerTarget}
                                          targetLabel={finding ? "Suggested" : "Target"}
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
                                  {r.actualRpe !== null ? ` · ${repsLeftText(r.actualRpe)}` : ""}
                                  {inProgress && gapSecondsById.has(r.id) ? (
                                    <span className={styles.setGap}>
                                      {" "}
                                      {r._batch && gapSecondsById.get(r.id)! < 2
                                        ? "(logged together)"
                                        : `(${formatGap(gapSecondsById.get(r.id)!)} since last)`}
                                    </span>
                                  ) : null}
                                  {r._state === "saving" ? (
                                    <span className={styles.setState}> · saving…</span>
                                  ) : null}
                                  {r._state === "saved" ? (
                                    <span className={styles.setState}> · saved ✓</span>
                                  ) : null}
                                  {r._state === "failed" ? (
                                    <span className={styles.setStateFailed}>
                                      {" "}
                                      · not saved{" "}
                                      <button
                                        type="button"
                                        className={styles.linkButton}
                                        onClick={() => void persistOne(r)}
                                      >
                                        Retry
                                      </button>
                                    </span>
                                  ) : null}
                                  {inProgress && (r._state === undefined || r._state === "saved") ? (
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
                                        onClick={() => handleDeleteSet(r)}
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

                        {asking && lastSet ? (
                          <div className={styles.repsLeftPanel} role="group" aria-label="How many more could you have done?">
                            <p className={styles.repsLeftQuestion}>How many more could you have done?</p>
                            <div className={styles.repsLeftButtons}>
                              {REPS_LEFT_ANSWERS.map((a) => (
                                <button
                                  key={a.id}
                                  type="button"
                                  className={styles.repsLeftButton}
                                  onClick={() => void answerRepsLeft(lastSet, a.rpe)}
                                >
                                  {a.id}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {finding && !asking && suggestion !== null && remaining > 0 ? (
                          <p className={styles.suggestion}>
                            {suggestion === answered?.actualLoad
                              ? `Next set: stay at ${suggestion} ${unitLabel}.`
                              : `Next set: try ${suggestion} ${unitLabel}.`}{" "}
                            <button
                              type="button"
                              className={styles.linkButton}
                              onClick={() => setInputValue(p.id, "load", String(suggestion))}
                            >
                              Use {suggestion} {logUnit(p)}
                            </button>
                          </p>
                        ) : null}

                        {finding && done && baseline !== null ? (
                          <p className={styles.suggestion}>
                            Baseline recorded. Next time, start at {baseline} {unitLabel}.
                          </p>
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
                                  placeholder={
                                    p.targetRepsLow === p.targetRepsHigh
                                      ? String(p.targetRepsHigh)
                                      : `${p.targetRepsLow}–${p.targetRepsHigh}`
                                  }
                                />
                              </label>
                              <div className={styles.inputField}>
                                <span className={styles.inputLabel}>Weight ({unitLabel})</span>
                                <WeightPicker
                                  label={`Weight (${unitLabel})`}
                                  unit={unit}
                                  unitText={logUnit(p)}
                                  value={vals.load}
                                  onChange={(v) => setInputValue(p.id, "load", v)}
                                  plannedWeight={plan ? plan.weight : null}
                                  targetWeight={pickerTarget}
                                  targetLabel={finding ? "Suggested" : "Target"}
                                  lastWeight={lastWeightFor(p, logged, hint)}
                                  testId={`weight-${p.id}`}
                                />
                              </div>
                              {finding ? null : (
                                <div className={`${styles.inputField} ${styles.inputFieldWide}`}>
                                  <span className={styles.inputLabel}>Effort (RPE)</span>
                                  <RpePicker
                                    label="Effort (RPE)"
                                    value={vals.rpe}
                                    onChange={(v) => setInputValue(p.id, "rpe", v)}
                                    testId={`rpe-${p.id}`}
                                  />
                                </div>
                              )}
                            </div>
                            <div className={styles.actionRow}>
                              <button
                                type="button"
                                data-log-actions
                                className={styles.primaryButton}
                                onClick={() => handleLogOne(p)}
                                disabled={!canLog}
                              >
                                Log one set
                              </button>
                              {remaining > 1 ? (
                                <button
                                  type="button"
                                  className={styles.secondaryButton}
                                  onClick={() => handleLogRemaining(p)}
                                  disabled={!canLog}
                                >
                                  Log {remaining} remaining sets
                                </button>
                              ) : null}
                            </div>
                            {canLog || p.id !== activeId ? null : (
                              <p className={styles.logHint}>Enter the reps you did to log a set.</p>
                            )}
                          </>
                        ) : (
                          <p className={styles.muted}>
                            All {p.targetSets} sets logged.
                          </p>
                        )}
                      </>
                    ) : null}
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
                  onClick={() => void completeNow()}
                  disabled={completing || markCompletedMutation.isPending}
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
                disabled={completing || markCompletedMutation.isPending}
              >
                {completing || markCompletedMutation.isPending
                  ? savingCount > 0
                    ? "Saving sets…"
                    : "Completing…"
                  : "Mark complete"}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.skipButton}
              onClick={requestSkip}
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

      <UndoToast toast={toast} onDismiss={() => setToast(null)} />
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
                    {r.actualRpe !== null ? ` · ${repsLeftText(r.actualRpe)}` : ""}
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
