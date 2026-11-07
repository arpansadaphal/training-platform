import { describe, expect, it } from "vitest";
import { checkHint } from "../hint";
import {
  countResolved,
  mergeAllDays,
  parseRoutine,
  resolvedName,
  scheduleEntries,
  toCompactProgram,
  unresolvedLines,
} from "../routineParser";
import { LIBRARY_NAMES } from "./libraryNames";

const parse = (text: string, opts?: { mergeSingletons?: boolean }) => parseRoutine(text, LIBRARY_NAMES, opts);
const firstLine = (text: string) => parse(text).days[0]!.lines[0]!;

describe("parseRoutine: sets and reps formats", () => {
  it.each([
    ["Barbell Bench Press 3x8-10", 3, 8, 10],
    ["Barbell Bench Press 3 x 8-10", 3, 8, 10],
    ["Barbell Bench Press 3x8", 3, 8, 8],
    ["Barbell Bench Press 3 sets 8-10 reps", 3, 8, 10],
    ["BARBELL BENCH PRESS 4X6–8", 4, 6, 8],
    ["Barbell Bench Press 3 sets of 8 reps", 3, 8, 8],
    ["1. Barbell Bench Press - 3x8-10 @ RPE 8", 3, 8, 10],
    ["- Barbell Bench Press: 3×8-10", 3, 8, 10],
  ])("reads %s", (text, sets, lo, hi) => {
    const line = firstLine(text);
    expect(line).toMatchObject({ sets, repLow: lo, repHigh: hi });
    expect(line.match).toMatchObject({ status: "exact", best: "Barbell Bench Press" });
  });

  it("does not read impossible prescriptions", () => {
    for (const bad of ["Back Squat 0x8", "Back Squat 3x0", "Back Squat 3x12-8", "Back Squat 30x8", "Back Squat 3x400"]) {
      const r = parse(bad);
      expect(r.days).toHaveLength(0);
      expect(r.unparsed).toHaveLength(1);
    }
  });
});

describe("parseRoutine: day boundaries", () => {
  it("reads the Day 1 - Push / Rest paste as three days, two rest lines skipped", () => {
    const r = parse(
      ["Day 1 - Push", "Bench 3x8", "", "Rest", "", "Day 2 - Pull", "Row 3x8", "", "Rest", "", "Day 3 - Legs", "Squat 3x8"].join("\n"),
    );
    expect(r.days.map((d) => d.name)).toEqual(["Push", "Pull", "Legs"]);
    expect(r.days.every((d) => d.lines.length === 1)).toBe(true);
    expect(r.restLinesSkipped).toBe(2);
    expect(r.notes).toEqual([]);
  });

  it("keeps consecutive exercise lines as one day", () => {
    const r = parse("Back Squat 3x8\nLeg Press 3x10\nLeg Curl 3x10\nStanding Calf Raise 3x12\nLeg Extension 3x12");
    expect(r.days).toHaveLength(1);
    expect(r.days[0]).toMatchObject({ name: "Day 1", nameAuto: true });
    expect(r.days[0]!.lines).toHaveLength(5);
  });

  it("starts a new day at a blank line between exercises, and names unnamed days in order", () => {
    const r = parse("Back Squat 3x8\nLeg Press 3x10\n\nBarbell Row 3x8\nPull-Up 3x8\n\n\n\nOverhead Press 3x8\nLateral Raise 3x12");
    expect(r.days.map((d) => d.name)).toEqual(["Day 1", "Day 2", "Day 3"]);
    expect(r.days.map((d) => d.lines.length)).toEqual([2, 2, 2]);
  });

  it("ignores blank lines at the start and end", () => {
    const r = parse("\n\nBack Squat 3x8\nLeg Press 3x10\n\n\n");
    expect(r.days).toHaveLength(1);
  });

  it("treats a Rest line between exercises as a day boundary but never as a day", () => {
    const r = parse("Barbell Bench Press 3x8\nBarbell Row 3x8\nRest\nBack Squat 3x8\nRomanian Deadlift 3x8\nREST DAY\n");
    expect(r.days.map((d) => d.name)).toEqual(["Day 1", "Day 2"]);
    expect(r.restLinesSkipped).toBe(2);
  });

  it("accepts headers ending in a colon, weekday names and 'Upper A'", () => {
    const r = parse(
      ["Chest and triceps:", "Barbell Bench Press 3x8", "Monday", "Back Squat 3x8", "Upper A", "Barbell Row 3x8", "Full Body", "Pull-Up 3x8"].join("\n"),
    );
    expect(r.days.map((d) => d.name)).toEqual(["Chest and triceps", "Monday", "Upper A", "Full Body"]);
    expect(r.unparsed).toEqual([]);
  });

  it("reads 'A' and 'B' as day labels only at the end of a line, not inside prose", () => {
    const r = parse("Workout B\nBack Squat 3x8\nthis is a note\nUpper A\nBarbell Row 3x8");
    expect(r.days.map((d) => d.name)).toEqual(["Workout B", "Upper A"]);
    expect(r.unparsed.map((u) => u.raw)).toEqual(["this is a note"]);
  });

  it("does not treat an exercise missing its sets as a header", () => {
    const r = parse("Push\nBarbell Bench Press 3x8\nPull-Up\nBarbell Row 3x8");
    expect(r.days).toHaveLength(1);
    expect(r.unparsed.map((u) => u.raw)).toEqual(["Pull-Up"]);
  });

  it("a header replaces an immediately preceding header and drops empty days", () => {
    const r = parse("Day 1\nPush\nBarbell Bench Press 3x8\nPull\n");
    expect(r.days.map((d) => d.name)).toEqual(["Push"]);
  });
});

