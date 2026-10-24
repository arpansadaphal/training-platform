import { describe, it, expect } from "vitest";
import {
  epleyE1rm,
  convertLoad,
  topSetOf,
  buildExerciseHistory,
  computeProgressVerdict,
  progressVerdictLine,
  computeSessionSummary,
  type ExerciseSessionRecord,
  type LoggedSet,
  type SummaryExerciseInput,
} from "../../index";
import { assertCleanCopy } from "./forbiddenCopy";

const set = (load: number | null, reps: number | null, rpe: number | null = null): LoggedSet => ({
  load,
  reps,
  rpe,
});

/** A record list whose estimated 1RMs are exactly `e1rms` (1-rep sets), oldest first. */
function records(...e1rms: number[]): ExerciseSessionRecord[] {
  return buildExerciseHistory(
    e1rms.map((w, i) => ({
      sessionId: `s${i}`,
      date: `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
      sets: [set(w, 1)],
    })),
  );
}

describe("epleyE1rm / convertLoad", () => {
  it("matches Epley and treats one rep as the load", () => {
    expect(epleyE1rm(100, 10)).toBeCloseTo(133.333, 2);
    expect(epleyE1rm(100, 1)).toBe(100);
  });
  it("is null without a positive load and reps", () => {
    expect(epleyE1rm(null, 5)).toBeNull();
    expect(epleyE1rm(100, null)).toBeNull();
    expect(epleyE1rm(0, 5)).toBeNull();
    expect(epleyE1rm(100, 0)).toBeNull();
  });
  it("converts between units and is the identity for the same unit", () => {
    expect(convertLoad(100, "lb", "kg")).toBeCloseTo(45.359, 2);
    expect(convertLoad(45.359237, "kg", "lb")).toBeCloseTo(100, 2);
    expect(convertLoad(80, "kg", "kg")).toBe(80);
  });
});

describe("topSetOf / buildExerciseHistory", () => {
  it("picks the heaviest set, then the most reps, ignoring unloaded sets", () => {
    expect(topSetOf([set(60, 10), set(80, 5), set(80, 6), set(null, 12)])).toEqual({
      weight: 80,
      reps: 6,
      rpe: null,
    });
    expect(topSetOf([set(null, 12)])).toBeNull();
  });
  it("orders oldest-first, drops unloaded sessions, flags PRs", () => {
    const history = buildExerciseHistory([
      { sessionId: "b", date: "2026-02-02T00:00:00Z", sets: [set(90, 5)] },
      { sessionId: "a", date: "2026-02-01T00:00:00Z", sets: [set(100, 5)] },
      { sessionId: "c", date: "2026-02-03T00:00:00Z", sets: [set(null, 8)] },
      { sessionId: "d", date: "2026-02-04T00:00:00Z", sets: [set(105, 5)] },
    ]);
    expect(history.map((r) => r.sessionId)).toEqual(["a", "b", "d"]);
    expect(history.map((r) => r.isPersonalRecord)).toEqual([true, false, true]);
  });
  it("sums volume over sets with both load and reps", () => {
    const [r] = buildExerciseHistory([
      { sessionId: "a", date: "2026-02-01T00:00:00Z", sets: [set(100, 5), set(100, 4), set(null, 9)] },
    ]);
    expect(r!.totalVolume).toBe(900);
  });
});

describe("computeProgressVerdict", () => {
  it("needs three sessions", () => {
    expect(computeProgressVerdict(records()).kind).toBe("INSUFFICIENT_DATA");
    expect(computeProgressVerdict(records(100, 110)).kind).toBe("INSUFFICIENT_DATA");
    expect(computeProgressVerdict(records(100, 110, 120)).kind).not.toBe("INSUFFICIENT_DATA");
  });
  it("reads ±5% across the window as trending / declining, inside it as stalled", () => {
    expect(computeProgressVerdict(records(100, 102, 105)).kind).toBe("TRENDING_WELL");
    expect(computeProgressVerdict(records(100, 100, 104.9)).kind).toBe("STALLED");
    expect(computeProgressVerdict(records(100, 98, 95)).kind).toBe("DECLINING");
    expect(computeProgressVerdict(records(100, 100, 95.1)).kind).toBe("STALLED");
  });
  it("only looks at the last four sessions", () => {
    // Old climb, then flat: the window is the last four.
    const v = computeProgressVerdict(records(50, 60, 100, 100, 100, 100));
    expect(v.kind).toBe("STALLED");
    expect(v.sessionsConsidered).toBe(4);
  });
  it("counts added reps at the same weight as movement", () => {
    const history = buildExerciseHistory(
      [5, 6, 8].map((reps, i) => ({
        sessionId: `s${i}`,
        date: `2026-01-0${i + 1}T00:00:00Z`,
        sets: [set(100, reps)],
      })),
    );
    expect(computeProgressVerdict(history).kind).toBe("TRENDING_WELL");
  });
  it("writes clean copy for every verdict kind", () => {
    const lines = [
      progressVerdictLine("Back Squat", computeProgressVerdict(records(100, 104, 108, 108))),
      progressVerdictLine("Back Squat", computeProgressVerdict(records(100, 100, 100))),
      progressVerdictLine("Back Squat", computeProgressVerdict(records(100, 96, 92))),
      progressVerdictLine("Back Squat", computeProgressVerdict(records(100))),
      progressVerdictLine("Back Squat", computeProgressVerdict(records(100, 100))),
      progressVerdictLine("Back Squat", computeProgressVerdict(records())),
    ];
    expect(lines).toEqual([
      "Back Squat: up 8% over your last 4 sessions.",
      "Back Squat: no change over your last 3 sessions.",
      "Back Squat: down 8% over your last 3 sessions.",
      "Back Squat: log 2 more sessions for a verdict.",
      "Back Squat: log 1 more session for a verdict.",
      "Back Squat: log a weight to see a trend.",
    ]);
    assertCleanCopy(lines);
  });
});

function exercise(over: Partial<SummaryExerciseInput> = {}): SummaryExerciseInput {
  return {
    exerciseId: "ex1",
    exerciseName: "Bench Press",
    unit: "kg",
    plannedSets: 3,
    involvements: [{ muscle: "chest", factor: 1 }, { muscle: "triceps", factor: 0.5 }],
    current: [set(100, 5), set(100, 5), set(100, 5)],
    previous: [set(100, 5), set(100, 5), set(100, 4)],
    priorBestE1rm: 120,
    ...over,
  };
}

describe("computeSessionSummary", () => {
  const base = {
    startedAt: "2026-03-01T10:00:00.000Z",
    completedAt: "2026-03-01T11:05:30.000Z",
    hasPreviousSession: true,
  };

  it("reports duration, sets, volume change and per-muscle deltas", () => {
    const s = computeSessionSummary({ ...base, exercises: [exercise()] });
    expect(s.durationSeconds).toBe(65 * 60 + 30);
    expect(s.plannedSets).toBe(3);
    expect(s.loggedSets).toBe(3);
    expect(s.totalVolumeKg).toBe(1500);
    // 1500 vs 1400
    expect(s.volumeChangePercent).toBeCloseTo(7.14, 1);
    // Same number of sets, more volume: the set delta is 0 but the
    // volume change is not. This is the case the summary used to show as 0.
    expect(s.volumeDeltaPerMuscle).toEqual([
      { muscle: "chest", sets: 3, previousSets: 3, delta: 0, volumeChangePercent: expect.closeTo(7.14, 1) },
      { muscle: "triceps", sets: 1.5, previousSets: 1.5, delta: 0, volumeChangePercent: expect.closeTo(7.14, 1) },
    ]);
    expect(s.verdict).toBe("Solid session. Total volume up 7% from last time.");
  });

  it("weights a muscle's volume change by involvement and ignores exercises not shared with last time", () => {
    const s = computeSessionSummary({
      ...base,
      exercises: [
        exercise({ current: [set(110, 5)], previous: [set(100, 5)] }),
        // New this time: no previous volume, so it cannot move the percent.
        exercise({
          exerciseId: "ex2",
          exerciseName: "Dips",
          involvements: [{ muscle: "chest", factor: 0.5 }],
          current: [set(50, 10)],
          previous: [],
        }),
      ],
    });
    const chest = s.volumeDeltaPerMuscle.find((m) => m.muscle === "chest")!;
    expect(chest.volumeChangePercent).toBeCloseTo(10, 5); // 550 vs 500
  });

  it("flags a PR only when it beats earlier sessions", () => {
    const pr = computeSessionSummary({
      ...base,
      exercises: [exercise({ current: [set(110, 5)], priorBestE1rm: 120 })],
    });
    // 110×5 → 128.3 > 120
    expect(pr.newPRs).toEqual([
      { exerciseId: "ex1", exerciseName: "Bench Press", weight: 110, reps: 5, unit: "kg" },
    ]);
    expect(pr.verdict).toContain("New PR on Bench Press.");

    const first = computeSessionSummary({
      ...base,
      hasPreviousSession: false,
      exercises: [exercise({ previous: [], priorBestE1rm: null })],
    });
    expect(first.newPRs).toEqual([]);
    expect(first.volumeChangePercent).toBeNull();
    expect(first.volumeDeltaPerMuscle[0]).toMatchObject({
      previousSets: null,
      delta: null,
      volumeChangePercent: null,
    });
    expect(first.verdict).toBe(
      "Solid session. This is your first logged session of this day, so it sets the baseline.",
    );
  });

  it("compares volume only over exercises logged with a load both times", () => {
    const s = computeSessionSummary({
      ...base,
      exercises: [
        exercise(),
        exercise({
          exerciseId: "ex2",
          exerciseName: "Dip",
          current: [set(null, 12)],
          previous: [],
          priorBestE1rm: null,
        }),
      ],
    });
    expect(s.volumeChangePercent).toBeCloseTo(7.14, 1);
  });

  it("converts lb loads to kg for total volume", () => {
    const s = computeSessionSummary({
      ...base,
      exercises: [exercise({ unit: "lb", current: [set(100, 10)], previous: [] })],
    });
    expect(s.totalVolumeKg).toBeCloseTo(453.59, 1);
  });

  it("states a short session as a count, and handles an empty one", () => {
    const short = computeSessionSummary({
      ...base,
      exercises: [exercise({ current: [set(100, 5)], priorBestE1rm: null })],
    });
    expect(short.loggedSets).toBe(1);
    expect(short.verdict.startsWith("Session complete.")).toBe(true);

    const empty = computeSessionSummary({
      ...base,
      exercises: [exercise({ current: [] })],
    });
    expect(empty.verdict).toBe("Session complete. No sets were logged.");
  });

  it("has no duration without a start time, and never a negative one", () => {
    expect(
      computeSessionSummary({ ...base, startedAt: null, exercises: [exercise()] }).durationSeconds,
    ).toBeNull();
    expect(
      computeSessionSummary({
        ...base,
        startedAt: "2026-03-01T12:00:00.000Z",
        exercises: [exercise()],
      }).durationSeconds,
    ).toBe(0);
  });

  it("writes clean copy across scenarios", () => {
    const scenarios = [
      exercise(),
      exercise({ current: [set(110, 5)] }),
      exercise({ current: [set(80, 5)] }),
      exercise({ current: [set(100, 5)] }),
      exercise({ previous: [], priorBestE1rm: null }),
    ];
    const lines = scenarios.flatMap((e) => [
      computeSessionSummary({ ...base, exercises: [e] }).verdict,
      computeSessionSummary({ ...base, hasPreviousSession: false, exercises: [e] }).verdict,
    ]);
    lines.push(
      computeSessionSummary({
        ...base,
        exercises: [
          exercise({ current: [set(110, 5)] }),
          exercise({ exerciseId: "ex3", exerciseName: "Row", current: [set(90, 8)], priorBestE1rm: 100 }),
        ],
      }).verdict,
    );
    assertCleanCopy(lines);
  });
});
