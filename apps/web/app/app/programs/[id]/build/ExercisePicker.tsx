// apps/web/app/app/programs/[id]/build/ExercisePicker.tsx
//
// Inline picker: a search box above a short scrolling list of exercises grouped by movement pattern, plus an
// Add button. Modeled inline rather than as a modal to keep Phase 4's interaction model simple.
//
// The list is an ARIA listbox rather than a native <select> because an <option> cannot hold a picture: each row
// shows a 32px still of the exercise (when it has a drawing) so "Incline Barbell Bench Press" and "Incline Curl"
// look different at a glance. A row is one line, truncated, at 375px.
//
// With ~110 exercises the list is slow to scan and native type-ahead is prefix-only ("curl" never finds
// "Barbell Curl"), so the search box narrows the list by substring. Everything is local: exercises still arrive
// as props and the component API is unchanged.
//
// Behaviour notes:
//   - Groups follow PATTERN_LABEL's insertion order (Squat -> ... -> Other), not alphabetical enum order.
//   - Matching ignores case and every non-alphanumeric character, so "pull up", "pull-up" and "pullup" all
//     find "Pull-Up". It is still plain substring matching: no scoring, no typo tolerance.
//   - Exactly one match auto-selects it (only while there is search text). The selection is derived from
//     what is visible, so Add can never act on an option the user cannot see.
//   - Adding clears the search and the selection, so a second click cannot add a duplicate.
//   - Keyboard: ArrowUp/Down (in the search box or the list) move the selection, Enter adds the selected
//     exercise (and never submits an enclosing form), Escape clears the search, and after a keyboard-initiated
//     Add focus returns to the search box.

"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { ExerciseRecord, MovementPattern } from "@training/db";
import { ExerciseThumb } from "@/components/session/ExerciseIllustration";
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
  const listRef = useRef<HTMLDivElement>(null);
  const statusId = useId();
  const listId = useId();

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

  // Keep the selected row in view in the list (not the page) when the arrow keys or a lone search match move it.
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !row) return;
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
  }, [value]);

  function move(delta: 1 | -1) {
    if (visible.length === 0) return;
    const at = visible.findIndex((e) => e.id === value);
    const next = at === -1 ? (delta === 1 ? 0 : visible.length - 1) : Math.min(Math.max(at + delta, 0), visible.length - 1);
    setPicked(visible[next]!.id);
  }

  function handleListKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      add(false);
    }
  }

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
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter") {
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
            aria-controls={listId}
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

        <div
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label="Choose an exercise"
          aria-activedescendant={value ? `${listId}-${value}` : undefined}
          tabIndex={0}
          className={styles.pickerList}
          onKeyDown={handleListKeyDown}
        >
          {groups.map((group) => (
            <div key={group.pattern} role="group" aria-label={group.label}>
              <div className={styles.pickerGroup} aria-hidden="true">
                {group.label}
              </div>
              {group.exercises.map((e) => {
                const label = e.equipment ? `${e.name} — ${e.equipment}` : e.name;
                return (
                  <div
                    key={e.id}
                    id={`${listId}-${e.id}`}
                    role="option"
                    aria-selected={e.id === value}
                    title={label}
                    className={styles.pickerOption}
                    onClick={() => setPicked(e.id)}
                  >
                    <ExerciseThumb name={e.name} />
                    <span className={styles.pickerOptionText}>{label}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className={styles.pickerRow}>
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