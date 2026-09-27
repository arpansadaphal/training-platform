// apps/web/app/app/constraints/ConstraintsClient.tsx
//
// The constraints surface's interactive layer: create, edit (full form, not
// delete-and-recreate — the row keeps its id), delete.
//
// Wrapped in TRPCProvider so this component can call the constraint router.

"use client";

import { useState } from "react";
import { TRPCProvider, trpc } from "@/src/lib/trpc";
import styles from "./constraints.module.css";

export type ClientConstraintKind =
  | "EXERCISE_AVOIDANCE"
  | "MOVEMENT_PATTERN_AVOIDANCE"
  | "FREEFORM";

export interface ClientConstraint {
  id: string;
  kind: ClientConstraintKind;
  note: string;
  createdAtISO: string;
}

interface Props {
  initialConstraints: ClientConstraint[];
}

const KIND_LABELS: Record<ClientConstraintKind, string> = {
  EXERCISE_AVOIDANCE: "Exercise avoidance",
  MOVEMENT_PATTERN_AVOIDANCE: "Movement-pattern avoidance",
  FREEFORM: "Freeform",
};

const KIND_HINTS: Record<ClientConstraintKind, string> = {
  EXERCISE_AVOIDANCE: "A specific exercise to keep out of your programs.",
  MOVEMENT_PATTERN_AVOIDANCE:
    "A pattern to avoid — e.g. overhead pressing, heavy spinal loading.",
  FREEFORM: "Anything that doesn't fit the two structured kinds.",
};

export function ConstraintsClient(props: Props) {
  return (
    <TRPCProvider>
      <ConstraintsClientInner {...props} />
    </TRPCProvider>
  );
}

function ConstraintsClientInner({ initialConstraints }: Props) {
  const [constraints, setConstraints] =
    useState<ClientConstraint[]>(initialConstraints);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const removeMutation = trpc.constraint.delete.useMutation({
    onSuccess: (_res, variables) => {
      setConstraints((prev) => prev.filter((c) => c.id !== variables.id));
    },
  });

  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setRemoveError(null);
    removeMutation.mutate(
      { id },
      {
        onError: (err) => setRemoveError(err.message),
      },
    );
  };

  const handleCreated = (c: ClientConstraint) => {
    setConstraints((prev) => [c, ...prev]);
    setAdding(false);
  };

  const handleUpdated = (c: ClientConstraint) => {
    setConstraints((prev) => prev.map((x) => (x.id === c.id ? c : x)));
    setEditingId(null);
  };

  return (
    <>
      {removeError ? (
        <p className={styles.error}>Could not delete: {removeError}</p>
      ) : null}

      {adding ? (
        <ConstraintForm
          mode="create"
          onCancel={() => setAdding(false)}
          onSaved={handleCreated}
        />
      ) : (
        <button
          type="button"
          className={styles.addButton}
          onClick={() => setAdding(true)}
        >
          + Add constraint
        </button>
      )}

      {constraints.length === 0 && !adding ? (
        <p className={styles.empty}>
          No constraints recorded. Add one above, or tell the Coach about a
          preference and it will appear here.
        </p>
      ) : null}

      <ul className={styles.list}>
        {constraints.map((c) => {
          const isEditing = editingId === c.id;
          if (isEditing) {
            return (
              <li key={c.id}>
                <ConstraintForm
                  mode="edit"
                  constraint={c}
                  onCancel={() => setEditingId(null)}
                  onSaved={handleUpdated}
                />
              </li>
            );
          }
          return (
            <li key={c.id} className={styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.kindChip}>
                  {KIND_LABELS[c.kind]}
                </span>
                <span className={styles.itemMeta}>
                  Added{" "}
                  {new Date(c.createdAtISO).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <p className={styles.note}>{c.note}</p>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.editButton}
                  onClick={() => setEditingId(c.id)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={styles.deleteButton}
                  disabled={
                    removeMutation.isPending &&
                    removeMutation.variables?.id === c.id
                  }
                  onClick={() => handleDelete(c.id)}
                >
                  {removeMutation.isPending &&
                  removeMutation.variables?.id === c.id
                    ? "Deleting…"
                    : "Delete"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ── Form (create and edit share one component) ───────────────────────────

function ConstraintForm({
  mode,
  constraint,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  constraint?: ClientConstraint;
  onCancel: () => void;
  onSaved: (c: ClientConstraint) => void;
}) {
  const [kind, setKind] = useState<ClientConstraintKind>(
    constraint?.kind ?? "EXERCISE_AVOIDANCE",
  );
  const [note, setNote] = useState(constraint?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const createMutation = trpc.constraint.create.useMutation({
    onSuccess: (r) => {
      onSaved({
        id: r.id,
        kind: r.kind as ClientConstraintKind,
        note: r.note,
        createdAtISO: r.createdAtISO,
      });
    },
    onError: (err) => setError(err.message),
  });

  const updateMutation = trpc.constraint.update.useMutation({
    onSuccess: (r) => {
      onSaved({
        id: r.id,
        kind: r.kind as ClientConstraintKind,
        note: r.note,
        createdAtISO: r.createdAtISO,
      });
    },
    onError: (err) => setError(err.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = note.trim();
    if (trimmed.length === 0) {
      setError("Please enter a note.");
      return;
    }
    if (mode === "create") {
      createMutation.mutate({ kind, note: trimmed });
    } else if (constraint) {
      updateMutation.mutate({ id: constraint.id, kind, note: trimmed });
    }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.field}>
        <label htmlFor="constraint-kind" className={styles.label}>
          Kind
        </label>
        <select
          id="constraint-kind"
          className={styles.select}
          value={kind}
          onChange={(e) =>
            setKind(e.target.value as ClientConstraintKind)
          }
          disabled={isPending}
        >
          <option value="EXERCISE_AVOIDANCE">Exercise avoidance</option>
          <option value="MOVEMENT_PATTERN_AVOIDANCE">
            Movement-pattern avoidance
          </option>
          <option value="FREEFORM">Freeform</option>
        </select>
        <p className={styles.hint}>{KIND_HINTS[kind]}</p>
      </div>

      <div className={styles.field}>
        <label htmlFor="constraint-note" className={styles.label}>
          Note
        </label>
        <textarea
          id="constraint-note"
          className={styles.textarea}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="e.g. No barbell back squats — lower-back history."
          disabled={isPending}
        />
      </div>

      {error ? <p className={styles.formError}>{error}</p> : null}

      <div className={styles.formActions}>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={isPending || note.trim().length === 0}
        >
          {isPending
            ? "Saving…"
            : mode === "create"
              ? "Add constraint"
              : "Save changes"}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}