import { describe, expect, it } from "vitest";
import { buildExerciseHistory, type ExerciseSessionRecord, type LoggedSet } from "../history";
import {
  buildJournalEntries,
  durationText,
  joinLifts,
  type JournalSessionInput,
} from "../journal";
import { sessionMilestone, type MilestoneInput } from "../milestones";
import { firstVsNow, firstVsNowLine } from "../firstVsNow";
import { buildTrainingCsv, csvText, TRAINING_CSV_HEADER, type TrainingCsvRow } from "../trainingCsv";
import { assertCleanCopy } from "./forbiddenCopy";

const set = (reps: number | null, load: number | null, rpe: number | null = null): LoggedSet => ({
  reps,
  load,
  rpe,
});

function records(...tops: Array<[string, number, number]>): ExerciseSessionRecord[] {
  return buildExerciseHistory(
    tops.map(([date, weight, reps], i) => ({
      sessionId: `s${i}`,
      date,
      sets: [set(reps, weight)],
    })),
  );
}

// ─── First vs now ──────────────────────────────────────────────────────────

describe("firstVsNow", () => {
  const fmt = (iso: string) => iso.slice(5, 10);

  it("says it is a baseline when there is only one session", () => {
    const result = firstVsNow(records(["2026-10-25T10:00:00Z", 40, 10]));
    expect(result.kind).toBe("BASELINE");
    expect(firstVsNowLine(result, "kg", fmt)).toBe("Your first session on this lift. Baseline set.");
  });

  it("shows first and now, without a change, for two or three sessions", () => {
    const two = firstVsNow(records(["2026-10-25T10:00:00Z", 40, 10], ["2026-12-24T10:00:00Z", 55, 10]));
    expect(two).toMatchObject({ kind: "COMPARE", sessions: 2, deltaWeight: null });
    expect(firstVsNowLine(two, "kg", fmt)).toBe("Your first: 40 kg × 10 (10-25). Now: 55 kg × 10 (12-24).");

    const three = firstVsNow(
      records(
        ["2026-10-25T10:00:00Z", 40, 10],
        ["2026-11-25T10:00:00Z", 47.5, 10],
        ["2026-12-24T10:00:00Z", 55, 10],
      ),
    );
    expect(three).toMatchObject({ kind: "COMPARE", sessions: 3, deltaWeight: null });
  });

  it("adds the change in weight from four sessions", () => {
    const four = firstVsNow(
      records(
        ["2026-10-25T10:00:00Z", 40, 10],
        ["2026-11-05T10:00:00Z", 45, 10],
        ["2026-11-25T10:00:00Z", 50, 10],
        ["2026-12-24T10:00:00Z", 55, 10],
      ),
    );
    expect(four).toMatchObject({ kind: "COMPARE", sessions: 4, deltaWeight: 15 });
    expect(firstVsNowLine(four, "kg", fmt)).toBe(
      "Your first: 40 kg × 10 (10-25). Now: 55 kg × 10 (12-24). Up 15 kg.",
    );
  });

  it("states a lower weight as a fact and says nothing about an unchanged one", () => {
    const down = firstVsNow(
      records(
        ["2026-10-01T10:00:00Z", 60, 5],
        ["2026-10-08T10:00:00Z", 55, 5],
        ["2026-10-15T10:00:00Z", 50, 5],
        ["2026-10-22T10:00:00Z", 50, 5],
      ),
    );
    expect(firstVsNowLine(down, "kg", fmt)).toMatch(/Down 10 kg\.$/);
    const same = firstVsNow(
      records(
        ["2026-10-01T10:00:00Z", 50, 5],
        ["2026-10-08T10:00:00Z", 50, 6],
        ["2026-10-15T10:00:00Z", 50, 7],
        ["2026-10-22T10:00:00Z", 50, 8],
      ),
    );
    expect(firstVsNowLine(same, "kg", fmt)).toBe("Your first: 50 kg × 5 (10-01). Now: 50 kg × 8 (10-22).");
  });

  it("has nothing to say with no loaded session", () => {
    expect(firstVsNow([])).toEqual({ kind: "NONE" });
    expect(firstVsNowLine({ kind: "NONE" }, "kg", fmt)).toBeNull();
  });

  it("uses pounds when the lift is logged in pounds", () => {
    const line = firstVsNowLine(
      firstVsNow(records(["2026-10-01T10:00:00Z", 135, 8], ["2026-10-08T10:00:00Z", 145, 8])),
      "lb",
      fmt,
    );
    expect(line).toContain("135 lb × 8");
  });
});

