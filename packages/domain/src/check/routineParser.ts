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
//
// Real pastes (ARCH-066): bullets and markdown are stripped first; "4 sets × 6–8 reps" and its relatives are one
// pattern; the name is resolved through qualifiers, "A or B" alternatives and parenthesised variants (each choice is
// reported in `lineNotes`, never silent); "30–45s / 12–15 reps" uses the reps; a time-only line is listed but not
// analysed; "Day 3: Rest / Active Recovery" is a rest day and the walking under it is set aside in `skipped`. A line
// that looks like an exercise and cannot be read is always in `unparsed` with a reason, never swallowed.

import { matchExercise } from "./exerciseMatch";
import type {
  CompactProgram,
  LineNote,
  MatchResult,
  ParseOptions,
  ParseResult,
  ParsedDay,
  ParsedLine,
  RestDay,
  Resolutions,
  SingletonMergeNote,
  SkippedLine,
  UnparsedLine,
} from "./types";

const MAX_SETS = 20;
const MAX_REPS = 100;
const HEADER_MAX_LENGTH = 40;

// ARCH-066 (real pastes). One prescription pattern for every notation we see:
//   "3x8-10", "3 x 8", "3×8–10", "3 sets 8-10 reps", "4 sets × 6–8 reps", "4 sets of 5", "4 × 6–8", "4 sets, 8 reps".
// It is searched for, not anchored: the exercise name is whatever precedes it and the qualifiers
// ("per leg", "(2 mins rest)", "@ RPE 8") are whatever follows. Two or fewer digits of sets, three of reps.
const PRESCRIPTION =
  /(?<![\d.])(?<sets>\d{1,2})\s*(?:sets?\s*(?:of|x|×|,)?|[x×])\s*(?<lo>\d{1,3})(?:\s*(?:-|–|—|to)\s*(?<hi>\d{1,3}))?/i;
// What follows the number in "30-45s", "45 sec", "2 minutes": a duration, not reps.
const TIME_UNIT = /^\s*(?:s\b|secs?\b|seconds?\b|mins?\b|minutes?\b)/i;
// After a time: "/ 12-15 reps", "or 12-15 reps". Reps are what the checker reads, so they win.
const REPS_AFTER_TIME = /(?:\/|,|\bor\b)\s*(?<lo>\d{1,3})(?:\s*(?:-|–|—|to)\s*(?<hi>\d{1,3}))?\s*reps?\b/i;
// "20-30 minutes of light walking", "10 min easy cardio": a duration, not an exercise.
const DURATION_LINE = /^\d{1,3}(?:\s*(?:-|–|—|to)\s*\d{1,3})?\s*(?:mins?|minutes?|hrs?|hours?)\b/i;

const SETS_REPS_WORDS = /\b\d+\s*sets?\b|\breps?\b|\bamrap\b|\bfailure\b/i;
const REST_LINE = /^rest(\s+day)?$/i;
// "Day 3: Rest / Active Recovery", "Wednesday - Off", "Day 6: Active Recovery". Matched on a line with no sets and reps.
const REST_HEADING =
  /^(?<label>day\s*\d+|mon\w*|tue\w*|wed\w*|thu\w*|fri\w*|sat\w*|sun\w*)\s*[-–—:.]\s*(?:rest|off|recovery|active\s+recovery)\b[^]*$/i;
const DAY_KEYWORD =
  /\b(day|workout|session|push|pull|legs|upper|lower|full\s*body|chest|back|shoulders|arms|core|abs|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
// "A" and "B" count as day labels only as the last word ("Upper A"), so prose with an "a" in it is not a header.
const DAY_LETTER_SUFFIX = /\s[ab]$/i;

// Leading markers, any mix, repeated: "• ", "- ", "*", "–", "—", "◦", "▸", "►", "1. ", "1a. ", "(1) ", "### ". No space required after a bullet.
const BULLET_RUN = /^[\s•·\-*–—◦▸►‣▪●○]+/;
// List labels from spreadsheets, PDFs and chat: "1. ", "1) ", "1a. ", "23. ", "a. ", "B. ", "(1) ", "(1a) ". A label needs
// its dot or bracket and a space after, so "3x10", "T-Bar Row" and "Day 1." are untouched.
const NUMBER_MARKER = /^(?:\d+[a-zA-Z]?[.)]|[a-zA-Z]\.|\(\d+[a-zA-Z]?\))\s+/;
const MARKDOWN_HEADING = /^#{1,6}\s+/;

