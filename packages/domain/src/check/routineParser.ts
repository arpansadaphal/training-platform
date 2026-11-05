// packages/domain/src/check/routineParser.ts
//
// Free-text routine -> days of exercise lines. Hand-rolled line classifier:
// every line is one of EXERCISE, REST, BLANK, HEADER or unparseable, then days
// are assembled from headers and separators.
//
// Day boundaries (Session E decision):
//   - a HEADER line ("Push", "Day 2 - Pull", "Upper A:") starts a named day;
//   - a blank line starts a new day only between two exercises;
//   - a Rest line is skipped (never a day, never counted) but, like a blank
//     line, separates two exercises (Mon bench / Rest / Wed row is two days);
//   - consecutive exercise lines with nothing between them are one day;
//   - unnamed days are called "Day N".
// Runs of single-exercise days created only by blank lines are folded into one
// day (a formatting artifact), reported in `notes` so the UI can offer the undo.

import { matchExercise } from "./exerciseMatch";
import type {
  CompactProgram,
  ParseOptions,
  ParseResult,
  ParsedDay,
  ParsedLine,
  Resolutions,
  SingletonMergeNote,
  UnparsedLine,
} from "./types";

const MAX_SETS = 20;
const MAX_REPS = 100;
const HEADER_MAX_LENGTH = 40;

// "3x8-10", "3 x 8", "3×8–10", "3 sets of 8-10 reps". The name is whatever precedes it.
const SETS_X_REPS = /^(?<name>.*?)[\s:,@-]*\b(?<sets>\d{1,2})\s*[x×]\s*(?<lo>\d{1,3})(?:\s*(?:-|–|—|to)\s*(?<hi>\d{1,3}))?/i;
const SETS_WORDS = /^(?<name>.*?)[\s:,@-]*\b(?<sets>\d{1,2})\s*sets?\s*(?:of\s*)?(?<lo>\d{1,3})(?:\s*(?:-|–|—|to)\s*(?<hi>\d{1,3}))?\s*(?:reps?)?/i;
const REST_LINE = /^rest(\s+day)?$/i;
const DAY_KEYWORD =
  /\b(day|workout|session|push|pull|legs|upper|lower|full\s*body|chest|back|shoulders|arms|core|abs|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
// "A" and "B" count as day labels only as the last word ("Upper A"), so prose with an "a" in it is not a header.
const DAY_LETTER_SUFFIX = /\s[ab]$/i;
const LIST_MARKER = /^\s*(?:[-*•·]|\d+[.)])\s+/;

interface ExerciseMatchLine {
  name: string;
  sets: number;
  repLow: number;
  repHigh: number;
}

