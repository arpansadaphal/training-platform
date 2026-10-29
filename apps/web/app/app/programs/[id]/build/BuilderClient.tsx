// apps/web/app/app/programs/[id]/build/BuilderClient.tsx
//
// The interactive Builder: draft switcher, structure editor, live Analyze
// panel, save/commit/discard actions.
//
// Data flow:
//   - Draft list: trpc.draft.listForProgram (initialData from RSC)
//   - Exercises: trpc.exercise.listAll (initialData from RSC)
//   - Analysis preview: trpc.analysis.previewAnalyze (per selected draft)
//
// Model: explicit save-on-demand, per the Phase 4 kickoff. Local edits to
// `localStructure` are not pushed to the server until the user clicks Save.
// The Unsaved-changes indicator tells the user when the panel (which reads
// the persisted structure) is behind their edits.

"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";                          // NEW
import type { ProgramStructure } from "@training/domain";
import type { ExerciseRecord } from "@training/db";
import { TRPCProvider, trpc } from "@/src/lib/trpc";
import { AssessmentDisplay } from "@/components/assessment/AssessmentDisplay";
import { startTrainingAction } from "@/app/train/actions";
import { StructureEditor } from "./StructureEditor";
import { SimulateChangePanel } from "./SimulateChangePanel";          // NEW
import styles from "./build.module.css";

/**
 * Client-side shape of a draft.
 *
 * Deliberately NOT `ProgramDraftRecord` from `@training/db`. The tRPC client
 * delivers a shape that differs from the DB record in two specific ways:
 *
 *   1. Date fields arrive as strings. tRPC has no Date transformer configured
 *      (the default wire codec is JSON), so a mutation's onSuccess callback
 *      receives `createdAt: string`, not `createdAt: Date`. `ProgramDraftRecord`
 *      declares Dates, so it cannot accurately describe the client-side value.
 *
 *   2. `structure` is optional on the wire. tRPC's `Serialize<>` type produces
 *      `structure?: unknown` where the DB record has `structure: unknown`. The
 *      client state must accept the optional form.
 *
 * The UI reads only id / label / structure / status / baseVersionId, so the
 * date fields are intentionally omitted here — a future refactor that starts
 * using them will hit the Date-vs-string mismatch immediately and can decide
 * then whether to configure a wire transformer or normalize at the call site.
 * (Configuring superjson on both ends of tRPC is the natural remedy; it is not
 * done in Phase 4 because nothing yet reads the date fields.)
 *
 * The RSC page passes `ProgramDraftRecord[]` as `initialDrafts`; because
 * ProgramDraftRecord is a structural superset of ClientDraft, that assignment
 * is fine without a cast.
 */
export type ClientDraft = {
  id: string;
  programId: string;
  baseVersionId: string | null;
  label: string;
  structure?: unknown;
  status: "ACTIVE" | "COMMITTED" | "DISCARDED";
  committedAsVersionId: string | null;
};

interface Props {
  programId: string;
  initialDrafts: ClientDraft[];
  initialExercises: ExerciseRecord[];
  initialActiveVersionId: string | null;
  /** Phase A: labels the "start from" choice and the default draft label. */
  initialActiveVersionNumber: number | null;
  initialActiveVersionStructure: ProgramStructure | null;
}

/**
 * TRPCProvider wraps the client component so its descendants can use the
 * trpc.* hooks. RSC pages that don't need interactive tRPC (all of Phase 1's)
 * don't pay this cost — the provider is a boundary, not a root layout.
 */
export function BuilderClient(props: Props) {
  return (
    <TRPCProvider>
      <BuilderClientInner {...props} />
    </TRPCProvider>
  );
}

function isProgramStructure(v: unknown): v is ProgramStructure {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as { workoutDays?: unknown }).workoutDays)
  );
}

function asProgramStructure(draft: ClientDraft): ProgramStructure {
  if (!isProgramStructure(draft.structure)) {
    // A draft whose structure failed validation is a data-integrity issue —
    // the schema's Json column accepts anything, but every writer goes
    // through this shape. Fail loudly rather than rendering a broken editor.
    throw new Error(
      `Draft ${draft.id} has a structure that is not a ProgramStructure.`,
    );
  }
  return draft.structure;
}