/** Strip bullets, list numbers, markdown emphasis and heading marks; trim. The line as typed is kept elsewhere. */
function cleanLine(line: string): string {
  let text = line.replace(/\*\*|__/g, "").trim();
  for (let i = 0; i < 3; i += 1) {
    const before = text;
    text = text.replace(MARKDOWN_HEADING, "").replace(BULLET_RUN, "").replace(NUMBER_MARKER, "").trim();
    if (text === before) break;
  }
  return text;
}

type ExerciseRead =
  | {
      kind: "ok";
      nameText: string;
      sets: number;
      repLow: number;
      repHigh: number;
      timeOnly: boolean;
      timeText: string | null;
      usedReps: boolean;
    }
  | { kind: "out-of-range" };

function cleanName(text: string): string {
  return text
    .replace(/[\s:,@\-–—([]+$/, "")
    .replace(/^[\s:,@\-–—)\]]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPrescription(text: string): boolean {
  return PRESCRIPTION.test(text);
}

/** null: no sets-by-reps on this line at all. */
function readExerciseLine(line: string): ExerciseRead | null {
  const text = cleanLine(line);
  const m = PRESCRIPTION.exec(text);
  if (!m?.groups) return null;
  const nameText = cleanName(text.slice(0, m.index));
  if (!/[a-z]/i.test(nameText)) return null;

  const sets = Number(m.groups.sets);
  let repLow = Number(m.groups.lo);
  let repHigh = m.groups.hi === undefined ? repLow : Number(m.groups.hi);
  const after = text.slice(m.index + m[0].length);
  let timeOnly = false;
  let timeText: string | null = null;
  let usedReps = false;

  if (TIME_UNIT.test(after)) {
    // "30-45s": a duration. Prefer a rep count given beside it; otherwise the line is timed.
    const unit = /^\s*(s|secs?|seconds?|mins?|minutes?)\b/i.exec(after)![1]!.toLowerCase();
    timeText = `${m.groups.lo}${m.groups.hi === undefined ? "" : `–${m.groups.hi}`}${unit === "s" ? "s" : ` ${unit}`}`;
    const reps = REPS_AFTER_TIME.exec(after);
    if (reps?.groups) {
      repLow = Number(reps.groups.lo);
      repHigh = reps.groups.hi === undefined ? repLow : Number(reps.groups.hi);
      usedReps = true;
    } else {
      timeOnly = true;
      repLow = 0;
      repHigh = 0;
    }
  }

  if (sets < 1 || sets > MAX_SETS) return { kind: "out-of-range" };
  if (!timeOnly && (repLow < 1 || repHigh > MAX_REPS || repLow > repHigh)) return { kind: "out-of-range" };
  return { kind: "ok", nameText, sets, repLow, repHigh, timeOnly, timeText: usedReps || timeOnly ? timeText : null, usedReps };
}

// ---- Exercise name -> library ------------------------------------------------------------------------------------

// Parentheses that say how to do the set, not which exercise it is: dropped before matching.
const QUALIFIER_PAREN =
  /\(\s*(?:per\s+(?:leg|side|arm|hand)|each(?:\s+(?:side|leg|arm|hand))?|core|heavy|light|amrap|warm-?up|optional|[^)]*\b(?:rest|mins?|minutes?|secs?|seconds?)\b[^)]*)\s*\)/gi;
const TRAILING_QUALIFIER = /\s+(?:per|each)\s+(?:leg|side|arm|hand)\s*$/i;
const OR_SPLIT = /\s+or\s+/i;

const accepted = (r: MatchResult): boolean => r.status === "exact" || r.status === "unique";