function cleanName(text: string): string {
  return text
    .replace(/[\s:,@\-–—([]+$/, "")
    .replace(/^[\s:,@\-–—)\]]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readExerciseLine(line: string): ExerciseMatchLine | null {
  const stripped = line.replace(LIST_MARKER, "");
  const m = SETS_X_REPS.exec(stripped) ?? SETS_WORDS.exec(stripped);
  if (!m?.groups) return null;
  const name = cleanName(m.groups.name ?? "");
  const sets = Number(m.groups.sets);
  const repLow = Number(m.groups.lo);
  const repHigh = m.groups.hi === undefined ? repLow : Number(m.groups.hi);
  if (!/[a-z]/i.test(name)) return null;
  if (sets < 1 || sets > MAX_SETS || repLow < 1 || repHigh > MAX_REPS || repLow > repHigh) return null;
  return { name, sets, repLow, repHigh };
}

/** "Day 2 - Pull" -> "Pull"; "Upper A:" -> "Upper A". */
function headerName(line: string): string {
  const text = line.replace(LIST_MARKER, "").replace(/:\s*$/, "").trim();
  const afterDay = /^day\s*\d+\s*[-–—:.]\s*(.+)$/i.exec(text);
  return (afterDay?.[1] ?? text).trim();
}

function isHeader(line: string, names: readonly string[]): boolean {
  const text = line.replace(LIST_MARKER, "").trim();
  if (text.length === 0) return false;
  if (/:\s*$/.test(text)) return true;
  // Anything that looks like sets-by-reps is an exercise line gone wrong, never a header.
  if (SETS_X_REPS.test(text) || SETS_WORDS.test(text)) return false;
  // A bare library exercise ("Pull-Up", "Back Squat") is an exercise missing its sets, not a day.
  if (matchExercise(text, names).status === "exact") return false;
  return text.length < HEADER_MAX_LENGTH && (DAY_KEYWORD.test(text) || DAY_LETTER_SUFFIX.test(text));
}

interface DraftDay {
  name: string | null;
  /** How this day began; only "blank" days are candidates for singleton merging. */
  startedBy: "header" | "blank" | "rest" | "start";
  lines: ParsedLine[];
}

export function parseRoutine(
  text: string,
  exerciseNames: readonly string[],
  options: ParseOptions = {},
): ParseResult {
  const mergeSingletons = options.mergeSingletons ?? true;
  const drafts: DraftDay[] = [];
  const unparsed: UnparsedLine[] = [];
  let restLinesSkipped = 0;
  let current: DraftDay | null = null;
  let pending: "blank" | "rest" | null = null;

  const rawLines = text.split(/\r?\n/);
  rawLines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = rawLine.trim();

    if (line.length === 0) {
      if (current !== null && current.lines.length > 0 && pending === null) pending = "blank";
      return;
    }
    if (REST_LINE.test(line.replace(LIST_MARKER, ""))) {
      restLinesSkipped += 1;
      if (current !== null && current.lines.length > 0) pending = "rest";
      return;
    }
    const exercise = readExerciseLine(line);
    if (exercise !== null) {
      if (current === null || (pending !== null && current.lines.length > 0)) {
        current = { name: null, startedBy: current === null ? "start" : pending!, lines: [] };
        drafts.push(current);
      }
      pending = null;
      current.lines.push({
        lineNo,
        raw: rawLine.trim(),
        query: exercise.name,
        sets: exercise.sets,
        repLow: exercise.repLow,
        repHigh: exercise.repHigh,
        match: matchExercise(exercise.name, exerciseNames),
      });
      return;
    }
    if (isHeader(line, exerciseNames)) {
      pending = null;
      // A header directly after another header replaces it.
      if (current !== null && current.lines.length === 0) {
        current.name = headerName(line);
      } else {
        current = { name: headerName(line), startedBy: "header", lines: [] };
        drafts.push(current);
      }
      return;
    }
    unparsed.push({ lineNo, raw: line });
  });

  const nonEmpty = drafts.filter((d) => d.lines.length > 0);
  const { days: assembled, notes } = mergeSingletons ? foldSingletons(nonEmpty) : { days: nonEmpty, notes: [] };

  const days: ParsedDay[] = assembled.map((d, i) => ({
    name: d.name ?? `Day ${i + 1}`,
    nameAuto: d.name === null,
    lines: d.lines,
  }));
  return { days, unparsed, restLinesSkipped, notes };
}

/** Two or more adjacent blank-line-only, one-exercise sections read as one workout. */
function foldSingletons(days: DraftDay[]): { days: DraftDay[]; notes: SingletonMergeNote[] } {
  const out: DraftDay[] = [];
  const notes: SingletonMergeNote[] = [];
  let i = 0;
  while (i < days.length) {
    const start = days[i]!;
    if (start.name === null && start.lines.length === 1) {
      let j = i + 1;
      while (j < days.length && days[j]!.name === null && days[j]!.startedBy === "blank" && days[j]!.lines.length === 1) j += 1;
      if (j - i >= 2) {
        const lines = days.slice(i, j).flatMap((d) => d.lines);
        out.push({ name: null, startedBy: start.startedBy, lines });
        notes.push({ kind: "SINGLETON_MERGE", exerciseCount: lines.length });
        i = j;
        continue;
      }
    }
    out.push(start);
    i += 1;
  }
  return { days: out, notes };
}

/** "Merge all into one day": every parsed exercise in a single day. */
export function mergeAllDays(result: ParseResult): ParseResult {
  const lines = result.days.flatMap((d) => d.lines);
  if (lines.length === 0) return result;
  return { ...result, days: [{ name: "Day 1", nameAuto: true, lines }], notes: [] };
}

/** The library name a line resolves to: the user's answer, else an accepted match, else null. */
export function resolvedName(line: ParsedLine, resolutions: Resolutions): string | null {
  const chosen = resolutions[line.lineNo];
  if (chosen !== undefined) return chosen;
  return line.match.status === "exact" || line.match.status === "unique" ? line.match.best : null;
}

export function countResolved(result: ParseResult, resolutions: Resolutions): number {
  return result.days.reduce((n, d) => n + d.lines.filter((l) => resolvedName(l, resolutions) !== null).length, 0);
}

export function unresolvedLines(result: ParseResult, resolutions: Resolutions): ParsedLine[] {
  return result.days.flatMap((d) => d.lines.filter((l) => resolvedName(l, resolutions) === null));
}

/** Resolved lines only; days left with nothing are dropped. */
export function toCompactProgram(result: ParseResult, resolutions: Resolutions): CompactProgram {
  const days = result.days
    .map((d) => ({
      name: d.name,
      rows: d.lines.flatMap((l) => {
        const name = resolvedName(l, resolutions);
        return name === null ? [] : [[name, l.sets, l.repLow, l.repHigh] as const];
      }),
    }))
    .filter((d) => d.rows.length > 0);
  return { days };
}
