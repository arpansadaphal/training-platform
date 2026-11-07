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
  // ARCH-065 / Fix 6. Says what the visitor gets, then that it is free; "provisional" stays, in plain words.
  intro:
    "Paste your routine to see how many hard sets each muscle gets, what is missing, and what to add first. It is free and needs no account. The read is provisional.",
  // ARCH-067 / Fix 2. A static example of what an assessment reads like, above the paste box. It mirrors the real card
  // wording (labels.ts, ratioLines.ts); copy.test.ts holds the numbers to the profile's bands and the real ratio line.
  previewHeading: "Here's what an assessment looks like:",
  previewTag: "Example",
  previewCards: [
    { label: "Weekly volume · Chest", status: "Adequate", detail: "14 hard sets / week" },
    { label: "Exercise selection", status: "Balanced", detail: "6 of 6 main movement patterns" },
  ],
  previewBalanceHeading: "Cross-muscle balance",
  previewBalance: "You press 12 hard sets a week and pull 10 hard sets a week (1.2 to 1).",
  tabPaste: "Paste a routine",
  tabPick: "Pick a common split",
  pasteLabel: "Your routine",
  pastePlaceholder:
    "Push\nBarbell Bench Press 3x8-10\nOverhead Press 3x8-10\n\nPull\nBarbell Row 3x8-10\nPull-Up 3x6-10\n\nLegs\nBack Squat 3x8-10\nRomanian Deadlift 3x8-10",
  assumptionsNote:
    "We assume RPE 8 and bodyweight load for pasted programs. The analysis is about your program structure, not your specific weights.",
  layoutHint: "Start a new day with a heading such as Push or Day 2, or leave a blank line between days.",
  // ARCH-067. The days a week the lifter trains is asked below, so a rotation is pasted once and the number says how often.
  rotationHint: "List one week of days. To run a 3-day rotation twice a week, paste the 3 days and choose 6 below.",
  // ARCH-067. How many days a week the lifter trains; it defaults to the days parsed from the routine.
  daysLabel: "How many days a week do you train?",
  daysHelp: "Default: the days in your routine.",
  daysAsListed: "As the split lists it",
  daysOption: (n: number) => `${n} ${plural(n, "day", "days")}`,
  tooLarge: "That routine is larger than the checker reads: up to 7 days and 15 exercises a day.",
  aboutLink: "How the checker works",
  useCandidate: (name: string) => `Use ${name}`,
  readRoutine: "Read my routine",
  checkProgram: "Check my program",
  needMoreExercises: (n: number) =>
    `Add ${n} more recognized ${plural(n, "exercise", "exercises")} to check a program.`,
  // ARCH-067 / Fix 3. The sign-up page says what the account is before it asks for an email. A visitor who did not
  // come from the checker has no program to save, so that heading is the generic one.
  signupHeadingSave: "Save your program.",
  signupHeadingSaveCount: (exercises: number) => `Save your ${exercises}-exercise program.`,
  signupHeadingGeneric: "Create your account.",
  signupLead:
    "Track your training in one place. See what's working and what's not. Free to use, no credit card, export anytime.",
  signupBullets: [
    "Get a target weight and reps for every lift, every session",
    "See your progress — charts, personal records, first-vs-now",
    "Adjust your program as you go, without starting over",
  ],
  signupHaveAccount: "Already have an account?",
  signupSignIn: "Sign in →",
  backToChecker: "Back to the checker",
  pickIntro: "Each split loads straight into the assessment.",

  parsedHeading: (days: number) => `Parsed as ${days} ${plural(days, "day", "days")}`,
  // Named rest days ("Day 3: Rest") are listed so the days add up to what was pasted; they are not analysed.
  parsedHeadingWithRest: (training: number, rest: number) =>
    `Parsed ${training + rest} days (${training} training, ${rest} rest)`,
  // `label` is the day number the lifter wrote ("Day 4"), kept when a rest day sits before it; else the position.
  parsedDayLine: (index: number, name: string, nameAuto: boolean, label: string | null = null) => {
    const day = label ?? `Day ${index}`;
    return nameAuto ? day : `${day} (${name})`;
  },
  restDayLine: (label: string) => `${label}: Rest`,
  exerciseCount: (n: number) => `${n} ${plural(n, "exercise", "exercises")}`,
  totalLine: (exercises: number, days: number) =>
    `Total: ${exercises} ${plural(exercises, "exercise", "exercises")} across ${days} training ${plural(days, "day", "days")}`,
  notesHeading: "Notes",
  noteAlternative: (query: string, chosen: string, others: readonly string[], unmatched: readonly string[]) =>
    others.length > 0
      ? `${query} → ${chosen} (confirm if you meant ${others.join(" or ")})`
      : `${query} → ${chosen} (${unmatched.join(" and ")} not in the library)`,
  noteTimeUsesReps: (name: string, low: number, high: number) =>
    `${name} (time-based) → using ${low === high ? low : `${low}–${high}`} reps for analysis`,
  noteTimeOnly: (name: string, time: string) =>
    `${name}: ${time} is time-based, so it is listed but not included in the analysis`,
  skippedLines: (n: number) =>
    `${n} non-exercise ${plural(n, "line", "lines")} skipped (walking, cardio or notes under a rest day).`,
  mergeAll: "Merge all into one day",
  editManually: "Edit manually",
  splitAgain: "Split into days again",
  // The single gate: "Check my program" unlocks when every question is answered. Plain matches are accepted without one.
  resolveFirst: (n: number) => `Answer ${n} ${plural(n, "question", "questions")} to continue.`,
  // Shown beside a line the matcher accepted from a longer or looser name ("Lying Leg Curls" -> Leg Curl).
  acceptedFrom: (typed: string) => `from "${typed}"`,
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
  unparsedHelp:
    "These lines look like exercises but have no sets and reps we can read, such as 3x8-10 or 4 sets × 6–8 reps.",
  unparsedReason: {
    NO_SETS_REPS: "no sets×reps found",
    SETS_REPS_OUT_OF_RANGE: "sets or reps out of range",
  },
  // Shown instead of "Add 3 more" when nothing at all was recognised. (Not "check the format": the copy lint bans
  // words starting "form" as cause attribution, and "format" trips it.)
  noneRecognized: (unparsed: number) =>
    unparsed > 0
      ? `0 exercises recognized. ${unparsed} ${plural(unparsed, "line", "lines")} could not be read: see the lines below.`
      : "0 exercises recognized. Check how each line gives its sets and reps.",
  deleteLine: "Delete",

  resultHeading: "Assessment",
  resultLoading: "Reading your program",
  resultError: "Could not read this program. Check the link and try again.",
  programSummary: (days: number, exercises: number) =>
    `${days} ${plural(days, "day", "days")}, ${exercises} ${plural(exercises, "exercise", "exercises")}`,
  // ARCH-067. Shown only when the lifter trains a different number of days than the routine lists.
  daysAssessedAs: (listed: number, perWeek: number) =>
    `${listed} ${plural(listed, "day", "days")} listed, assessed as ${perWeek} ${plural(perWeek, "day", "days")} a week`,
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
  ctaFreeNote: "Free — save your program and check it again after edits.",
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
  // ARCH-065 / Fix 6. What it does, in lifter words, before how it was checked. ARCH-067 / Fix 4: the claim about
  // the coaches is replaced by what the repo supports. The 24 expected headlines are mostly predictions written by
  // the audit author; a real five-coach review covered 6 of the 25 programs (B and the five goal-dependent ones). So
  // About says "our prediction of what a strength coach would say", not that coaches reviewed the analysis.
  aboutWhat:
    "The Program Checker counts the hard sets each muscle gets in a week, checks which movement patterns your program covers, and compares both with evidence-graded thresholds for muscle growth. The same program always gets the same answer.",
  aboutIntro:
    "Tested against 24 sample programs. 21 match our prediction of what a strength coach would say; 3 are documented exceptions awaiting real coach input.",
  // No address yet (founder, 2026-11-08): the invitation stands without a link until there is a feedback route.
  aboutReview:
    "Real coach review is ongoing. If you've seen a different analysis from a strength coach, we want to hear about it.",
  aboutNotJudgedHeading: "The analysis does not judge:",
  aboutNotJudged: ["Movement quality", "Whether a given lift suits you", "Medical conditions"],
  aboutPain: "If any exercise causes pain, stop and consult a professional.",
  // The banner on every assessment already says no expert has signed the thresholds off; About says it once, briefly.
  aboutProvisional: "The engine's thresholds are provisional — see evidence on any analysis.",
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
    ...CHECK_COPY.previewCards.flatMap((c) => [c.label, c.status, c.detail]),
    ...Object.values(CHECK_COPY.unparsedReason),
    CHECK_COPY.needMoreExercises(1),
    CHECK_COPY.needMoreExercises(2),
    CHECK_COPY.noneRecognized(0),
    CHECK_COPY.noneRecognized(1),
    CHECK_COPY.noneRecognized(25),
    CHECK_COPY.parsedHeading(1),
    CHECK_COPY.parsedHeading(3),
    CHECK_COPY.parsedHeadingWithRest(4, 1),
    CHECK_COPY.parsedDayLine(1, "Push", false),
    CHECK_COPY.parsedDayLine(2, "Day 2", true),
    CHECK_COPY.parsedDayLine(3, "Upper Body B", false, "Day 4"),
    CHECK_COPY.restDayLine("Day 3"),
    CHECK_COPY.exerciseCount(1),
    CHECK_COPY.exerciseCount(7),
    CHECK_COPY.totalLine(26, 4),
    CHECK_COPY.totalLine(1, 1),
    CHECK_COPY.noteAlternative("Lat Pulldown or Pull-Ups", "Lat Pulldown", ["Pull-Up"], []),
    CHECK_COPY.noteAlternative("Dumbbell or Barbell Curl", "Barbell Curl", [], ["Dumbbell"]),
    CHECK_COPY.noteTimeUsesReps("Plank", 12, 15),
    CHECK_COPY.noteTimeOnly("Plank", "30–45s"),
    CHECK_COPY.skippedLines(1),
    CHECK_COPY.skippedLines(2),
    CHECK_COPY.useCandidate("Barbell Row"),
    CHECK_COPY.resolveFirst(1),
    CHECK_COPY.resolveFirst(3),
    CHECK_COPY.acceptedFrom("Lying Leg Curls"),
    CHECK_COPY.restSkipped(1),
    CHECK_COPY.restSkipped(2),
    CHECK_COPY.singletonNote(3),
    CHECK_COPY.didYouMean(3, "Bench 3x8", "Barbell Bench Press"),
    CHECK_COPY.noMatch(4, "Zottman 3x8"),
    CHECK_COPY.programSummary(1, 1),
    CHECK_COPY.programSummary(3, 15),
    CHECK_COPY.signupHeadingSaveCount(26),
    CHECK_COPY.signupHeadingSaveCount(1),
    CHECK_COPY.daysOption(1),
    CHECK_COPY.daysOption(6),
    CHECK_COPY.daysAssessedAs(3, 6),
    CHECK_COPY.daysAssessedAs(1, 2),
  );
  return out;
}