interface NameResolution {
  query: string;
  match: MatchResult;
  alternative: { chosen: string; others: string[]; unmatched: string[] } | null;
}

/**
 * "Deadlift (Conventional or Sumo)", "Lat Pulldown or Pull-Ups", "Plank or Cable Crunches (Core)", "Squat (Front)".
 * Order: qualifiers off; alternatives ("or", inline or in a paren) are each matched and the first match used, with the
 * others offered; otherwise the name as typed, then the parenthesis read as a modifier ("Squat (Front)" is a Front
 * Squat), then the name without it. Only an exact or unique match is accepted here; everything else keeps its
 * candidates and is asked about, as before.
 */
function resolveName(nameText: string, names: readonly string[]): NameResolution {
  const typed = cleanName(nameText.replace(QUALIFIER_PAREN, " ").replace(TRAILING_QUALIFIER, " "));
  const parens = [...typed.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]!.trim()).filter((p) => p.length > 0);
  const base = cleanName(typed.replace(/\([^)]*\)/g, " "));
  const none: MatchResult = { status: "none", best: null, candidates: [] };
  if (base.length === 0) return { query: typed, match: none, alternative: null };

  // Alternatives: inline in the name, else inside a parenthesis.
  let options: { label: string; match: MatchResult }[] | null = null;
  if (OR_SPLIT.test(base)) {
    options = base
      .split(OR_SPLIT)
      .map(cleanName)
      .filter((a) => a.length > 0)
      .map((label) => ({ label, match: matchExercise(label, names) }));
  } else {
    const orParen = parens.find((p) => OR_SPLIT.test(p));
    if (orParen !== undefined) {
      options = orParen
        .split(OR_SPLIT)
        .map(cleanName)
        .filter((a) => a.length > 0)
        .map((label) => {
          const tries = [`${label} ${base}`, `${base} ${label}`, label].map((q) => matchExercise(q, names));
          return { label, match: tries.find(accepted) ?? tries.find((t) => t.status !== "none") ?? tries[0]! };
        });
    }
  }

  if (options !== null && options.length > 1) {
    const hits = options.filter((o) => accepted(o.match));
    if (hits.length > 0) {
      const lead = hits[0]!;
      const others = hits.slice(1).map((o) => o.match.best!);
      const unmatched = options.filter((o) => !accepted(o.match)).map((o) => o.label);
      const chosen = lead.match.best!;
      return {
        query: typed,
        match: { status: lead.match.status, best: chosen, candidates: [chosen, ...others] },
        alternative: others.length > 0 || unmatched.length > 0 ? { chosen, others, unmatched } : null,
      };
    }
    // Neither matched: ask, with every option's candidates, first option first.
    const merged = [...new Set(options.flatMap((o) => o.match.candidates))].slice(0, 5);
    return {
      query: typed,
      match: merged.length > 0 ? { status: "ambiguous", best: merged[0]!, candidates: merged } : none,
      alternative: null,
    };
  }

  // One exercise, maybe with a parenthesis. Name as typed, then the paren as a modifier, then the name without it.
  const attempts: string[] = [];
  if (parens.length > 0) attempts.push(typed);
  for (const p of parens) attempts.push(`${p} ${base}`, `${base} ${p}`);
  for (const q of attempts) {
    const r = matchExercise(q, names);
    if (accepted(r)) return { query: typed, match: r, alternative: null };
  }
  const baseMatch = matchExercise(base, names);
  if (baseMatch.status !== "none") return { query: typed, match: baseMatch, alternative: null };
  return { query: typed, match: parens.length > 0 ? matchExercise(typed, names) : baseMatch, alternative: null };
}

/** "Day 2 - Pull" -> "Pull"; "Upper A:" -> "Upper A". */
function headerName(line: string): string {
  const text = cleanLine(line).replace(/:\s*$/, "").trim();
  const afterDay = /^day\s*\d+\s*[-–—:.]\s*(.+)$/i.exec(text);
  return (afterDay?.[1] ?? text).trim();
}

