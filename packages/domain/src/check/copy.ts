// packages/domain/src/check/copy.ts
//
// Every static string on /check, /check/[hash] and /check/about, in one place so
// copy.test.ts can run the whole set through FORBIDDEN_COPY_PATTERNS (invariants
// 9 and 10: no outcome guarantees, no optimality claims, no medical or cause
// claims). Strings with numbers are functions.

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export const CHECK_COPY = {
  pageTitle: "Program Checker",
  pageDescription:
    "Paste a training routine and see how its structure reads against evidence-graded thresholds for muscle growth.",
  intro: "Paste a routine or pick a common split. The result is a structural read, labeled provisional.",
  tabPaste: "Paste a routine",
  tabPick: "Pick a common split",
  pasteLabel: "Your routine",
  pastePlaceholder:
    "Push\nBarbell Bench Press 3x8-10\nOverhead Press 3x8-10\n\nPull\nBarbell Row 3x8-10\nPull-Up 3x6-10\n\nLegs\nBack Squat 3x8-10\nRomanian Deadlift 3x8-10",
  assumptionsNote:
    "We assume RPE 8 and bodyweight load for pasted programs. The analysis is about your program structure, not your specific weights.",
  layoutHint: "Start a new day with a heading such as Push or Day 2, or leave a blank line between days.",
  // ARCH-065 / D5. The checker reads one week as the days listed. A 3-day rotation run twice a week is six days.
  rotationHint: "List every day you train. If you repeat a 3-day rotation twice a week, paste it as 6 days.",
  confirmFirst: "Confirm the reading above to continue.",
  tooLarge: "That routine is larger than the checker reads: up to 7 days and 15 exercises a day.",
  aboutLink: "How the checker works",
  useCandidate: (name: string) => `Use ${name}`,
  readRoutine: "Read my routine",
  checkProgram: "Check my program",
  needMoreExercises: (n: number) =>
    `Add ${n} more recognized ${plural(n, "exercise", "exercises")} to check a program.`,
  signupNote: "Sign up (it's free) to save the program you just checked as your first program.",
  backToChecker: "Back to the checker",
  pickIntro: "Each split loads straight into the assessment.",

  parsedHeading: (days: number) => `Parsed as ${days} ${plural(days, "day", "days")}`,
  parsedDayLine: (index: number, name: string, nameAuto: boolean) =>
    nameAuto ? `Day ${index}` : `Day ${index} (${name})`,
  looksRight: "Looks right",
  mergeAll: "Merge all into one day",
  editManually: "Edit manually",
  splitAgain: "Split into days again",
  confirmedNote: "Reading confirmed.",
  resolveFirst: (n: number) => `Answer or remove ${n} ${plural(n, "line", "lines")} before checking.`,
  restSkipped: (n: number) => `${n} rest ${plural(n, "line", "lines")} skipped.`,
  singletonNote: (n: number) => `Detected ${n} exercises that may be one workout.`,
  singletonMerge: "Merge into one day",
  singletonSeparate: "They are separate days",

  confirmHeading: "Confirm these exercises",
  didYouMean: (lineNo: number, raw: string, best: string) => `Line ${lineNo}: "${raw}". Did you mean "${best}"?`,
  noMatch: (lineNo: number, raw: string) => `Line ${lineNo}: "${raw}". No exercise in the library matches.`,
  yes: "Yes",
  chooseDifferent: "Choose different",
  removeLine: "Remove line",
  unparsedHeading: "Could not parse",
  unparsedHelp: "These lines have no sets and reps we can read, such as 3x8-10.",
  deleteLine: "Delete",

  resultHeading: "Assessment",
  resultLoading: "Reading your program",
  resultError: "Could not read this program. Check the link and try again.",
  programSummary: (days: number, exercises: number) =>
    `${days} ${plural(days, "day", "days")}, ${exercises} ${plural(exercises, "exercise", "exercises")}`,
  backToInput: "Check another program",

  // ARCH-065 / Fix 7 and D2. What a free account does, in three lines a stranger can check against the app.
  ctaHeading: "Want to track whether this is working? Create a free account.",
  ctaLead: "A free account saves this program and lets you:",
  ctaBenefits: [
    "Edit it in the builder and watch this check update as you change it.",
    "Get a target for every lift each session, based on what you logged last time.",
    "Keep a journal of every session and a progress view, and download your data as a CSV any time.",
  ],
  ctaPrimary: "Create account and save this program",
  ctaSecondary: "Just here to check? No account needed.",
  createAccount: "Create account",
  importSave: "Save this program",
  importSaving: "Saving",
  importError: "Could not save this program. Try again.",

  rateLimited: "You've reached the limit for today. Create an account to continue checking programs.",
  landingLink: "Or check a program you already have →",

  pendingBanner: "You checked a program before signing up. Want to save it as your first program?",
  pendingSave: "Save",
  pendingDiscard: "Discard",

  aboutTitle: "About the Program Checker",
  aboutIntro:
    "This engine analyzes a training program against evidence-graded thresholds for hypertrophy. It has been tested against 24 test programs, reviewed by 5 coaches. 21 match the headline the coaches gave. 3 are documented exceptions awaiting either:",
  aboutExceptions: [
    "Severity gradation, which moves severity decisions into per-program buckets rather than one-size-fits-all",
    "Scientific input on novice training ranges",
  ],
  aboutNotJudgedHeading: "The analysis does not judge:",
  aboutNotJudged: ["Movement quality", "Whether a given lift suits you", "Medical conditions"],
  aboutPain: "If any exercise causes pain, stop and consult a professional.",
  aboutProvisional:
    "The thresholds are provisional. Every assessment carries an evidence tier. See the evidence link on any analysis for what each finding rests on.",
  aboutContinue: "Continue to the checker →",
} as const;

/** Every static string, flattened, for the copy lint. */
export function allCheckCopy(): string[] {
  const out: string[] = [];
  for (const value of Object.values(CHECK_COPY)) {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) out.push(...value);
  }
  out.push(
    CHECK_COPY.needMoreExercises(1),
    CHECK_COPY.needMoreExercises(2),
    CHECK_COPY.parsedHeading(1),
    CHECK_COPY.parsedHeading(3),
    CHECK_COPY.parsedDayLine(1, "Push", false),
    CHECK_COPY.parsedDayLine(2, "Day 2", true),
    CHECK_COPY.useCandidate("Barbell Row"),
    CHECK_COPY.resolveFirst(1),
    CHECK_COPY.resolveFirst(3),
    CHECK_COPY.restSkipped(1),
    CHECK_COPY.restSkipped(2),
    CHECK_COPY.singletonNote(3),
    CHECK_COPY.didYouMean(3, "Bench 3x8", "Barbell Bench Press"),
    CHECK_COPY.noMatch(4, "Zottman 3x8"),
    CHECK_COPY.programSummary(1, 1),
    CHECK_COPY.programSummary(3, 15),
  );
  return out;
}
