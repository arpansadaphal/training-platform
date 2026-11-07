// packages/domain/src/check/types.ts
//
// Shapes for the public Program Checker (/check). Pure data: no DB, no auth.
// A pasted or preset routine travels as a CompactProgram (exercise NAMES, not
// ids), so it can live in a URL hash and in sessionStorage; the server resolves
// names to ids against the seeded exercise library.

/** One prescription: [exercise name, sets, repsLow, repsHigh]. */
export type CompactRow = readonly [name: string, sets: number, repLow: number, repHigh: number];

export interface CompactDay {
  readonly name: string;
  readonly rows: readonly CompactRow[];
}

export interface CompactProgram {
  readonly days: readonly CompactDay[];
}

/** The slice of the exercise library the parser needs. */
export interface ExerciseOption {
  readonly id: string;
  readonly name: string;
}

export type MatchStatus =
  /** The text is the exercise's name (or a known abbreviation of it). */
  | "exact"
  /** Exactly one library exercise contains the text. */
  | "unique"
  /** Several exercises contain the text, or several are about equally close. */
  | "ambiguous"
  /** One close spelling: likely a typo. Needs a yes. */
  | "suggested"
  | "none";

export interface MatchResult {
  readonly status: MatchStatus;
  /** Best guess; null only when status is "none". */
  readonly best: string | null;
  /** Up to 5 names, best first. */
  readonly candidates: readonly string[];
}

export interface ParsedLine {
  /** 1-based line number in the pasted text. */
  readonly lineNo: number;
  readonly raw: string;
  /** The exercise text as typed, before matching. */
  readonly query: string;
  readonly sets: number;
  readonly repLow: number;
  readonly repHigh: number;
  readonly match: MatchResult;
  /**
   * Time-based prescription with no rep count ("3 sets x 30-45s"): shown to the lifter, but left out of the
   * analysis (the checker reads reps; it does not invent them). repLow and repHigh are 0 on these lines.
   */
  readonly timeOnly?: boolean;
  /** The time part as typed, "30-45s", for display. Present only when timeOnly. */
  readonly timeText?: string;
}

export interface ParsedDay {
  readonly name: string;
  /** True when the name was generated ("Day 2") rather than typed. */
  readonly nameAuto: boolean;
  /** "Day 4" when the heading carried a day number, else null. The display uses it so a rest day keeps its number. */
  readonly label?: string | null;
  readonly lines: readonly ParsedLine[];
}

/** Why a line that looked like an exercise could not be read. Lines the library cannot match are asked about instead. */
export type UnparsedReason = "NO_SETS_REPS" | "SETS_REPS_OUT_OF_RANGE";

export interface UnparsedLine {
  readonly lineNo: number;
  readonly raw: string;
  readonly reason?: UnparsedReason;
}

/** A named rest day ("Day 3: Rest / Active Recovery"). Not part of the analysed program; shown so the days add up. */
export interface RestDay {
  readonly lineNo: number;
  readonly label: string;
}

/** A line that is not an exercise and was set aside on purpose, never silently: the walking under a rest day. */
export interface SkippedLine {
  readonly lineNo: number;
  readonly raw: string;
  readonly reason: "DURATION" | "REST_DAY_CONTENT";
}

/** Something the lifter may want to check about how one line was read. Separate from `notes`, which are about days. */
export type LineNote =
  /** "Lat Pulldown or Pull-Ups": one was used, the others are offered. `unmatched` are alternatives the library lacks. */
  | {
      readonly kind: "ALTERNATIVE";
      readonly lineNo: number;
      readonly query: string;
      readonly chosen: string;
      readonly others: readonly string[];
      readonly unmatched: readonly string[];
    }
  /** "30-45s / 12-15 reps": the reps were used and the time was ignored. */
  | { readonly kind: "TIME_USES_REPS"; readonly lineNo: number; readonly repLow: number; readonly repHigh: number }
  /** "30-45s" alone: listed, not analysed. */
  | { readonly kind: "TIME_ONLY"; readonly lineNo: number; readonly timeText: string };

export interface SingletonMergeNote {
  readonly kind: "SINGLETON_MERGE";
  /** How many exercises were folded into one day. */
  readonly exerciseCount: number;
}

export interface ParseResult {
  readonly days: readonly ParsedDay[];
  readonly unparsed: readonly UnparsedLine[];
  /** Every rest line and rest-day heading, named or not. */
  readonly restLinesSkipped: number;
  readonly notes: readonly SingletonMergeNote[];
  /** Rest days that had a label ("Day 3"); a plain "Rest" line is only counted in restLinesSkipped. */
  readonly restDays: readonly RestDay[];
  readonly skipped: readonly SkippedLine[];
  readonly lineNotes: readonly LineNote[];
}

export interface ParseOptions {
  /**
   * Fold runs of single-exercise sections that were split only by blank lines
   * into one day. Default true; the UI turns it off for "They are separate days".
   */
  readonly mergeSingletons?: boolean;
}

/** lineNo -> chosen library exercise name (answers to "did you mean"). */
export type Resolutions = Readonly<Record<number, string>>;