/** "Day 4 - Upper B" -> "Day 4"; "Push" -> null. */
function headerLabel(line: string): string | null {
  const m = /^day\s*(\d+)/i.exec(cleanLine(line));
  return m ? `Day ${m[1]}` : null;
}

function isHeader(line: string, names: readonly string[]): boolean {
  const text = cleanLine(line);
  if (text.length === 0) return false;
  if (/:\s*$/.test(text)) return true;
  // Anything that looks like sets-by-reps is an exercise line gone wrong, never a header.
  if (hasPrescription(text)) return false;
  // A bare library exercise ("Pull-Up", "Back Squat") is an exercise missing its sets, not a day.
  if (matchExercise(text, names).status === "exact") return false;
  // Sets-and-reps vocabulary without readable numbers ("Push-Ups: 3 sets to failure", "x AMRAP") is an exercise line
  // that we cannot read, which is reported, never a day heading that quietly swallows it.
  if (SETS_REPS_WORDS.test(text)) return false;
  // "Day 1 – Push (Chest, Shoulders, Triceps)" is a heading however long its description runs.
  if (/^day\s*\d+\b/i.test(text)) return true;
  return text.length < HEADER_MAX_LENGTH && (DAY_KEYWORD.test(text) || DAY_LETTER_SUFFIX.test(text));
}

interface DraftDay {
  name: string | null;
  label: string | null;
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
  const skipped: SkippedLine[] = [];
  const restDays: RestDay[] = [];
  const lineNotes: LineNote[] = [];
  let restLinesSkipped = 0;
  let current: DraftDay | null = null;
  let pending: "blank" | "rest" | null = null;
  // True from a rest-day heading until the next blank line, heading or exercise: the walking and stretching under
  // "Day 3: Rest" belong to the rest day, and are listed as skipped rather than reported as unreadable.
  let inRest = false;

  const rawLines = text.split(/\r?\n/);
  rawLines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = rawLine.trim();

    if (line.length === 0) {
      inRest = false;
      if (current !== null && current.lines.length > 0 && pending === null) pending = "blank";
      return;
    }
    const cleaned = cleanLine(line);
    const restHeading = hasPrescription(cleaned) ? null : REST_HEADING.exec(cleaned);
    if (REST_LINE.test(cleaned) || restHeading !== null) {
      restLinesSkipped += 1;
      if (restHeading?.groups?.label !== undefined) {
        const label = restHeading.groups.label;
        restDays.push({ lineNo, label: /^day/i.test(label) ? `Day ${/\d+/.exec(label)![0]}` : label });
      }
      inRest = true;
      if (current !== null && current.lines.length > 0) pending = "rest";
      return;
    }
    const exercise = readExerciseLine(line);
    if (exercise?.kind === "out-of-range") {
      inRest = false;
      unparsed.push({ lineNo, raw: line, reason: "SETS_REPS_OUT_OF_RANGE" });
      return;
    }
    if (exercise !== null) {
      inRest = false;
      if (current === null || (pending !== null && current.lines.length > 0)) {
        current = { name: null, label: null, startedBy: current === null ? "start" : pending!, lines: [] };
        drafts.push(current);
      }
      pending = null;
      const resolved = resolveName(exercise.nameText, exerciseNames);
      current.lines.push({
        lineNo,
        raw: rawLine.trim(),
        query: resolved.query,
        sets: exercise.sets,
        repLow: exercise.repLow,
        repHigh: exercise.repHigh,
        match: resolved.match,
        ...(exercise.timeOnly ? { timeOnly: true, timeText: exercise.timeText ?? "" } : {}),
      });
      if (resolved.alternative !== null) {
        lineNotes.push({ kind: "ALTERNATIVE", lineNo, query: resolved.query, ...resolved.alternative });
      }
      if (exercise.timeOnly) lineNotes.push({ kind: "TIME_ONLY", lineNo, timeText: exercise.timeText ?? "" });
      else if (exercise.usedReps) {
        lineNotes.push({ kind: "TIME_USES_REPS", lineNo, repLow: exercise.repLow, repHigh: exercise.repHigh });
      }
      return;
    }
    if (isHeader(line, exerciseNames)) {
      inRest = false;
      pending = null;
      // A header directly after another header replaces it (and keeps its day number if the new one has none).
      if (current !== null && current.lines.length === 0) {
        current.name = headerName(line);
        current.label = headerLabel(line) ?? current.label;
      } else {
        current = { name: headerName(line), label: headerLabel(line), startedBy: "header", lines: [] };
        drafts.push(current);
      }
      return;
    }
    if (inRest) {
      skipped.push({ lineNo, raw: line, reason: "REST_DAY_CONTENT" });
      return;
    }
    if (DURATION_LINE.test(cleaned)) {
      skipped.push({ lineNo, raw: line, reason: "DURATION" });
      return;
    }
    unparsed.push({ lineNo, raw: line, reason: "NO_SETS_REPS" });
  });

  const nonEmpty = drafts.filter((d) => d.lines.length > 0);
  const { days: assembled, notes } = mergeSingletons ? foldSingletons(nonEmpty) : { days: nonEmpty, notes: [] };

  const days: ParsedDay[] = assembled.map((d, i) => ({
    name: d.name ?? `Day ${i + 1}`,
    nameAuto: d.name === null,
    label: d.label,
    lines: d.lines,
  }));
  return { days, unparsed, restLinesSkipped, notes, restDays, skipped, lineNotes };
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
        out.push({ name: null, label: null, startedBy: start.startedBy, lines });
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
  return { ...result, days: [{ name: "Day 1", nameAuto: true, label: null, lines }], notes: [], restDays: [] };
}