describe("parseRoutine: single-exercise sections", () => {
  const text = "Barbell Bench Press 3x8\n\nBarbell Row 3x8\n\nBack Squat 3x8";

  it("folds blank-line-only singletons into one day and says so", () => {
    const r = parse(text);
    expect(r.days).toHaveLength(1);
    expect(r.days[0]!.lines).toHaveLength(3);
    expect(r.notes).toEqual([{ kind: "SINGLETON_MERGE", exerciseCount: 3 }]);
  });

  it("keeps them separate when the user says they are separate days", () => {
    const r = parse(text, { mergeSingletons: false });
    expect(r.days).toHaveLength(3);
    expect(r.notes).toEqual([]);
  });

  it("leaves a single-exercise day beside a longer day alone", () => {
    const r = parse("Barbell Bench Press 3x8\n\nBarbell Row 3x8\nPull-Up 3x8");
    expect(r.days.map((d) => d.lines.length)).toEqual([1, 2]);
    expect(r.notes).toEqual([]);
  });
});

describe("parseRoutine: matching, unparsed lines and resolutions", () => {
  // AUDIT TRAIL (ARCH-065 / Fix 5a). This fixture used a bare "Bench 3x8" as its ambiguous line. A bare Bench, Squat, Row or
  // Deadlift is now accepted as the standard barbell lift ("unique"), so the ambiguous line is "Curl 3x8" (barbell,
  // dumbbell or cable is a real choice). What the tests guard is unchanged: which lines need an answer, what an answer
  // does to the counts, and what is compacted.
  const text = ["Push", "Curl 3x8", "Overhead Press 3x8", "Zottman Spin 3x8", "Barbel Row 3x8", "this is a note", "RDL 3x8"].join("\n");

  it("mixes valid, ambiguous, unmatched and unreadable lines", () => {
    const r = parse(text);
    expect(r.days).toHaveLength(1);
    const byQuery = Object.fromEntries(r.days[0]!.lines.map((l) => [l.query, l.match.status]));
    expect(byQuery).toMatchObject({
      Curl: "ambiguous",
      "Overhead Press": "exact",
      "Zottman Spin": "none",
      "Barbel Row": "suggested",
      RDL: "exact",
    });
    // The reason field was added with the real-paste work (ARCH-066); the line itself is unchanged.
    expect(r.unparsed).toEqual([{ lineNo: 6, raw: "this is a note", reason: "NO_SETS_REPS" }]);
  });

  it("counts only accepted or answered lines, and compacts them", () => {
    const r = parse(text);
    expect(countResolved(r, {})).toBe(2);
    expect(unresolvedLines(r, {}).map((l) => l.query)).toEqual(["Curl", "Zottman Spin", "Barbel Row"]);
    const answers = { 2: "Dumbbell Curl", 5: "Barbell Row" };
    expect(countResolved(r, answers)).toBe(4);
    expect(toCompactProgram(r, answers).days[0]!.rows.map((row) => row[0])).toEqual([
      "Dumbbell Curl",
      "Overhead Press",
      "Barbell Row",
      "Romanian Deadlift",
    ]);
    expect(resolvedName(r.days[0]!.lines[2]!, answers)).toBeNull();
  });

  it("accepts bare Bench, Squat and Row without a question, and shows the full name (ARCH-065 / Fix 5a)", () => {
    const r = parse("Push\nBench 3x8\nSquat 3x8\nRow 3x8");
    expect(unresolvedLines(r, {})).toHaveLength(0);
    expect(countResolved(r, {})).toBe(3);
    expect(r.days[0]!.lines.map((l) => resolvedName(l, {}))).toEqual(["Barbell Bench Press", "Back Squat", "Barbell Row"]);
  });

  it("asks only about the line that is a real choice: Incline on a chest day offers the presses first", () => {
    const r = parse("Chest\nBench 4x8\nIncline 3x8\n\nBack\nRow 4x8\n\nLegs\nSquat 4x8");
    const open = unresolvedLines(r, {});
    expect(open.map((l) => l.query)).toEqual(["Incline"]);
    expect(open[0]!.match.best).toBe("Incline Dumbbell Press");
  });

  it("merge-all puts every exercise in one day", () => {
    const r = mergeAllDays(parse("Push\nBarbell Bench Press 3x8\n\nPull\nBarbell Row 3x8\n\nLegs\nBack Squat 3x8"));
    expect(r.days).toHaveLength(1);
    expect(r.days[0]!.lines).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// ARCH-066: real pastes. A stranger pasted a ChatGPT-formatted 5-day program and every one of its exercise lines was
// rejected, because the parser only knew "Bench 3x8-10". These tests pin the formats that real users paste.
// ---------------------------------------------------------------------------------------------------------------------

// A RECONSTRUCTION, not the founder's literal paste (it was not saved anywhere in the repo). It follows the brief:
// five days with 7 / 6 / rest / 7 / 6 exercises, every line the brief quotes, bullets, x-sign, en-dashes, "or",
// parentheses, a time-based line, and a rest day with a walking line under it.
const CHATGPT_PASTE = `Day 1: Upper Body A
• Barbell Bench Press: 4 sets × 6–8 reps (2 mins rest)
• Lat Pulldown or Pull-Ups: 4 sets × 8–10 reps
• Dumbbell Shoulder Press: 3 sets × 8–10 reps
• Seated Cable Row: 3 sets × 10–12 reps
• Lateral Raise: 3 sets × 12–15 reps
• Tricep Pushdown: 3 sets × 10–12 reps
• Dumbbell Curl: 3 sets × 10–12 reps

Day 2: Lower Body A
• Back Squat: 4 sets × 6–8 reps (2 mins rest)
• Romanian Deadlift: 3 sets × 8–10 reps
• Bulgarian Split Squats: 3 sets × 8–10 reps per leg
• Leg Curl: 3 sets × 10–12 reps
• Standing Calf Raise: 4 sets × 12–15 reps
• Plank or Cable Crunches (Core): 3 sets × 30–45s / 12–15 reps

Day 3: Rest / Active Recovery
• 20–30 minutes of light walking or mobility/stretching work.

Day 4: Upper Body B
• Overhead Press: 4 sets × 6–8 reps
• Barbell Row: 4 sets × 6–8 reps
• Incline Dumbbell Press: 3 sets × 8–10 reps
• Chest-Supported Row: 3 sets × 8–10 reps
• Face Pull: 3 sets × 12–15 reps
• Overhead Tricep Extension: 3 sets × 10–12 reps
• Hammer Curl: 3 sets × 10–12 reps

Day 5: Lower Body B
• Deadlift (Conventional or Sumo): 3 sets × 5 reps
• Leg Press: 3 sets × 10–12 reps
• Hip Thrust: 3 sets × 8–10 reps
• Seated Leg Curl: 3 sets × 10–12 reps
• Seated Calf Raise: 4 sets × 12–15 reps
• Hanging Leg Raise: 3 sets × 12–15 reps
`;

describe("parseRoutine: a ChatGPT-formatted program (ARCH-066)", () => {
  const r = parse(CHATGPT_PASTE);

  it("reads 26 exercises across 4 training days, skips the rest day, leaves nothing unparsed", () => {
    expect(r.days.map((d) => d.lines.length)).toEqual([7, 6, 7, 6]);
    expect(r.days.map((d) => d.name)).toEqual(["Upper Body A", "Lower Body A", "Upper Body B", "Lower Body B"]);
    expect(r.days.map((d) => d.label)).toEqual(["Day 1", "Day 2", "Day 4", "Day 5"]);
    expect(r.days.flatMap((d) => d.lines)).toHaveLength(26);
    expect(r.restLinesSkipped).toBe(1);
    expect(r.unparsed).toEqual([]);
    expect(r.notes).toEqual([]);
  });

  it("recognises all 26 without asking a question", () => {
    expect(unresolvedLines(r, {})).toEqual([]);
    expect(countResolved(r, {})).toBe(26);
    expect(checkHint({ minExercises: 3, resolved: 26, unresolved: 0, unparsed: 0, confirmed: false })).toMatch(/Confirm/);
  });

  it("keeps the rest day out of the program but in the schedule, with the walking line set aside, not dropped", () => {
    expect(toCompactProgram(r, {}).days).toHaveLength(4);
    expect(r.restDays).toEqual([{ lineNo: 18, label: "Day 3" }]);
    expect(r.skipped).toEqual([
      { lineNo: 19, raw: "• 20–30 minutes of light walking or mobility/stretching work.", reason: "REST_DAY_CONTENT" },
    ]);
    expect(scheduleEntries(r).map((e) => (e.kind === "rest" ? `${e.label}: Rest` : e.day.label))).toEqual([
      "Day 1",
      "Day 2",
      "Day 3: Rest",
      "Day 4",
      "Day 5",
    ]);
  });

  it("reads the quoted lines as the brief says", () => {
    const lines = r.days.flatMap((d) => d.lines);
    const byRaw = (fragment: string) => lines.find((l) => l.raw.includes(fragment))!;
    expect(byRaw("Barbell Bench Press")).toMatchObject({ sets: 4, repLow: 6, repHigh: 8 });
    expect(resolvedName(byRaw("Bulgarian"), {})).toBe("Bulgarian Split Squat");
    expect(byRaw("Bulgarian")).toMatchObject({ sets: 3, repLow: 8, repHigh: 10 });
    expect(byRaw("Deadlift (Conventional")).toMatchObject({ sets: 3, repLow: 5, repHigh: 5 });
  });

  it("tells the lifter what it chose where the paste offered a choice, and about the time-based line", () => {
    expect(r.lineNotes).toEqual([
      { kind: "ALTERNATIVE", lineNo: 3, query: "Lat Pulldown or Pull-Ups", chosen: "Lat Pulldown", others: ["Pull-Up"], unmatched: [] },
      { kind: "ALTERNATIVE", lineNo: 16, query: "Plank or Cable Crunches", chosen: "Plank", others: ["Cable Crunch"], unmatched: [] },
      { kind: "TIME_USES_REPS", lineNo: 16, repLow: 12, repHigh: 15 },
      {
        kind: "ALTERNATIVE",
        lineNo: 31,
        query: "Deadlift (Conventional or Sumo)",
        chosen: "Conventional Deadlift",
        others: ["Sumo Deadlift"],
        unmatched: [],
      },
    ]);
  });
});

describe("parseRoutine: bullets and markers (ARCH-066)", () => {
  it.each(["•", "-", "*", "·", "▸", "►", "–", "—", "◦", "- •", "•-", "1.", "1)", "**", "###"])(
    "reads a line behind %s exactly like the bare line",
    (marker) => {
      const bare = firstLine("Barbell Bench Press: 4 sets × 6–8 reps");
      const marked = firstLine(`${marker} Barbell Bench Press: 4 sets × 6–8 reps`);
      expect(marked).toMatchObject({ sets: 4, repLow: 6, repHigh: 8, query: bare.query });
      expect(marked.match).toEqual(bare.match);
    },
  );

  it("needs no space after the bullet, and reads markdown bold around the name", () => {
    expect(firstLine("•Barbell Bench Press 3x8")).toMatchObject({ sets: 3, repLow: 8 });
    expect(firstLine("- **Barbell Bench Press**: 3 sets × 8–10 reps")).toMatchObject({
      sets: 3,
      repLow: 8,
      repHigh: 10,
      query: "Barbell Bench Press",
    });
  });

  it("a bulleted exercise is never mistaken for a day heading (Back Squat contains 'back')", () => {
    const r = parse("• Back Squat: 4 sets × 6–8 reps\n• Leg Press: 3 sets × 10–12 reps\n• Leg Curl: 3 sets × 10 reps");
    expect(r.days).toHaveLength(1);
    expect(r.days[0]!.lines.map((l) => l.query)).toEqual(["Back Squat", "Leg Press", "Leg Curl"]);
    expect(r.unparsed).toEqual([]);
  });
});

describe("parseRoutine: set and rep notations (ARCH-066)", () => {
  it.each([
    ["4 sets × 6–8 reps", 4, 6, 8],
    ["4 sets x 6-8 reps", 4, 6, 8],
    ["4 sets of 6–8 reps", 4, 6, 8],
    ["4 × 6–8", 4, 6, 8],
    ["4 sets × 5 reps", 4, 5, 5],
    ["4 sets × 15 reps", 4, 15, 15],
    ["4 sets of 5", 4, 5, 5],
    ["4x6 to 8", 4, 6, 8],
    ["4 sets×6–8", 4, 6, 8],
    ["4 SETS X 6—8 REPS", 4, 6, 8],
  ])("reads Barbell Bench Press: %s", (prescription, sets, lo, hi) => {
    const line = firstLine(`Barbell Bench Press: ${prescription}`);
    expect(line).toMatchObject({ sets, repLow: lo, repHigh: hi });
    expect(line.match).toMatchObject({ status: "exact", best: "Barbell Bench Press" });
  });

  it("reads an en-dash range the same as a hyphen range", () => {
    const en = firstLine("Barbell Row 3 sets × 6–8 reps");
    const hy = firstLine("Barbell Row 3 sets × 6-8 reps");
    expect(en).toMatchObject({ sets: 3, repLow: 6, repHigh: 8 });
    expect({ ...en, raw: "", lineNo: 0 }).toEqual({ ...hy, raw: "", lineNo: 0 });
  });

  it("still rejects sets or reps that cannot be real, and says why", () => {
    const r = parse("Back Squat: 40 sets × 8 reps");
    expect(r.days).toHaveLength(0);
    expect(r.unparsed).toEqual([{ lineNo: 1, raw: "Back Squat: 40 sets × 8 reps", reason: "SETS_REPS_OUT_OF_RANGE" }]);
  });
});

describe("parseRoutine: exercise names (ARCH-066)", () => {
  it("takes the name before the colon", () => {
    expect(firstLine("Barbell Bench Press: 4 sets × 6–8 reps").query).toBe("Barbell Bench Press");
  });

  it('resolves "A or B" to the first match, offers the other, and says so', () => {
    const r = parse("Lat Pulldown or Pull-Ups: 4 sets × 8–10 reps");
    const line = r.days[0]!.lines[0]!;
    expect(resolvedName(line, {})).toBe("Lat Pulldown");
    expect(line.match.candidates).toEqual(["Lat Pulldown", "Pull-Up"]);
    expect(r.lineNotes).toEqual([
      { kind: "ALTERNATIVE", lineNo: 1, query: "Lat Pulldown or Pull-Ups", chosen: "Lat Pulldown", others: ["Pull-Up"], unmatched: [] },
    ]);
    // The lifter can take the other one, and the answer wins.
    expect(resolvedName(line, { 1: "Pull-Up" })).toBe("Pull-Up");
  });

  it('uses the one alternative the library has, and says the other is not in it', () => {
    const r = parse("Barbell Row or Zottman Spin: 3 sets × 8 reps");
    expect(resolvedName(r.days[0]!.lines[0]!, {})).toBe("Barbell Row");
    expect(r.lineNotes).toMatchObject([{ kind: "ALTERNATIVE", chosen: "Barbell Row", others: [], unmatched: ["Zottman Spin"] }]);
  });

  it('asks when neither alternative is recognised, offering what each came close to', () => {
    const r = parse("Zottman Spin or Spider Curl Thing: 3 sets × 8 reps");
    const line = r.days[0]!.lines[0]!;
    expect(resolvedName(line, {})).toBeNull();
    expect(unresolvedLines(r, {})).toHaveLength(1);
  });

  it("reads an 'or' inside a parenthesis as variants of the name before it", () => {
    const r = parse("Deadlift (Conventional or Sumo): 3 sets × 5 reps\nSquat (Back or Front) 3x5\nBench Press (Barbell or Dumbbell) 3x8");
    const lines = r.days[0]!.lines;
    expect(lines.map((l) => resolvedName(l, {}))).toEqual(["Conventional Deadlift", "Back Squat", "Barbell Bench Press"]);
    expect(lines[0]!.match.candidates).toEqual(["Conventional Deadlift", "Sumo Deadlift"]);
  });

  it("reads a single parenthesis as a modifier before falling back to the bare name", () => {
    const r = parse("Squat (Front) 3x5");
    expect(resolvedName(r.days[0]!.lines[0]!, {})).toBe("Front Squat");
  });

  it.each([
    ["Barbell Bench Press (2 mins rest): 4 sets × 6–8 reps", "Barbell Bench Press"],
    ["Bulgarian Split Squats (per leg): 3 sets × 8–10 reps", "Bulgarian Split Squat"],
    ["Plank (Core): 3 sets × 12–15 reps", "Plank"],
    ["Dumbbell Curl (each): 3 sets × 10 reps", "Dumbbell Curl"],
    ["Dumbbell Curl (each side): 3 sets × 10 reps", "Dumbbell Curl"],
    ["Back Squat (heavy): 3 sets × 5 reps", "Back Squat"],
    ["Leg Curl (light): 3 sets × 12 reps", "Leg Curl"],
    ["Hanging Leg Raise (AMRAP) 3x10", "Hanging Leg Raise"],
    ["Bulgarian Split Squats per leg: 3 sets × 8–10 reps", "Bulgarian Split Squat"],
    ["Dumbbell Curl 3 sets × 10 reps (each)", "Dumbbell Curl"],
    ["Seated Cable Row: 3 sets × 8–10 reps per side (2 mins rest)", "Seated Cable Row"],
  ])("strips the qualifier before matching: %s", (text, expected) => {
    const line = firstLine(text);
    expect(resolvedName(line, {})).toBe(expected);
    expect(line.query).not.toMatch(/\(|rest|per leg|per side|each|\bcore\b|heavy|light|amrap/i);
  });

  it("matches plural names: Pull-Ups, Cable Crunches, Bulgarian Split Squats", () => {
    expect(resolvedName(firstLine("Pull-Ups 3x8"), {})).toBe("Pull-Up");
    expect(resolvedName(firstLine("Cable Crunches 3x12"), {})).toBe("Cable Crunch");
    expect(resolvedName(firstLine("Bulgarian Split Squats 3x8"), {})).toBe("Bulgarian Split Squat");
  });
});

describe("parseRoutine: time-based exercises (ARCH-066)", () => {
  it("uses the reps when the line gives both, and says so", () => {
    const r = parse("Plank: 3 sets × 30–45s / 12–15 reps");
    expect(r.days[0]!.lines[0]).toMatchObject({ sets: 3, repLow: 12, repHigh: 15 });
    expect(r.days[0]!.lines[0]!.timeOnly).toBeUndefined();
    expect(r.lineNotes).toEqual([{ kind: "TIME_USES_REPS", lineNo: 1, repLow: 12, repHigh: 15 }]);
  });

  it("lists a time-only line but keeps it out of the analysis and out of the exercise count", () => {
    const r = parse("Plank: 3 sets × 30–45s\nBarbell Bench Press 3x8");
    const plank = r.days[0]!.lines[0]!;
    expect(plank).toMatchObject({ sets: 3, timeOnly: true, timeText: "30–45s", repLow: 0, repHigh: 0 });
    expect(r.unparsed).toEqual([]);
    expect(r.lineNotes).toEqual([{ kind: "TIME_ONLY", lineNo: 1, timeText: "30–45s" }]);
    expect(countResolved(r, {})).toBe(1);
    expect(unresolvedLines(r, {})).toEqual([]);
    expect(toCompactProgram(r, {}).days[0]!.rows.map((row) => row[0])).toEqual(["Barbell Bench Press"]);
  });

  it.each(["Plank: 3 x 45 sec", "Plank: 3 sets of 45 seconds", "Plank: 3 sets × 1 min"])("reads %s as timed", (text) => {
    expect(parse(text).days[0]!.lines[0]).toMatchObject({ sets: 3, timeOnly: true });
  });

  it("does not mistake a rep line for a time line", () => {
    expect(firstLine("Seated Cable Row 3 x 8 seated")).toMatchObject({ repLow: 8, repHigh: 8 });
    expect(firstLine("Plank 3 sets × 12 reps").timeOnly).toBeUndefined();
  });
});

describe("parseRoutine: rest days (ARCH-066)", () => {
  const paste = "Day 1: Push\nBarbell Bench Press 3x8\n\nDay 2: Rest / Active Recovery\n• 20–30 minutes of light walking or mobility/stretching work.\n\nDay 3: Pull\nBarbell Row 3x8";

  it("a rest day with content is a rest day: not parsed, not a day, not unparseable", () => {
    const r = parse(paste);
    expect(r.days.map((d) => [d.label, d.name])).toEqual([["Day 1", "Push"], ["Day 3", "Pull"]]);
    expect(r.restLinesSkipped).toBe(1);
    expect(r.unparsed).toEqual([]);
    expect(r.skipped).toHaveLength(1);
  });

  it.each(["Day 3: Rest", "Day 3 - Rest day", "Day 3: Off", "Day 3: Active Recovery", "Wednesday: Rest", "### Day 3: Rest / Active Recovery"])(
    "reads %s as a rest day",
    (heading) => {
      const r = parse(`Push\nBarbell Bench Press 3x8\n${heading}\nPull\nBarbell Row 3x8`);
      expect(r.restLinesSkipped).toBe(1);
      expect(r.restDays).toHaveLength(1);
      expect(r.days).toHaveLength(2);
    },
  );

  it("does not swallow an exercise written under a rest heading", () => {
    const r = parse("Day 1: Push\nBarbell Bench Press 3x8\nDay 2: Rest\nBarbell Row 3x8");
    expect(r.days.flatMap((d) => d.lines.map((l) => l.query))).toEqual(["Barbell Bench Press", "Barbell Row"]);
  });

  it("a blank line ends the rest day: later prose is reported, not swallowed", () => {
    const r = parse("Day 2: Rest\n• Walk\n\nThis is some other text");
    expect(r.skipped.map((s) => s.raw)).toEqual(["• Walk"]);
    expect(r.unparsed.map((u) => u.raw)).toEqual(["This is some other text"]);
  });

  it("sets aside a standalone duration line, visibly", () => {
    const r = parse("Push\nBarbell Bench Press 3x8\n10 minutes of easy cardio\nBarbell Row 3x8");
    expect(r.skipped).toEqual([{ lineNo: 3, raw: "10 minutes of easy cardio", reason: "DURATION" }]);
    expect(r.unparsed).toEqual([]);
    expect(r.days).toHaveLength(1);
  });

  it("a plain Rest line is counted but not listed as a named rest day", () => {
    const r = parse("Day 1 - Push\nBench 3x8\n\nRest\n\nDay 2 - Pull\nRow 3x8");
    expect(r.restLinesSkipped).toBe(1);
    expect(r.restDays).toEqual([]);
  });
});

describe("parseRoutine: lines that cannot be read are shown, with a reason (ARCH-066)", () => {
  it("shows a line with no sets and reps, not silently skipped", () => {
    const r = parse("Push\nBarbell Bench Press 3x8\nRandom text without sets\nBarbell Row 3x8");
    expect(r.unparsed).toEqual([{ lineNo: 3, raw: "Random text without sets", reason: "NO_SETS_REPS" }]);
    expect(r.days[0]!.lines).toHaveLength(2);
  });

  it("keeps a line whose exercise is not in the library, to be asked about", () => {
    const r = parse("Zottman Spin: 3 sets × 8 reps");
    expect(r.days[0]!.lines[0]!.match.status).toBe("none");
    expect(unresolvedLines(r, {})).toHaveLength(1);
  });
});

describe("parseRoutine: found by probing other real pastes (ARCH-066)", () => {
  it("never turns an unreadable exercise line into a day heading that swallows it", () => {
    // "Push-Ups" contains the day word "push" and is short. It used to vanish as an empty heading.
    for (const text of ["Push-Ups: 3 sets to failure", "Push-Ups: 3 sets × AMRAP", "Pull-Ups or Chin-Ups: 3 sets × AMRAP"]) {
      const r = parse(`Barbell Bench Press 3x8\n${text}`);
      expect(r.unparsed.map((u) => u.raw)).toEqual([text]);
      expect(r.unparsed[0]!.reason).toBe("NO_SETS_REPS");
    }
  });

  it("reads a long 'Day N' heading as a heading, however long its description", () => {
    const r = parse("Day 1 – Push (Chest, Shoulders, Triceps)\nBarbell Bench Press 3x8\nDay 2 – Pull (Back and Biceps)\nBarbell Row 3x8");
    expect(r.days.map((d) => [d.label, d.name])).toEqual([
      ["Day 1", "Push (Chest, Shoulders, Triceps)"],
      ["Day 2", "Pull (Back and Biceps)"],
    ]);
    expect(r.unparsed).toEqual([]);
  });

  it("reads 'sets, reps' with a comma", () => {
    expect(firstLine("Barbell Bench Press: 4 sets, 8-10 reps")).toMatchObject({ sets: 4, repLow: 8, repHigh: 10 });
  });
});

describe("parseRoutine: the old formats read as before (ARCH-066)", () => {
  it("reads Bench 3x8-10 and Squat 3 sets 8-10 reps to the same prescriptions and matches as the old parser did", () => {
    const bench = firstLine("Bench 3x8-10");
    expect(bench).toMatchObject({ query: "Bench", sets: 3, repLow: 8, repHigh: 10 });
    expect(bench.match).toEqual({ status: "unique", best: "Barbell Bench Press", candidates: ["Barbell Bench Press"] });
    const squat = firstLine("Squat 3 sets 8-10 reps");
    expect(squat).toMatchObject({ query: "Squat", sets: 3, repLow: 8, repHigh: 10 });
    expect(squat.match).toEqual({ status: "unique", best: "Back Squat", candidates: ["Back Squat"] });
  });

  it("adds no notes, skipped lines or rest days to a program that never needed them", () => {
    const r = parse("Push\nBench 3x8-10\nOverhead Press 3x8-10\n\nPull\nBarbell Row 3x8-10\nPull-Up 3x6-10");
    expect(r.days.map((d) => d.lines.length)).toEqual([2, 2]);
    expect(r.lineNotes).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(r.restDays).toEqual([]);
    expect(r.unparsed).toEqual([]);
  });
});

describe("checkHint: the line under the disabled button (ARCH-066)", () => {
  const base = { minExercises: 3, resolved: 0, unresolved: 0, unparsed: 0, confirmed: false };

  it("never says 'Add 3 more' when nothing is recognised, even when many lines were pasted", () => {
    expect(checkHint({ ...base, unparsed: 25 })).toBe("0 exercises recognized. 25 lines could not be read: see the lines below.");
    expect(checkHint({ ...base })).toBe("0 exercises recognized. Check how each line gives its sets and reps.");
    expect(checkHint({ ...base, unparsed: 1 })).toMatch(/^0 exercises recognized\. 1 line could not/);
  });

  it("says 'Add N more' only when 1 or 2 are recognised", () => {
    expect(checkHint({ ...base, resolved: 1 })).toBe("Add 2 more recognized exercises to check a program.");
    expect(checkHint({ ...base, resolved: 2 })).toBe("Add 1 more recognized exercise to check a program.");
  });

  it("asks for the open answers first when lines are waiting on one", () => {
    expect(checkHint({ ...base, unresolved: 4 })).toBe("Answer or remove 4 lines before checking.");
    expect(checkHint({ ...base, resolved: 5, unresolved: 1 })).toBe("Answer or remove 1 line before checking.");
  });

  it("then asks to confirm, then says nothing", () => {
    expect(checkHint({ ...base, resolved: 5 })).toBe("Confirm the reading above to continue.");
    expect(checkHint({ ...base, resolved: 5, confirmed: true })).toBeNull();
  });

  it("zero recognised from the founder's paste is not a thing anymore: the same paste now recognises 26", () => {
    const r = parse(CHATGPT_PASTE);
    expect(countResolved(r, {})).toBe(26);
  });
});
