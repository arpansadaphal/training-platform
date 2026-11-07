// packages/domain/src/check/exerciseMatch.ts
//
// Match free text ("bench", "RDL", "pullups") to a library exercise name.
// Tiers: exact (after abbreviation expansion) -> a few bare lifts that mean one thing in practice -> contained in a
// name -> close spelling. Only exact and unique matches are accepted without a confirmation; everything else comes
// back with ranked candidates.
//
// ARCH-066 (real pastes). Two more changes, both about the same thing:
//   3. QUALIFIED NAMES. "Seated Dumbbell Shoulder Press", "Barbell Back Squat", "Lying Leg Curls" and "Dumbbell Lateral
//      Raises" are a library exercise with a word or two added. When the lifter's words contain every word of exactly one
//      library name (after plural folding), that name is accepted ("unique"), with no question. Where the library has
//      both "Leg Curl" and "Seated Leg Curl" and the lifter wrote the longer one, the longest name wins; two names that
//      neither contains the other ("Chest-Supported Row", "T-Bar Row" for "Chest-Supported T-Bar Row") are asked about.
//      This covers what stripping a leading equipment word or adjective would, without a list of such words, and it
//      is why "Dumbbell Lateral Raises" is the plain Lateral Raise and not the Cable one.
//   4. ALTERNATIVES. A question offers the best guess plus at most two others, and only those whose overlap with what was
//      typed (Jaccard: shared words over all words) is at least 60% of the best guess's. "Overhead Barbell Press" no longer
//      offers Barbell Bench Press. The order is not changed by the score, so "Incline" still leads with a press.
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

/**
 * Plural to singular. "squats" -> "squat" (already did this), plus the two cases real pastes hit: "ups" ("Pull-Ups")
 * and the "-es" plurals "crunches" and "presses". Applied to the library names too, so both sides agree.
 */
function singular(w: string): string {
  if (/(?:ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  if (w.length === 3 && /^[a-z]{2}s$/.test(w) && !/(?:us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

/** Lowercase word tokens; apostrophes dropped, abbreviations expanded, plural "s" removed. */
function tokens(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
  const expanded = words.flatMap((w) => (ABBREVIATIONS[w] ?? w).split(" "));
  return expanded.map(singular);
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

/** The best guess plus at most two alternatives. */
const MAX_CANDIDATES = 3;
/** An alternative must overlap what was typed at least this much, relative to the best guess. */
const ALTERNATIVE_SHARE = 0.6;
/** A qualified name may add at most this many words to a library name. */
const MAX_EXTRA_WORDS = 2;
const FUZZY_FLOOR = 0.6;
const SUGGEST_AT = 0.8;

/** Shared words over all words, counting a word within one edit as shared (typos). 0 to 1. */
function overlap(query: readonly string[], name: readonly string[]): number {
  const q = new Set(query);
  const n = new Set(name);
  const shared = [...q].filter((w) => n.has(w) || (w.length > 3 && [...n].some((x) => x.length > 3 && levenshtein(w, x) <= 1)));
  const union = q.size + n.size - shared.length;
  return union === 0 ? 0 : shared.length / union;
}

/** Keep the best guess, then up to two alternatives that overlap the text at least 60% as well as it does. */
function closeAlternatives(query: readonly string[], ranked: readonly { name: string; tokens: readonly string[] }[]): string[] {
  const lead = ranked[0];
  if (lead === undefined) return [];
  const floor = overlap(query, lead.tokens) * ALTERNATIVE_SHARE;
  return ranked
    .filter((e, i) => i === 0 || overlap(query, e.tokens) >= floor)
    .slice(0, MAX_CANDIDATES)
    .map((e) => e.name);
}

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

  // Qualified name (ARCH-066): the lifter's words contain every word of a library name, plus one or two more.
  // The longest such name wins; one name left is accepted, several are asked about.
  const typed = new Set(q);
  const supersets = entries.filter(
    (e) => e.tokens.length > 0 && e.tokens.every((t) => typed.has(t)) && typed.size - new Set(e.tokens).size <= MAX_EXTRA_WORDS,
  );
  const longest = supersets.filter(
    (e) => !supersets.some((o) => o !== e && o.tokens.length > e.tokens.length && e.tokens.every((t) => o.tokens.includes(t))),
  );
  if (longest.length === 1) {
    return { status: "unique", best: longest[0]!.name, candidates: [longest[0]!.name] };
  }
  if (longest.length > 1) {
    const ranked = [...longest].sort(
      (a, b) => commonRank(a.name) - commonRank(b.name) || b.tokens.length - a.tokens.length || a.name.localeCompare(b.name),
    );
    const top = closeAlternatives(q, ranked);
    return { status: "ambiguous", best: top[0]!, candidates: top };
  }

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
    const top = closeAlternatives(q, contained);
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

  const byName = new Map(entries.map((e) => [e.name, e.tokens]));
  const top = closeAlternatives(
    q,
    scored.map((x) => ({ name: x.name, tokens: byName.get(x.name)! })),
  );
  const lead = scored[0]!;
  const runnerUp = scored[1];
  const clearWinner = lead.score >= SUGGEST_AT && (runnerUp === undefined || lead.score - runnerUp.score >= 0.1);
  return { status: clearWinner ? "suggested" : "ambiguous", best: top[0]!, candidates: top };
}
