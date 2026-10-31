// What a coach says first about each of the 25 harness programs, written BEFORE the engine changes it measures
// (ARCH-063, Session B). The lines are the 2026-10-28 audit's "Coach:" lines, shortened to the observation; the
// audit's author is not a certified coach, so every entry says so in `note`.
//
// `match` is the same observation as structure, so parity.ts can compare it with the engine's headline without
// parsing prose. It is read as OR: the program passes when the engine's headline contains ANY listed
// {subject, direction}. How an entry's `match` was written:
//   - it lists the problems the coach states about the program, at the grain the coach used;
//   - a remedy ("add X") is listed only where the audit itself said the engine's finding for X was right (S2, S6)
//     or where the problem is stated as the remedy's target (P3);
//   - where the coach's diagnosis is program-level (A, C, P2) the remedies are not listed;
//   - `none` means the coach found nothing to fix. It passes only on an empty engine headline, and it is the only
//     way a program with zero findings can pass.
// Real coach review (2026-10-30, five coaches, 25 programs) has landed for two things only: B (5/5 say it is fine, so
// its entry is a `none` and its note says so) and the five goal-dependent entries (see `goalDependent`). Every other
// entry is still audit-authored.
// `rationale` says why each match reads the way it does, so a reviewer can disagree with one line at a time.
import type { AnalysisContext } from "../../src/analysis/types";
import type { Program } from "./lib";
import { PROGRAMS_BY_ID } from "./programs";
import type { ExpectedMatch } from "./matcher";

export interface ExpectedHeadline {
  readonly id: string;
  readonly program: Program;
  readonly defaultRpe?: number | null;
  readonly expectedHeadline: string;
  readonly note: string;
  readonly match: readonly ExpectedMatch[];
  readonly rationale: string;
  /**
   * True where real coaches split on whether the finding matters, and the split tracks the lifter's goal (whether
   * it cares about aesthetic priorities such as calves and delts), not the program. Annotation only: it never
   * changes scoring. It marks contour cases that wait for a goal selector (Session C2).
   */
  readonly goalDependent: boolean;
  /** What the lifter tells the checker beyond the program (days per week, minutes per session). Absent: none. */
  readonly context?: AnalysisContext;
}

const AUDIT = "Audit-authored; awaiting real coach review";
const m = (subject: string, direction: ExpectedMatch["direction"]): ExpectedMatch => ({ subject, direction });

function entry(
  id: string,
  expectedHeadline: string,
  match: readonly ExpectedMatch[],
  rationale: string,
  note: string = AUDIT,
): ExpectedHeadline {
  const found = PROGRAMS_BY_ID.get(id);
  if (!found) throw new Error(`expected.ts: no harness program "${id}"`);
  return {
    id,
    program: found.program,
    ...(found.defaultRpe === undefined ? {} : { defaultRpe: found.defaultRpe }),
    expectedHeadline,
    note,
    match,
    rationale,
    goalDependent: false,
  };
}

const GOAL_DEPENDENT_RATIONALE =
  "Goal-dependent: 3 of 5 real coaches agreed with the engine's finding and 2 of 5 said 'fine, optional accessory work'; the split tracks whether the lifter's goal cares about aesthetic priorities (calves, delts).";

/** Marks an entry as a contour case: real coaches split on it by goal. Scoring is untouched. */
const goalDependent = (e: ExpectedHeadline): ExpectedHeadline => ({
  ...e,
  goalDependent: true,
  rationale: `${e.rationale} ${GOAL_DEPENDENT_RATIONALE}`,
});

/** The same lifter told the checker something beyond the program, as /check will ask. */
const withContext = (e: ExpectedHeadline, context: AnalysisContext): ExpectedHeadline => ({ ...e, context });

const derived = (basis: string): string => `Derived (the audit has no line for this run): ${basis}. ${AUDIT}`;

