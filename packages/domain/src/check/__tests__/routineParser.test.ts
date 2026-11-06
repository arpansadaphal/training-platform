import { describe, expect, it } from "vitest";
import {
  countResolved,
  mergeAllDays,
  parseRoutine,
  resolvedName,
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
    expect(r.unparsed).toEqual([{ lineNo: 6, raw: "this is a note" }]);
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