function BuilderClientInner({
  programId,
  initialDrafts,
  initialExercises,
  initialActiveVersionId,
  initialActiveVersionNumber,
  initialActiveVersionStructure,
}: Props) {
  const utils = trpc.useUtils();
  const router = useRouter();      

  const [drafts, setDrafts] = useState<ClientDraft[]>(initialDrafts);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(
    initialDrafts[0]?.id ?? null,
  );
  const [localStructure, setLocalStructure] = useState<ProgramStructure | null>(
    () => {
      const first = initialDrafts[0];
      return first ? asProgramStructure(first) : null;
    },
  );
  const [isDirty, setIsDirty] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Set when a commit lands: the next step is training, not a message to read.
  const [committed, setCommitted] = useState<{ versionNumber: number; first: boolean } | null>(null);
  const [staleInfo, setStaleInfo] = useState<{
    baseVersionId: string;
    currentVersionId: string | null;
  } | null>(null);
  const [newDraftLabel, setNewDraftLabel] = useState("");
  // Phase A: a new draft starts from the active version by default, so fixing
  // a committed mistake is an edit, not a rebuild. draftService already
  // copies the base version's structure; the Builder just never asked.
  const [startFromActive, setStartFromActive] = useState(true);
  const canStartFromActive = initialActiveVersionId !== null;
  const defaultDraftLabel =
    canStartFromActive && startFromActive && initialActiveVersionNumber !== null
      ? `Edit of v${initialActiveVersionNumber}`
      : `Draft ${drafts.length + 1}`;

  // What the assessment below reads is the SAVED draft, so the empty state is
  // judged on that, not on unsaved edits.
  const selectedSaved = drafts.find((d) => d.id === selectedDraftId) ?? null;
  const savedStructure =
    selectedSaved !== null && isProgramStructure(selectedSaved.structure)
      ? selectedSaved.structure
      : null;
  const savedDayCount = savedStructure?.workoutDays.length ?? 0;
  const savedExerciseCount =
    savedStructure?.workoutDays.reduce((n, d) => n + d.prescriptions.length, 0) ?? 0;

  // ── Queries ──────────────────────────────────────────────────────────────

  const previewQuery = trpc.analysis.previewAnalyze.useQuery(
    { draftId: selectedDraftId ?? "" },
    { enabled: selectedDraftId !== null },
  );

  // ── Mutations ────────────────────────────────────────────────────────────

  const createDraftMutation = trpc.draft.create.useMutation({
    onSuccess: (created) => {
      setDrafts((prev) => [...prev, created]);
      selectDraft(created);
      setNewDraftLabel("");
      setCommitted(null);
    },
    onError: (err) => setErrorMessage(err.message),
  });

  const updateStructureMutation = trpc.draft.updateStructure.useMutation({
    onSuccess: (updated) => {
      setDrafts((prev) =>
        prev.map((d) => (d.id === updated.id ? updated : d)),
      );
      setIsDirty(false);
      void utils.analysis.previewAnalyze.invalidate({
        draftId: updated.id,
      });
    },
    onError: (err) => setErrorMessage(err.message),
  });

  const discardDraftMutation = trpc.draft.discard.useMutation({
    onSuccess: (_discarded, variables) => {
      const remaining = drafts.filter((d) => d.id !== variables.draftId);
      setDrafts(remaining);
      if (selectedDraftId === variables.draftId) {
        selectDraft(remaining[0] ?? null);
      }
    },
    onError: (err) => setErrorMessage(err.message),
  });

  const commitMutation = trpc.programVersion.commitFromDraft.useMutation({
    onSuccess: (version) => {
      // Reflect the committed state locally: the draft is now COMMITTED and
      // no longer in the active list. The dedicated versions UI is Phase 5+.
      setDrafts((prev) => prev.filter((d) => d.id !== selectedDraftId));
      setSelectedDraftId(null);
      setLocalStructure(null);
      setIsDirty(false);
      setErrorMessage(null);
      setCommitted({ versionNumber: version.versionNumber, first: version.versionNumber === 1 });
      void utils.draft.listForProgram.invalidate({ programId });
      router.refresh(); 
    },
    onError: (err) => {
      // The errorFormatter (packages/api/src/trpc.ts) projects StaleDraftError
      // onto error.data.cause with a discriminated shape. Inspecting
      // structured data here rather than parsing err.message is what the
      // errorFormatter extension was for.
      const cause = (
        err.data as
          | {
              cause?: {
                code?: string;
                baseVersionId?: string;
                currentVersionId?: string | null;
              };
            }
          | undefined
      )?.cause;
      if (cause?.code === "STALE_DRAFT" && cause.baseVersionId) {
        setStaleInfo({
          baseVersionId: cause.baseVersionId,
          currentVersionId: cause.currentVersionId ?? null,
        });
      } else {
        setErrorMessage(err.message);
      }
    },
  });

  // ── Selection / navigation ──────────────────────────────────────────────

  function selectDraft(draft: ClientDraft | null) {
    if (draft === null) {
      setSelectedDraftId(null);
      setLocalStructure(null);
      setIsDirty(false);
      return;
    }
    setSelectedDraftId(draft.id);
    setLocalStructure(asProgramStructure(draft));
    setIsDirty(false);
    setErrorMessage(null);
    setStaleInfo(null);
  }

  function handleSelectExisting(draft: ClientDraft) {
    if (isDirty) {
      const ok = window.confirm(
        "You have unsaved changes. Discard them and switch drafts?",
      );
      if (!ok) return;
    }
    selectDraft(draft);
  }

  const selectedDraft = useMemo(
    () => drafts.find((d) => d.id === selectedDraftId) ?? null,
    [drafts, selectedDraftId],
  );

  // ── Actions ─────────────────────────────────────────────────────────────

  function handleStructureChange(next: ProgramStructure) {
    setLocalStructure(next);
    setIsDirty(true);
  }

  function handleSave() {
    if (!selectedDraftId || !localStructure) return;
    setErrorMessage(null);
    updateStructureMutation.mutate({
      draftId: selectedDraftId,
      structure: localStructure,
    });
  }

  function handleCommit() {
    if (!selectedDraftId) return;
    setErrorMessage(null);
    setStaleInfo(null);
    commitMutation.mutate({ draftId: selectedDraftId });
  }

  function handleCreateDraft(e?: FormEvent) {
    e?.preventDefault();
    const label = newDraftLabel.trim() || defaultDraftLabel;
    const baseVersionId =
      canStartFromActive && startFromActive ? initialActiveVersionId : null;
    createDraftMutation.mutate({ programId, label, baseVersionId });
  }

  function handleDiscard() {
    if (!selectedDraftId) return;
    const ok = window.confirm(
      "Discard this draft? This permanently deletes it.",
    );
    if (!ok) return;
    discardDraftMutation.mutate({ draftId: selectedDraftId });
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
    <div className={styles.layout}>
      <aside className={styles.rail}>
        <h2 className={styles.railHeading}>Drafts</h2>
        {drafts.length === 0 ? (
          <p className={styles.muted}>No active drafts.</p>
        ) : (
          <ul className={styles.draftList}>
            {drafts.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => handleSelectExisting(d)}
                  className={
                    d.id === selectedDraftId
                      ? styles.draftItemSelected
                      : styles.draftItem
                  }
                >
                  {d.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className={styles.newDraftBlock} onSubmit={handleCreateDraft}>
          {canStartFromActive ? (
            <fieldset className={styles.startFrom}>
              <legend>Start from</legend>
              <label>
                <input
                  type="radio"
                  name="startFrom"
                  checked={startFromActive}
                  onChange={() => setStartFromActive(true)}
                />
                Version {initialActiveVersionNumber} (active)
              </label>
              <label>
                <input
                  type="radio"
                  name="startFrom"
                  checked={!startFromActive}
                  onChange={() => setStartFromActive(false)}
                />
                Blank
              </label>
            </fieldset>
          ) : null}
          <label>
            New draft label
            <input
              value={newDraftLabel}
              onChange={(e) => setNewDraftLabel(e.target.value)}
              maxLength={120}
              placeholder={defaultDraftLabel}
            />
          </label>
          <button type="submit" disabled={createDraftMutation.isPending}>
            {createDraftMutation.isPending ? "Creating…" : "Create draft"}
          </button>
        </form>
      </aside>

      <section className={styles.editor}>
        {committed ? (
          <div className={styles.committedBox} role="status">
            <p className={styles.committedText}>
              Committed as version {committed.versionNumber}. It is now the version you train.
            </p>
            <form action={startTrainingAction}>
              <input type="hidden" name="programId" value={programId} />
              <button type="submit" className={styles.startButton}>
                {committed.first ? "Start your first session" : "Start training"}
              </button>
            </form>
          </div>
        ) : null}
        {errorMessage ? (
          <p className={styles.errorBanner}>{errorMessage}</p>
        ) : null}

        {staleInfo ? (
          <div className={styles.staleBanner}>
            <p>
              This draft was based on version{" "}
              {staleInfo.baseVersionId.slice(0, 8)}…, but the program has
              moved on
              {staleInfo.currentVersionId
                ? ` (active: ${staleInfo.currentVersionId.slice(0, 8)}…)`
                : ""}
              . Start a new draft from the active version and re-apply your
              edits there.
            </p>
            <button
              type="button"
              onClick={() => setStaleInfo(null)}
              className={styles.dismissButton}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {selectedDraft === null || localStructure === null ? (
          <div className={styles.emptyState}>
            <p className={styles.muted}>
              Select a draft, or create one, to start building.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.editorHeader}>
              <h2 className={styles.editorHeading}>
                {selectedDraft.label}
                {isDirty ? (
                  <span className={styles.dirtyTag}> · unsaved changes</span>
                ) : null}
              </h2>
              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={
                    !isDirty || updateStructureMutation.isPending
                  }
                >
                  {updateStructureMutation.isPending ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={isDirty || commitMutation.isPending}
                  title={
                    isDirty
                      ? "Save your changes before committing"
                      : undefined
                  }
                >
                  {commitMutation.isPending ? "Committing…" : "Commit"}
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className={styles.secondaryButton}
                  disabled={discardDraftMutation.isPending}
                >
                  Discard
                </button>
              </div>
            </div>

            {initialActiveVersionNumber !== null ? (
              <p className={styles.commitNote}>
                Committing saves this as version {initialActiveVersionNumber + 1}{" "}
                and leaves version {initialActiveVersionNumber} unchanged. If
                you are mid-block, your current training block closes and a
                new one starts.
              </p>
            ) : null}

            <StructureEditor
              structure={localStructure}
              exercises={initialExercises}
              onChange={handleStructureChange}
            />
          </>
        )}
      </section>

      <section className={styles.analyze}>
        <h2 className={styles.railHeading}>Assessment</h2>
        {isDirty ? (
          <p className={styles.staleTag}>
            The assessment below reflects your last saved draft. Save to
            update.
          </p>
        ) : null}
        {selectedDraftId === null ? (
          <p className={styles.muted}>Select a draft to see its assessment.</p>
        ) : savedExerciseCount === 0 ? (
          // An empty program has nothing to assess, and a wall of "Low" cards
          // is not an assessment: say what to do instead.
          <p className={styles.muted}>
            {savedDayCount === 0
              ? "Add your first day to see an assessment."
              : "Add exercises to a day to see an assessment."}
          </p>
        ) : previewQuery.isLoading ? (
          <p className={styles.muted}>Loading…</p>
        ) : previewQuery.isError ? (
          <p className={styles.errorBanner}>{previewQuery.error.message}</p>
        ) : previewQuery.data ? (
          <AssessmentDisplay
            result={previewQuery.data.assessment}
            fitScore={previewQuery.data.fitScore}
            namedActions={previewQuery.data.namedActions}
          />
        ) : null}
      </section>
    </div>
     {/* Phase 5 — the simulate/apply panel. Placed outside the three-column
          grid so it spans full width; the panel owns its own layout. */}
      <SimulateChangePanel
        programId={programId}
        activeVersionId={initialActiveVersionId}
        activeVersionStructure={initialActiveVersionStructure}
        exercises={initialExercises}
      />
    </>
  );
}