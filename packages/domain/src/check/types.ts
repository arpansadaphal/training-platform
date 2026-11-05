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
}

export interface ParsedDay {
  readonly name: string;
  /** True when the name was generated ("Day 2") rather than typed. */
  readonly nameAuto: boolean;
  readonly lines: readonly ParsedLine[];
}

export interface UnparsedLine {
  readonly lineNo: number;
  readonly raw: string;
}

export interface SingletonMergeNote {
  readonly kind: "SINGLETON_MERGE";
  /** How many exercises were folded into one day. */
  readonly exerciseCount: number;
}

export interface ParseResult {
  readonly days: readonly ParsedDay[];
  readonly unparsed: readonly UnparsedLine[];
  readonly restLinesSkipped: number;
  readonly notes: readonly SingletonMergeNote[];
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