// ─── Milestones ────────────────────────────────────────────────────────────

describe("sessionMilestone", () => {
  const base: MilestoneInput = {
    sessionNumber: 3,
    completedAt: "2026-10-25T10:00:00Z",
    firstSessionAt: "2026-10-10T10:00:00Z",
    previousSessionAt: "2026-10-22T10:00:00Z",
    exercises: [],
  };

  it("names the 10th, 25th, 50th and 100th session, and no other", () => {
    expect(sessionMilestone({ ...base, sessionNumber: 10 })).toBe("Your 10th session.");
    expect(sessionMilestone({ ...base, sessionNumber: 25 })).toBe("Your 25th session.");
    expect(sessionMilestone({ ...base, sessionNumber: 50 })).toBe("Your 50th session.");
    expect(sessionMilestone({ ...base, sessionNumber: 100 })).toBe("Your 100th session.");
    for (const n of [1, 9, 11, 24, 26, 99, 101]) {
      expect(sessionMilestone({ ...base, sessionNumber: n })).toBeNull();
    }
  });

  it("names the first session at a new round weight on a lift with history", () => {
    const text = sessionMilestone({
      ...base,
      exercises: [{ exerciseName: "Back Squat", unit: "kg", topWeight: 60, priorMaxWeight: 57.5 }],
    });
    expect(text).toBe("First session at 60 kg on Back Squat.");
  });

  it("does not repeat a round weight, and does not fire below the next one", () => {
    const squat = (top: number, prior: number) =>
      sessionMilestone({
        ...base,
        exercises: [{ exerciseName: "Back Squat", unit: "kg", topWeight: top, priorMaxWeight: prior }],
      });
    expect(squat(60, 60)).toBeNull();
    expect(squat(62.5, 60)).toBeNull();
    expect(squat(57.5, 55)).toBeNull();
    expect(squat(55, 52.5)).toBe("First session at 55 kg on Back Squat.");
  });

  it("names the highest round weight when a jump passes several", () => {
    const text = sessionMilestone({
      ...base,
      exercises: [{ exerciseName: "Deadlift", unit: "kg", topWeight: 72.5, priorMaxWeight: 57.5 }],
    });
    expect(text).toBe("First session at 70 kg on Deadlift.");
  });

  it("treats a lift's first loaded session as a baseline", () => {
    expect(
      sessionMilestone({
        ...base,
        exercises: [{ exerciseName: "Back Squat", unit: "kg", topWeight: 60, priorMaxWeight: null }],
      }),
    ).toBeNull();
  });

  it("picks the heaviest crossing across lifts", () => {
    const text = sessionMilestone({
      ...base,
      exercises: [
        { exerciseName: "Bench Press", unit: "kg", topWeight: 40, priorMaxWeight: 37.5 },
        { exerciseName: "Back Squat", unit: "kg", topWeight: 60, priorMaxWeight: 57.5 },
      ],
    });
    expect(text).toBe("First session at 60 kg on Back Squat.");
  });

  it("uses a 5 lb step for pounds", () => {
    const lb = (top: number, prior: number) =>
      sessionMilestone({
        ...base,
        exercises: [{ exerciseName: "Bench Press", unit: "lb", topWeight: top, priorMaxWeight: prior }],
      });
    expect(lb(135, 135)).toBeNull();
    expect(lb(137.5, 135)).toBeNull();
    expect(lb(140, 135)).toBe("First session at 140 lb on Bench Press.");
    expect(lb(145, 130)).toBe("First session at 145 lb on Bench Press.");
  });

  it("names 4, 8 and 12 weeks since the first session, once", () => {
    const first = "2026-09-01T10:00:00Z";
    // 4 weeks = 28 days: 2026-09-29.
    expect(
      sessionMilestone({ ...base, firstSessionAt: first, previousSessionAt: "2026-09-26T10:00:00Z", completedAt: "2026-09-29T10:00:00Z" }),
    ).toBe("Four weeks since your first session.");
    // The session after it is past 4 weeks too, but the one before was not.
    expect(
      sessionMilestone({ ...base, firstSessionAt: first, previousSessionAt: "2026-09-29T10:00:00Z", completedAt: "2026-10-02T10:00:00Z" }),
    ).toBeNull();
    expect(
      sessionMilestone({ ...base, firstSessionAt: first, previousSessionAt: "2026-10-24T10:00:00Z", completedAt: "2026-10-27T10:00:00Z" }),
    ).toBe("Eight weeks since your first session.");
    expect(
      sessionMilestone({ ...base, firstSessionAt: first, previousSessionAt: "2026-11-22T10:00:00Z", completedAt: "2026-11-24T10:00:00Z" }),
    ).toBe("Twelve weeks since your first session.");
  });

  it("names the highest week mark when a gap crosses two", () => {
    expect(
      sessionMilestone({
        ...base,
        firstSessionAt: "2026-09-01T10:00:00Z",
        previousSessionAt: "2026-09-20T10:00:00Z",
        completedAt: "2026-10-30T10:00:00Z",
      }),
    ).toBe("Eight weeks since your first session.");
  });

  it("ranks a session count over weeks over a weight, one fact at a time", () => {
    const weight = [{ exerciseName: "Back Squat", unit: "kg" as const, topWeight: 60, priorMaxWeight: 57.5 }];
    const week = { firstSessionAt: "2026-09-01T10:00:00Z", previousSessionAt: "2026-09-26T10:00:00Z", completedAt: "2026-09-29T10:00:00Z" };
    expect(sessionMilestone({ ...base, ...week, sessionNumber: 10, exercises: weight })).toBe("Your 10th session.");
    expect(sessionMilestone({ ...base, ...week, sessionNumber: 9, exercises: weight })).toBe(
      "Four weeks since your first session.",
    );
  });

  it("never counts consecutive anything", () => {
    // Every message that can come out of the function, run through the copy lint.
    const lines = [
      sessionMilestone({ ...base, sessionNumber: 10 }),
      sessionMilestone({ ...base, sessionNumber: 100 }),
      sessionMilestone({ ...base, previousSessionAt: "2026-09-26T10:00:00Z", firstSessionAt: "2026-09-01T10:00:00Z", completedAt: "2026-09-29T10:00:00Z" }),
      sessionMilestone({
        ...base,
        exercises: [{ exerciseName: "Back Squat", unit: "kg", topWeight: 60, priorMaxWeight: 55 }],
      }),
    ].filter((x): x is string => x !== null);
    expect(lines).toHaveLength(4);
    assertCleanCopy(lines);
    for (const line of lines) expect(line).not.toMatch(/in a row|consecutive|streak|roll/i);
  });
});

