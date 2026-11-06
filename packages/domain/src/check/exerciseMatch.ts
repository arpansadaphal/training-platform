// packages/domain/src/check/exerciseMatch.ts
//
// Match free text ("bench", "RDL", "pullups") to a library exercise name.
// Tiers: exact (after abbreviation expansion) -> a few bare lifts that mean one thing in practice -> contained in a
// name -> close spelling. Only exact and unique matches are accepted without a confirmation; everything else comes
// back with ranked candidates.
//
// ARCH-065 / Fix 5a (the /check stranger audit). Two changes, both about not making a lifter answer questions a coach
// would not ask:
//   1. BARE_DEFAULTS. "Bench", "Squat", "Row" and "Deadlift" are accepted as the standard barbell lift, with status
//      "unique". The confirmation step still shows the resolved name ("Barbell Bench Press 3x8") for the lifter to
//      read, and "DB Bench" or "Cable Row" are exact or contained matches that never reach this table.
//   2. COMMON_FIRST. Candidates that are several names containing the text are ranked with the usual lifts first, so
//      "Incline" offers the presses before "Incline Curl" (which was the pre-highlighted answer, a biceps exercise on
//      a chest day), and "Curl" offers Dumbbell Curl first. Everything else keeps the old order (fewest words, then
//      alphabetical). "Curl" is still asked: a barbell, dumbbell or cable curl is a real choice.

import type { MatchResult } from "./types";

/** Lowercase, strip everything but letters and digits: "Pull-Up" -> "pullup". */
export function fold(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ABBREVIATIONS: Readonly<Record<string, string>> = {
  ohp: "overhead press",
  rdl: "romanian deadlift",
  sldl: "stiff leg deadlift",
  db: "dumbbell",
  bb: "barbell",
  dl: "deadlift",
};

/** Lowercase word tokens; apostrophes dropped, abbreviations expanded, plural "s" removed. */
function tokens(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
  const expanded = words.flatMap((w) => (ABBREVIATIONS[w] ?? w).split(" "));
  return expanded.map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** Folded text -> the standard lift it means in practice. Used only when the library has that name. */
const BARE_DEFAULTS: Readonly<Record<string, string>> = {
  bench: "Barbell Bench Press",
  benchpress: "Barbell Bench Press",
  squat: "Back Squat",
  deadlift: "Conventional Deadlift",
  row: "Barbell Row",
};

/** Ranked first among several candidates, in this order. Names not listed follow, fewest words first. */
const COMMON_FIRST: readonly string[] = [
  "Barbell Bench Press",
  "Dumbbell Bench Press",
  "Incline Dumbbell Press",
  "Incline Barbell Bench Press",
  "Back Squat",
  "Front Squat",
  "Conventional Deadlift",
  "Romanian Deadlift",
  "Barbell Row",
  "Dumbbell Row",
  "Seated Cable Row",
  "Overhead Press",
  "Dumbbell Shoulder Press",
  "Lat Pulldown",
  "Pull-Up",
  "Dumbbell Curl",
  "Barbell Curl",
  "Hammer Curl",
  "Cable Curl",
  "Tricep Pushdown",
  "Lateral Raise",
  "Leg Press",
  "Leg Curl",
];

const commonRank = (name: string): number => {
  const at = COMMON_FIRST.indexOf(name);
  return at === -1 ? Number.MAX_SAFE_INTEGER : at;
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 0 : 1 - levenshtein(a, b) / longest;
}

/** Share of the query's words that have a word within one edit in the name. */
function tokenCloseness(query: readonly string[], name: readonly string[]): number {
  if (query.length === 0) return 0;
  const close = query.filter((q) => name.some((n) => n === q || (q.length > 3 && levenshtein(q, n) <= 1)));
  return close.length / query.length;
}

const MAX_CANDIDATES = 5;
const FUZZY_FLOOR = 0.6;
const SUGGEST_AT = 0.8;

export function matchExercise(query: string, names: readonly string[]): MatchResult {
  const q = tokens(query);
  const qFold = q.join("");
  if (qFold.length === 0) return { status: "none", best: null, candidates: [] };

  const entries = names.map((name) => ({ name, tokens: tokens(name) }));

  const exact = entries.find((e) => e.tokens.join("") === qFold);
  if (exact) return { status: "exact", best: exact.name, candidates: [exact.name] };

  // A bare lift that means one thing in practice (Fix 5a): accepted, and shown by its full name in the parsed list.
  const bare = BARE_DEFAULTS[qFold];
  if (bare !== undefined && names.includes(bare)) return { status: "unique", best: bare, candidates: [bare] };

  // Contained: every query word appears in the name, or the folded text is a substring. The usual lifts come first.
  const contained = entries
    .filter((e) => q.every((w) => e.tokens.includes(w)) || e.tokens.join("").includes(qFold))
    .sort(
      (a, b) =>
        commonRank(a.name) - commonRank(b.name) ||
        a.tokens.length - b.tokens.length ||
        a.name.localeCompare(b.name),
    );
  if (contained.length === 1) {
    return { status: "unique", best: contained[0]!.name, candidates: [contained[0]!.name] };
  }
  if (contained.length > 1) {
    const top = contained.slice(0, MAX_CANDIDATES).map((e) => e.name);
    return { status: "ambiguous", best: top[0]!, candidates: top };
  }

  const scored = entries
    .map((e) => ({
      name: e.name,
      score: Math.max(similarity(qFold, e.tokens.join("")), 0.9 * tokenCloseness(q, e.tokens)),
    }))
    .filter((s) => s.score >= FUZZY_FLOOR)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  if (scored.length === 0) return { status: "none", best: null, candidates: [] };

  const top = scored.slice(0, MAX_CANDIDATES).map((s) => s.name);
  const lead = scored[0]!;
  const runnerUp = scored[1];
  const clearWinner = lead.score >= SUGGEST_AT && (runnerUp === undefined || lead.score - runnerUp.score >= 0.1);
  return { status: clearWinner ? "suggested" : "ambiguous", best: top[0]!, candidates: top };
}
