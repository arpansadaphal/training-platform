// apps/web/app/app/programs/[id]/history/HistoryClient.tsx
//
// The version-history list. Each row is a version; versions are ordered
// newest-first. Every version after the initial one carries its diff from
// the previous version, computed on demand server-side (ARCH-037) and
// passed in pre-computed.
//
// Not interactive beyond a per-version "Show changes" disclosure — no
// timeline, no filters, no charts. That is deliberate (guidance L): the
// data supports a list, not a timeline, and inventing one would be scope
// creep past the Revision + ProgramVersion rows.

"use client";

import { useState } from "react";
import type { StructureDiffEntry } from "@training/domain";
import styles from "./history.module.css";

export interface ClientVersionEntry {
  versionId: string;
  versionNumber: number;
  createdAtIso: string;
  createdVia: "MANUAL_COMMIT" | "AI_APPLIED_SIMULATION";
  isInitial: boolean;
  /** The version this entry is diffed against, or null for the initial one. */
  fromVersionNumber: number | null;
  /** Computed on demand server-side; null for the initial version. */
  diff: StructureDiffEntry[] | null;
}

interface Props {
  programName: string;
  entries: ClientVersionEntry[];
}

export function HistoryClient({ programName, entries }: Props) {
  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.heading}>History</h1>
        <p className={styles.muted}>
          Every committed version of <strong>{programName}</strong>, newest
          first. Commits are immutable; a change always produces a new
          version, never an in-place edit.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className={styles.empty}>
          No committed versions yet. Commit a draft in the Builder to start
          your history.
        </p>
      ) : (
        <ol className={styles.list}>
          {entries.map((entry) => (
            <VersionRow key={entry.versionId} entry={entry} />
          ))}
        </ol>
      )}
    </>
  );
}

function VersionRow({ entry }: { entry: ClientVersionEntry }) {
  const [showDiff, setShowDiff] = useState(false);

  const triggerLabel =
    entry.createdVia === "MANUAL_COMMIT" ? "Manual commit" : "AI-applied";

  const date = new Date(entry.createdAtIso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <li className={styles.item}>
      <div className={styles.itemHeader}>
        <div className={styles.itemTitle}>
          <span className={styles.versionNumber}>
            Version {entry.versionNumber}
          </span>
          <span className={styles.triggerBadge}>{triggerLabel}</span>
        </div>
        <span className={styles.date}>{date}</span>
      </div>

      {entry.isInitial ? (
        <p className={styles.initial}>Initial committed version.</p>
      ) : (
        <>
          <p className={styles.muted}>
            Changes from Version {entry.fromVersionNumber} to{" "}
            {entry.versionNumber}
          </p>
          {entry.diff && entry.diff.length > 0 ? (
            <>
              <button
                type="button"
                className={styles.toggle}
                onClick={() => setShowDiff((s) => !s)}
                aria-expanded={showDiff}
              >
                {showDiff
                  ? "Hide changes"
                  : `Show ${entry.diff.length} change${
                      entry.diff.length === 1 ? "" : "s"
                    }`}
              </button>
              {showDiff ? (
                <ul className={styles.diffList}>
                  {entry.diff.map((d, i) => (
                    <li key={i} className={styles.diffItem}>
                      {describeDiffEntry(d)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className={styles.muted}>No structural changes.</p>
          )}
        </>
      )}
    </li>
  );
}

/**
 * Renders one StructureDiffEntry as a short human-readable string.
 *
 * The discriminant is `op`, not `kind`. For the prescription variants I
 * deliberately do not access per-member fields (their exact shape wasn't
 * confirmed); the message is generic. If a future phase wants more detail
 * there, extend this function against the real shapes in
 * packages/domain/src/mutation/diff-structures.ts.
 */
/**
 * Renders one StructureDiffEntry as a short human-readable string.
 *
 * The discriminant is `op`. This function handles every variant I could
 * confirm from ARCH-037's naming; anything else falls through to a generic
 * message that surfaces the raw op string (so a future variant is visible in
 * the UI, not silently swallowed, and greppable in code review).
 *
 * To make this exhaustive and compiler-enforced, paste the actual union from
 * packages/domain/src/mutation/diff-structures.ts and add cases for any
 * remaining variants, then change the default to a `never` assert.
 */
function describeDiffEntry(entry: StructureDiffEntry): string {
  switch (entry.op) {
    case "ADDED_WORKOUT_DAY":
      return `Added workout day "${entry.name}"`;
    case "REMOVED_WORKOUT_DAY":
      return `Removed workout day "${entry.name}"`;
    case "REORDERED_WORKOUT_DAY":
      return `Reordered a workout day (${entry.fromIndex} → ${entry.toIndex})`;
    case "ADDED_PRESCRIPTION":
      return "Added an exercise";
    case "REMOVED_PRESCRIPTION":
      return "Removed an exercise";
    case "MODIFIED_PRESCRIPTION":
      return "Changed an exercise";
    default: {
      // Unknown variant — surface it rather than swallow it.
      const unknownEntry = entry as { op: string };
      return `Change: ${unknownEntry.op}`;
    }
  }
}