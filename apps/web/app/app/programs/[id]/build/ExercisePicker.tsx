// apps/web/app/app/programs/[id]/build/ExercisePicker.tsx
//
// Inline picker: a search box above a native <select> of exercises grouped by movement pattern, plus an
// Add button. Modeled inline rather than as a modal to keep Phase 4's interaction model simple.
//
// With ~110 exercises a bare <select> is slow to scan, and native type-ahead is prefix-only ("curl" never
// finds "Barbell Curl"), so the search box narrows the select's options by substring. Everything is local:
// exercises still arrive as props and the component API is unchanged.
//
// Behaviour notes:
//   - Groups follow PATTERN_LABEL's insertion order (Squat -> ... -> Other), not alphabetical enum order.
//   - Matching ignores case and every non-alphanumeric character, so "pull up", "pull-up" and "pullup" all
//     find "Pull-Up". It is still plain substring matching: no scoring, no typo tolerance.
//   - Exactly one match auto-selects it (only while there is search text). The selection is derived from
//     what is visible, so Add can never act on an option the user cannot see.
//   - Adding clears the search and the selection, so a second click cannot add a duplicate.
//   - Keyboard: Enter in the search box adds the selected exercise (and never submits an enclosing form),
//     Escape clears the search, and after a keyboard-initiated Add focus returns to the search box.

"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { ExerciseRecord, MovementPattern } from "@training/db";
import styles from "./build.module.css";

interface Props {
  exercises: ExerciseRecord[];
  onSelect: (exerciseId: string) => void;
}

// Insertion order IS the display order of the groups. Keep it canonical when adding a pattern.
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

interface PatternGroup {
  readonly pattern: string;
  readonly label: string;
  readonly exercises: ExerciseRecord[];
}

/** Lowercase, then drop everything that is not a letter or digit ("Pull-Up" -> "pullup"). */
function fold(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Groups in PATTERN_LABEL order; within a group the incoming (name-sorted) order is kept. */
function groupByPattern(list: readonly ExerciseRecord[]): PatternGroup[] {
  const byPattern = new Map<string, ExerciseRecord[]>();
  for (const e of list) {
    const bucket = byPattern.get(e.movementPattern);
    if (bucket) bucket.push(e);
    else byPattern.set(e.movementPattern, [e]);
  }

  const groups: PatternGroup[] = [];
  for (const [pattern, label] of Object.entries(PATTERN_LABEL)) {
    const bucket = byPattern.get(pattern);
    if (bucket) {
      groups.push({ pattern, label, exercises: bucket });
      byPattern.delete(pattern);
    }
  }
  // Safety net: a pattern this file does not know (client/DB version skew) is listed last, never dropped.
  byPattern.forEach((bucket, pattern) => {
    groups.push({ pattern, label: pattern, exercises: bucket });
  });
  return groups;
}

/**
 * The id the <select> shows. A lone search match wins; otherwise the user's pick, but only while it is
 * still visible. Deriving it (rather than storing it) is what keeps Add honest.
 */
function resolveSelection(
  visible: readonly ExerciseRecord[],
  searching: boolean,
  picked: string,
): string {
  const only = visible.length === 1 ? visible[0] : undefined;
  if (searching && only) return only.id;
  return visible.some((e) => e.id === picked) ? picked : "";
}

export function ExercisePicker({ exercises, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const statusId = useId();

  const keyed = useMemo(
    () => exercises.map((exercise) => ({ exercise, key: fold(exercise.name) })),
    [exercises],
  );
  const needle = fold(query);
  const searching = needle !== "";

  const visible = useMemo(
    () =>
      searching
        ? keyed.filter((k) => k.key.includes(needle)).map((k) => k.exercise)
        : exercises,
    [keyed, exercises, needle, searching],
  );
  const groups = useMemo(() => groupByPattern(visible), [visible]);

  const value = resolveSelection(visible, searching, picked);
  const noMatches = searching && visible.length === 0;

  let status = "";
  if (noMatches) status = "No exercises match";
  else if (searching && visible.length === 1) status = `1 match — ${visible[0]?.name ?? ""} selected`;
  else if (searching) status = `${visible.length} matches`;

  function reset() {
    setQuery("");
    setPicked("");
  }

  function add(refocusSearch: boolean) {
    if (!value) return;
    onSelect(value);
    reset();
    if (refocusSearch) searchRef.current?.focus();
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return; // let an IME finish its composition first
    if (e.key === "Enter") {
      e.preventDefault(); // never submit an enclosing <form>
      add(false); // focus is already in the search box
    } else if (e.key === "Escape" && query !== "") {
      e.preventDefault();
      reset();
    }
  }

  function handleAddClick(e: MouseEvent<HTMLButtonElement>) {
    // detail === 0 means keyboard activation. The button disables itself after adding, which would drop
    // focus to <body>, so hand it back to the search box. Mouse and touch clicks leave focus alone (no
    // surprise on-screen keyboard).
    add(e.detail === 0);
  }

  return (
    <div className={styles.picker}>
      <div className={styles.pickerBody}>
        <div className={styles.pickerSearch}>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search exercises…"
            aria-label="Search exercises"
            aria-describedby={statusId}
            autoComplete="off"
            spellCheck={false}
          />
          {query !== "" ? (
            <button
              type="button"
              className={styles.pickerClear}
              onClick={() => {
                reset();
                searchRef.current?.focus();
              }}
              aria-label="Clear search"
              tabIndex={-1} // mouse/touch only; keyboard users have Escape
            >
              ×
            </button>
          ) : null}
        </div>

        <div className={styles.pickerRow}>
          <select
            value={value}
            onChange={(e) => setPicked(e.target.value)}
            disabled={noMatches}
            aria-label="Choose an exercise"
          >
            <option value="">Choose an exercise…</option>
            {groups.map((group) => (
              <optgroup key={group.pattern} label={group.label}>
                {group.exercises.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.equipment ? ` — ${e.equipment}` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="button" onClick={handleAddClick} disabled={!value}>
            Add exercise
          </button>
        </div>

        <p id={statusId} role="status" className={styles.pickerStatus}>
          {status}
        </p>
      </div>
    </div>
  );
}