// ─── Journal ───────────────────────────────────────────────────────────────

function journalSession(
  id: string,
  completedAt: string,
  exercises: JournalSessionInput["exercises"],
  over: Partial<JournalSessionInput> = {},
): JournalSessionInput {
  return {
    sessionId: id,
    dayName: "Full Body A",
    startedAt: new Date(Date.parse(completedAt) - 45 * 60000).toISOString(),
    completedAt,
    note: null,
    exercises,
    ...over,
  };
}

const squat = (...sets: LoggedSet[]) => ({
  exerciseId: "squat",
  exerciseName: "Squat",
  unit: "kg" as const,
  sets,
});
const bench = (...sets: LoggedSet[]) => ({
  exerciseId: "bench",
  exerciseName: "Bench",
  unit: "kg" as const,
  sets,
});

describe("buildJournalEntries", () => {
  it("gives the day, the duration, the top set per lift and the note", () => {
    const [entry] = buildJournalEntries([
      journalSession(
        "s1",
        "2026-10-24T10:00:00Z",
        [squat(set(10, 45), set(10, 47.5), set(8, 47.5)), bench(set(10, 30))],
        { note: "Left knee felt off today" },
      ),
    ]);
    expect(entry).toMatchObject({
      sessionId: "s1",
      dayName: "Full Body A",
      durationMinutes: 45,
      note: "Left knee felt off today",
      prLine: null,
    });
    expect(entry!.topSets.map((t) => t.text)).toEqual(["Squat 47.5 kg × 10", "Bench 30 kg × 10"]);
  });

  it("keeps the note exactly as written", () => {
    const note = "  Slept badly.\nSquat felt heavy — 'maybe' the \"warm-up\"?  ";
    const [entry] = buildJournalEntries([journalSession("s1", "2026-10-24T10:00:00Z", [squat(set(5, 50))], { note })]);
    expect(entry!.note).toBe(note);
  });

  it("calls a first session a baseline and a later heavier top set a PR, in words", () => {
    const entries = buildJournalEntries([
      journalSession("s1", "2026-10-10T10:00:00Z", [squat(set(10, 40)), bench(set(10, 30))]),
      journalSession("s2", "2026-10-17T10:00:00Z", [squat(set(10, 45)), bench(set(10, 30))]),
      journalSession("s3", "2026-10-24T10:00:00Z", [squat(set(10, 50)), bench(set(10, 32.5))]),
    ]);
    expect(entries[0]!.prLine).toBeNull();
    expect(entries[1]!.prLine).toBe("New PR on Squat");
    expect(entries[2]!.prLine).toBe("New PR on Squat and Bench");
  });

  it("counts added reps at the same weight, and not a lighter session", () => {
    const entries = buildJournalEntries([
      journalSession("s1", "2026-10-10T10:00:00Z", [squat(set(8, 50))]),
      journalSession("s2", "2026-10-17T10:00:00Z", [squat(set(10, 50))]),
      journalSession("s3", "2026-10-24T10:00:00Z", [squat(set(10, 45))]),
    ]);
    expect(entries.map((e) => e.prLine)).toEqual([null, "New PR on Squat", null]);
  });

  it("shows a bodyweight lift by its best reps and never calls it a PR", () => {
    const pullUp = (...sets: LoggedSet[]) => ({ exerciseId: "pu", exerciseName: "Pull-up", unit: "kg" as const, sets });
    const entries = buildJournalEntries([
      journalSession("s1", "2026-10-10T10:00:00Z", [pullUp(set(8, null), set(6, 0))]),
      journalSession("s2", "2026-10-17T10:00:00Z", [pullUp(set(12, null))]),
    ]);
    expect(entries[0]!.topSets[0]!.text).toBe("Pull-up × 8");
    expect(entries[1]!.topSets[0]!.text).toBe("Pull-up × 12");
    expect(entries[1]!.prLine).toBeNull();
  });

  it("leaves out a lift with no reps logged", () => {
    const [entry] = buildJournalEntries([
      journalSession("s1", "2026-10-10T10:00:00Z", [squat(set(null, 50)), bench(set(10, 30))]),
    ]);
    expect(entry!.topSets.map((t) => t.exerciseName)).toEqual(["Bench"]);
  });

  it("has no duration without a start time", () => {
    const [entry] = buildJournalEntries([
      journalSession("s1", "2026-10-10T10:00:00Z", [squat(set(5, 50))], { startedAt: null }),
    ]);
    expect(entry!.durationMinutes).toBeNull();
  });

  it("formats durations and lists of lifts", () => {
    expect(durationText(0)).toBe("Under 1 min");
    expect(durationText(45)).toBe("45 min");
    expect(durationText(60)).toBe("1 h");
    expect(durationText(65)).toBe("1 h 5 min");
    expect(joinLifts(["A"])).toBe("A");
    expect(joinLifts(["A", "B"])).toBe("A and B");
    expect(joinLifts(["A", "B", "C"])).toBe("A, B and C");
    expect(joinLifts(["A", "B", "C", "D", "E"])).toBe("A, B and 3 more");
  });

  it("passes the copy lint", () => {
    const entries = buildJournalEntries([
      journalSession("s1", "2026-10-10T10:00:00Z", [squat(set(10, 40)), bench(set(10, 30))]),
      journalSession("s2", "2026-10-17T10:00:00Z", [squat(set(10, 45)), bench(set(10, 32.5))]),
    ]);
    const lines = entries.flatMap((e) => [e.prLine, ...e.topSets.map((t) => t.text)]).filter((x): x is string => x !== null);
    lines.push(durationText(45), "Log your first session and it appears here.", "Everything you log is yours. Download anytime.");
    assertCleanCopy(lines);
  });
});

