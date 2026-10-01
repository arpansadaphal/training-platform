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

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";                          // NEW
import type { ProgramStructure } from "@training/domain";
import type { ExerciseRecord } from "@training/db";
import { TRPCProvider, trpc } from "@/src/lib/trpc";
import { AssessmentDisplay } from "@/components/assessment/AssessmentDisplay";
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
  initialActiveVersionId: string | null;                              // NEW
  initialActiveVersionStructure: ProgramStructure | null;             // NEW
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
  const [staleInfo, setStaleInfo] = useState<{
    baseVersionId: string;
    currentVersionId: string | null;
  } | null>(null);
  const [newDraftLabel, setNewDraftLabel] = useState("");

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
      setErrorMessage(
        `Committed as version ${version.versionNumber}. ` +
          `The versioning UI arrives in a later phase.`,
      );
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

  function handleCreateDraft() {
    const label = newDraftLabel.trim();
    if (!label) {
      setErrorMessage("Give the new draft a label first.");
      return;
    }
    createDraftMutation.mutate({ programId, label });
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

        <div className={styles.newDraftBlock}>
          <label>
            New draft label
            <input
              value={newDraftLabel}
              onChange={(e) => setNewDraftLabel(e.target.value)}
              maxLength={120}
              placeholder="Option B"
            />
          </label>
          <button
            type="button"
            onClick={handleCreateDraft}
            disabled={createDraftMutation.isPending}
          >
            {createDraftMutation.isPending ? "Creating…" : "Create draft"}
          </button>
        </div>
      </aside>

      <section className={styles.editor}>
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
              . Cloning the current version to re-apply your edits arrives in
              a later phase.
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
              Select a draft on the left, or create one to start building.
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
        ) : previewQuery.isLoading ? (
          <p className={styles.muted}>Loading…</p>
        ) : previewQuery.isError ? (
          <p className={styles.errorBanner}>{previewQuery.error.message}</p>
        ) : previewQuery.data ? (
          <AssessmentDisplay
            result={previewQuery.data.assessment}
            fitScore={previewQuery.data.fitScore}
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