export const EXPECTED_HEADLINES: readonly ExpectedHeadline[] = [
  entry(
    "A",
    "One problem, not 18: you do 12 sets a week in total.",
    [m("global-volume", "low")],
    "The diagnosis is program-level; 'add laterals, curls and calves' is the fix, so those muscles are not listed.",
  ),
  entry(
    "B",
    "Good. Nothing to fix.",
    [m("none", "none")],
    "All five coaches called it fine. The audit had invented two minor findings (a 9-set arm day, side delts at 7.5) that no coach considers a problem; side delts 7.5 sits inside the Adequate band. A purely positive line, like E: it passes only on an empty engine headline.",
    "Real coach review (5/5) is unanimous that this program is fine. The audit was stricter than real coaches. B passes honestly.",
  ),
  entry(
    "C",
    "Every session is about 32 sets; cut 1-2 sets from each exercise and stop isolation sets 1-2 reps short.",
    [m("session-size", "high")],
    "The diagnosis is session length (audit item F8); the audit called the engine's frequency advice wrong for this program.",
  ),
  entry(
    "D",
    "This is a once-a-week split, and leg day is 31 sets in one session.",
    [m("frequency", "low"), m("session-size", "high")],
    "The audit: 'the engine finds the real issue' (frequency); it never names the 31-set day.",
  ),
  entry(
    "E",
    "Agrees with the engine: nothing to fix. Thin, but right.",
    [m("none", "none")],
    "A purely positive line: the one clean zero-finding pass.",
    derived("the audit says only 'coach agrees'"),
  ),
  entry(
    "F1",
    "No overhead press and no pulldown.",
    [m("pattern:vertical-push", "missing"), m("pattern:vertical-pull", "missing")],
    "Both are named; the engine computed the gap and hid it (MINOR x LOW = NONE leverage).",
  ),
  entry(
    "F2",
    "There's no lower body here. Add a leg day.",
    [m("region:lower", "missing")],
    "Stated at region grain, so a single 'quads volume is low' headline does not satisfy it.",
  ),
  entry(
    "G",
    "Only 11 of your 27 exercises say how hard to push; set 'stop with 2-3 reps left' on the other 16.",
    [m("check:effort-defined", "low")],
    "The audit: the engine computed exactly this and then showed a guess ('most often...').",
  ),
  entry(
    "J",
    "All 120 weekly sets are to failure. Growth doesn't need failure; leave 1-3 reps in reserve on most sets.",
    [m("check:near-failure", "high")],
    "The rest-day remark is not listed: consecutive days are not representable in ProgramStructure.",
  ),
  entry(
    "S1",
    "Each pull day has 8 sets of curls on top of rows; drop one curl, or add a set to squats and RDLs.",
    [m("muscle:biceps", "high")],
    "The audit's 'arms out-train your legs' half was retracted in Session A (counted once per set: arms 28, legs 35), so only the curl volume is listed. Biceps at 24.5 is band High, which is information-only, so the engine has no finding for it.",
  ),
  goalDependent(
    entry(
      "S2",
      "Solid. Add 3 sets of face pulls to each upper day. Chest and side delts are thin for an intermediate.",
      [m("muscle:rear delts", "low"), m("muscle:chest", "low"), m("muscle:side delts", "low")],
      "Rear delts is listed because the audit said of the engine's one finding: 'the finding is right'. The 2026-10-31 five-coach review split S2 as 1 unconditional agree / 2 conditional-on-goal / 2 said fine. Marked goalDependent: the finding is real; whether it warrants a headline depends on the lifter's goal.",
    ),
  ),
  goalDependent(
    entry(
      "S3",
      "Lean 40-minute sessions. No calves, thin delts.",
      [m("muscle:calves", "missing"), m("muscle:side delts", "low"), m("muscle:rear delts", "low")],
      "The audit: 'mostly agrees'.",
    ),
  ),
  entry(
    "S4",
    "Hamstrings get half your quads' work (5.5 vs 11), the classic bro-split gap.",
    [m("muscle:hamstrings", "low")],
    "The audit: calves leads 'by alphabet' and the quad-to-hamstring ratio is never stated.",
  ),
  entry(
    "S5a",
    "This is a novice strength program. Judged for muscle growth, its one big gap is pulling.",
    [m("pattern:pull", "missing")],
    "Stated at pattern grain, so 'lats volume is low' does not satisfy it. The audit: 'wrong headline and wrong framing'.",
  ),
  entry(
    "S5b",
    "This is a novice strength program. Judged for muscle growth, its one big gap is pulling.",
    [m("pattern:pull", "missing")],
    "Same program as S5a with the real week (A, B, A).",
    derived("S5's line applies to the one-real-week entry too"),
  ),
  goalDependent(
    entry(
      "S6",
      "The assistance work is thin: add laterals, rear delts and calves.",
      [m("muscle:side delts", "low"), m("muscle:rear delts", "low"), m("muscle:calves", "missing")],
      "The audit: 'the specifics are good', so the three muscles are the findings the engine should lead with.",
    ),
  ),
  goalDependent(
    entry(
      "S6b",
      "The assistance work is thin: add laterals, rear delts and calves.",
      [m("muscle:side delts", "low"), m("muscle:rear delts", "low"), m("muscle:calves", "missing")],
      "Same program as S6 with the BBB sets at RPE 6.",
      derived("S6's line applies to the RPE-6 variant"),
    ),
  ),
  entry(
    "S7",
    "A good first program. Run it 8-12 weeks and add weight.",
    [m("none", "none")],
    "Purely positive for a novice. The engine has no training age, so it will keep reporting findings: a missing input, not a matcher bug.",
  ),
  entry(
    "S8",
    "You press more than twice what you pull (15 vs 6 sets). There's no vertical pull and no leg curl.",
    [m("push-pull", "high"), m("pattern:vertical-pull", "missing")],
    "The audit: 'it has all the pieces but never the pattern', so the per-muscle lows are not listed.",
  ),
  goalDependent(
    entry(
      "P1",
      "Good structure. Thin delts and calves.",
      [m("muscle:side delts", "low"), m("muscle:rear delts", "low"), m("muscle:calves", "low")],
      "The audit's coach line; the 'where are you against your old numbers' question needs a history input.",
    ),
  ),
  entry(
    "P2",
    "For two 45-minute sessions this is close to what you can fit.",
    [m("time-budget", "none")],
    "Needs minutesPerSession. Superset, add a lateral raise and a leg curl are fixes, not listed.",
  ),
  entry(
    "P2-1x",
    "One session a week cannot cover a week: most muscles get 0-3 sets, so get a second session in before adding anything to this one.",
    [m("global-volume", "low")],
    "The same persona on the week they make it once.",
    derived("the audit gives a line for the 2-session week only; this is the same persona's one-session week"),
  ),
  entry(
    "P3",
    "No hinge: your hamstrings get zero. You press twice what you pull (18 vs 9).",
    [m("pattern:hinge", "missing"), m("muscle:hamstrings", "missing"), m("push-pull", "high")],
    "The audit: 'the one thing that matters is buried'. The pattern and the muscle are stated together.",
  ),
  withContext(
    entry(
      "PPLx3",
      "Solid: nothing to fix (a PPL run twice a week).",
      [m("none", "none")],
      "The title says the user runs it twice a week, so a coach reads the 6-day week. Read with daysPerWeek 6 (ARCH-063, Session C1), the engine reads the 3 listed days as a cycle run twice, as the lifter does. Without it the engine reads 3 days as the week: the case the probe exists to show.",
      derived("same program as PPLx6; the audit gives only the engine's 3-day verdict (NEEDS WORK, 5 things)"),
    ),
    { daysPerWeek: 6 },
  ),
  entry(
    "PPLx6",
    "Solid: nothing to fix.",
    [m("none", "none")],
    "Every muscle is Adequate and the audit itself called the 6-day reading right (STRONG, 0 things); it stated no problem.",
    derived("the audit gives only the engine's 6-day verdict (STRONG, 0 things)"),
  ),
];