// ─── CSV ───────────────────────────────────────────────────────────────────

const row = (over: Partial<TrainingCsvRow> = {}): TrainingCsvRow => ({
  sessionCompletedAt: "2026-10-24T10:15:00.000Z",
  dayName: "Full Body A",
  exerciseName: "Squat",
  setIndex: 0,
  reps: 10,
  weight: 47.5,
  unit: "kg",
  rpe: 8,
  setCompletedAt: "2026-10-24T09:40:12.000Z",
  note: null,
  ...over,
});

describe("buildTrainingCsv", () => {
  it("writes a header and one CRLF-terminated line per set", () => {
    const csv = buildTrainingCsv([row(), row({ setIndex: 1, reps: 9, rpe: null })]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(TRAINING_CSV_HEADER.join(","));
    expect(lines[0]).toBe("session_date,day,exercise,set_number,reps,weight,unit,rpe,completed_at,session_note");
    expect(lines[1]).toBe("2026-10-24,Full Body A,Squat,1,10,47.5,kg,8,2026-10-24T09:40:12.000Z,");
    expect(lines[2]).toBe("2026-10-24,Full Body A,Squat,2,9,47.5,kg,,2026-10-24T09:40:12.000Z,");
    expect(lines[3]).toBe("");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("leaves a missing value empty", () => {
    const [, line] = buildTrainingCsv([row({ reps: null, weight: null, rpe: null })]).split("\r\n");
    expect(line).toBe("2026-10-24,Full Body A,Squat,1,,,kg,,2026-10-24T09:40:12.000Z,");
  });

  it("quotes commas, quotes and line breaks, and keeps the note's words", () => {
    const note = 'Felt "heavy", knee off\nwarm-up was short';
    const csv = buildTrainingCsv([row({ note, dayName: "Push, Pull" })]);
    expect(csv).toContain('"Push, Pull"');
    expect(csv).toContain('"Felt ""heavy"", knee off\nwarm-up was short"');
  });

  it("defuses text a spreadsheet would run as a formula", () => {
    expect(csvText("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvText("+1")).toBe("'+1");
    expect(csvText("-1 rep")).toBe("'-1 rep");
    expect(csvText("@home")).toBe("'@home");
    expect(csvText("plain")).toBe("plain");
    expect(buildTrainingCsv([row({ note: "=HYPERLINK(\"x\")" })])).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
  });

  it("is only a header when there is nothing logged", () => {
    expect(buildTrainingCsv([])).toBe(`${TRAINING_CSV_HEADER.join(",")}\r\n`);
  });

  it("writes pounds as logged, with the unit beside them", () => {
    expect(buildTrainingCsv([row({ unit: "lb", weight: 135 })])).toContain(",135,lb,");
  });
});