/** The library name a line resolves to: the user's answer, else an accepted match, else null. */
export function resolvedName(line: ParsedLine, resolutions: Resolutions): string | null {
  const chosen = resolutions[line.lineNo];
  if (chosen !== undefined) return chosen;
  return line.match.status === "exact" || line.match.status === "unique" ? line.match.best : null;
}

/** Lines the analysis reads: everything but time-only ones ("3 sets x 30s"), which have no reps to read. */
const analysed = (line: ParsedLine): boolean => line.timeOnly !== true;

export function countResolved(result: ParseResult, resolutions: Resolutions): number {
  return result.days.reduce(
    (n, d) => n + d.lines.filter((l) => analysed(l) && resolvedName(l, resolutions) !== null).length,
    0,
  );
}

export function unresolvedLines(result: ParseResult, resolutions: Resolutions): ParsedLine[] {
  return result.days.flatMap((d) => d.lines.filter((l) => analysed(l) && resolvedName(l, resolutions) === null));
}

/** Resolved lines only; days left with nothing are dropped. Time-only lines are listed to the lifter, not analysed. */
export function toCompactProgram(result: ParseResult, resolutions: Resolutions): CompactProgram {
  const days = result.days
    .map((d) => ({
      name: d.name,
      rows: d.lines.flatMap((l) => {
        const name = analysed(l) ? resolvedName(l, resolutions) : null;
        return name === null ? [] : [[name, l.sets, l.repLow, l.repHigh] as const];
      }),
    }))
    .filter((d) => d.rows.length > 0);
  return { days };
}

export type ScheduleEntry =
  | { readonly kind: "day"; readonly index: number; readonly day: ParsedDay }
  | { readonly kind: "rest"; readonly label: string };

/** Training days and named rest days in the order the lifter wrote them, for the confirmation list. */
export function scheduleEntries(result: ParseResult): ScheduleEntry[] {
  const out: ScheduleEntry[] = [];
  const rests = [...result.restDays];
  result.days.forEach((day, index) => {
    const first = day.lines[0]?.lineNo ?? Number.MAX_SAFE_INTEGER;
    while (rests.length > 0 && rests[0]!.lineNo < first) out.push({ kind: "rest", label: rests.shift()!.label });
    out.push({ kind: "day", index, day });
  });
  for (const r of rests) out.push({ kind: "rest", label: r.label });
  return out;
}
