// packages/domain/src/analysis/__tests__/programStructure.test.ts
//
// ARCH-063, Session D: the PROGRAM_STRUCTURE axis. Five program-level facts, each a scope of one axis. Every
// boundary is tested on both sides, because the thresholds are the part a reviewer will argue with.
import { describe, expect, it } from "vitest";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import type { ExercisePrescriptionStructure, ProgramStructure, WorkoutDayStructure } from "../../types";
import { computeAnalysis } from "../computeAnalysis";
import type { AnalysisContext, AnalysisAxisResult, ExerciseReferenceData, GoalProfileConfig } from "../types";

const MUSCLES = ["chest", "lats", "upper back", "side delts", "rear delts", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves"];
const EX: Array<[string, string, Record<string, number>]> = [
  ["Barbell Bench Press", "HORIZONTAL_PUSH", { chest: 1, triceps: 0.5 }],
  ["Barbell Row", "HORIZONTAL_PULL", { lats: 1, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 }],
  ["Back Squat", "SQUAT", { quads: 1, glutes: 0.5 }],
];
const REF: ExerciseReferenceData = {
  exercises: EX.map(([name, movementPattern]) => ({ id: name, name, movementPattern: movementPattern as never, equipment: "barbell" })),
  muscleGroups: MUSCLES.map((m) => ({ id: m, name: m })),
  involvements: EX.flatMap(([name, , inv]) => Object.entries(inv).map(([m, f]) => ({ exerciseId: name, muscleGroupId: m, involvementFactor: f }))),
};

const rx = (exerciseId: string, sets: number, rpe = 8): ExercisePrescriptionStructure => ({
  id: `${exerciseId}-${sets}-${rpe}`, orderIndex: 0, exerciseId, targetSets: sets, targetRepsLow: 8, targetRepsHigh: 12,
  targetRpe: rpe, loadScheme: { type: "RPE_BASED", rpe },
});
const day = (name: string, ...rows: ExercisePrescriptionStructure[]): WorkoutDayStructure => ({ id: name, orderIndex: 0, name, prescriptions: rows });
const rest = (name: string): WorkoutDayStructure => ({ id: name, orderIndex: 0, name, isRestDay: true, prescriptions: [] });
const program = (...days: WorkoutDayStructure[]): ProgramStructure => ({ workoutDays: days.map((d, i) => ({ ...d, orderIndex: i })) });

const axes = (p: ProgramStructure, context?: AnalysisContext, config: GoalProfileConfig = HYPERTROPHY_CONFIG): AnalysisAxisResult[] =>
  computeAnalysis(p, REF, config, { now: () => new Date(0), ...(context ? { context } : {}) }).axisResults.filter(
    (a) => a.axisType === "PROGRAM_STRUCTURE",
  );
const scope = (rs: AnalysisAxisResult[], key: string): AnalysisAxisResult | undefined => rs.find((a) => a.scopeKey === key);
const band = (rs: AnalysisAxisResult[], key: string): string | undefined => {
  const s = scope(rs, key)?.status;
  return s?.kind === "BAND" ? s.band : undefined;
};
/** `n` sets of bench on each of `days` days. */
const benchDays = (n: number, days: number): ProgramStructure =>
  program(...Array.from({ length: days }, (_, i) => day(`D${i + 1}`, rx("Barbell Bench Press", n))));

describe("PROGRAM_STRUCTURE: opt-in", () => {
  it("is not computed at all for a config without `programStructure`", () => {
    const bare: GoalProfileConfig = { ...HYPERTROPHY_CONFIG, programStructure: undefined };
    expect(axes(benchDays(10, 2), undefined, bare)).toEqual([]);
  });

  it("emits attendance, total-volume, session-size and push-pull, and time-budget only with a budget", () => {
    const p = benchDays(10, 2);
    expect(axes(p).map((a) => a.scopeKey)).toEqual(["attendance", "total-volume", "session-size", "push-pull"]);
    expect(axes(p, { minutesPerSession: 45 }).map((a) => a.scopeKey)).toEqual([
      "attendance", "total-volume", "session-size", "push-pull", "time-budget",
    ]);
  });
});

describe("total-volume: fewer than 40 credited hard sets a week", () => {
  it("39 is under-dosed, 40 is not (the floor is exclusive)", () => {
    expect(band(axes(program(day("A", rx("Barbell Bench Press", 20)), day("B", rx("Barbell Bench Press", 19)))), "total-volume")).toBe("Under-dosed");
    expect(band(axes(program(day("A", rx("Barbell Bench Press", 20)), day("B", rx("Barbell Bench Press", 20)))), "total-volume")).toBe("Within range");
  });

  it("counts credited sets: sets 5 or more reps from failure earn nothing", () => {
    const p = program(day("A", rx("Barbell Bench Press", 20), rx("Barbell Row", 20, 5)), day("B", rx("Barbell Bench Press", 1)));
    expect(scope(axes(p), "total-volume")?.metricValue).toBe(21);
  });

  it("is a weekly total, so a cycle run twice a week doubles it", () => {
    const p = benchDays(10, 3); // 30 sets listed
    expect(scope(axes(p), "total-volume")?.metricValue).toBe(30);
    expect(scope(axes(p, { daysPerWeek: 6 }), "total-volume")?.metricValue).toBe(60);
    expect(band(axes(p, { daysPerWeek: 6 }), "total-volume")).toBe("Within range");
  });

  it("carries the total and the floor it was read against", () => {
    expect(scope(axes(benchDays(6, 2)), "total-volume")?.facts?.program).toEqual({ totalSets: 12, floorSets: 40 });
  });
});

describe("attendance: fewer than two training days a week", () => {
  it("one listed day fires, two do not", () => {
    expect(band(axes(benchDays(10, 1)), "attendance")).toBe("Single session");
    expect(band(axes(benchDays(10, 2)), "attendance")).toBe("Within range");
  });

  it("rest days are not training days", () => {
    expect(band(axes(program(day("A", rx("Barbell Bench Press", 10)), rest("R1"), rest("R2"))), "attendance")).toBe("Single session");
  });

  it("daysPerWeek, when supplied, is the number of days", () => {
    expect(band(axes(benchDays(10, 1), { daysPerWeek: 3 }), "attendance")).toBe("Within range");
    expect(band(axes(benchDays(10, 3), { daysPerWeek: 1 }), "attendance")).toBe("Single session");
  });

  it("an empty program has no training day to be short of: total-volume speaks for it", () => {
    const empty = axes(program());
    expect(band(empty, "attendance")).toBe("Within range");
    expect(band(empty, "total-volume")).toBe("Under-dosed");
  });
});

describe("session-size: more than 30 credited sets in one session", () => {
  it("30 is not long, 31 is", () => {
    expect(band(axes(benchDays(30, 2)), "session-size")).toBe("Within range");
    expect(band(axes(benchDays(31, 2)), "session-size")).toBe("Long session");
  });

  it("names the longest session, the first of equals, with its sets and minutes", () => {
    const p = program(day("Push", rx("Barbell Bench Press", 20)), day("Pull", rx("Barbell Row", 32)), day("Legs", rx("Back Squat", 32)));
    expect(scope(axes(p), "session-size")?.facts?.program).toEqual({ sessionName: "Pull", sessionSets: 32, sessionMinutes: 80 });
  });

  it("is a single session, not scaled by how often the cycle runs", () => {
    expect(scope(axes(benchDays(31, 3), { daysPerWeek: 6 }), "session-size")?.metricValue).toBe(31);
  });

  it("ignores rest days and counts credited sets only", () => {
    const p = program(day("A", rx("Barbell Bench Press", 25), rx("Barbell Row", 20, 5)), rest("R"));
    expect(scope(axes(p), "session-size")?.metricValue).toBe(25);
  });
});

describe("push-pull: more than 2 to 1, with more than 10 sets on each side", () => {
  const pushPull = (push: number, pull: number): ProgramStructure =>
    program(day("A", rx("Barbell Bench Press", push), rx("Barbell Row", pull)));

  it("fires above 2 to 1 with both sides above 10", () => {
    expect(band(axes(pushPull(23, 11)), "push-pull")).toBe("Push-heavy");
  });

  it("does not fire at exactly 2 to 1 (S8: 20 against 10)", () => {
    expect(band(axes(pushPull(22, 11)), "push-pull")).toBe("Within range");
    expect(band(axes(pushPull(20, 10)), "push-pull")).toBe("Within range");
  });

  it("does not fire when the pulling side is 10 or fewer, however lopsided", () => {
    expect(band(axes(pushPull(30, 10)), "push-pull")).toBe("Within range");
    expect(band(axes(pushPull(24, 10)), "push-pull")).toBe("Within range");
  });

  it("does not fire when pulling is the larger side", () => {
    expect(band(axes(pushPull(11, 30)), "push-pull")).toBe("Within range");
  });

  it("carries the push and pull totals the ratio came from", () => {
    expect(scope(axes(pushPull(24, 11)), "push-pull")?.facts?.program).toEqual({ pushSets: 24, pullSets: 11 });
  });
});

describe("time-budget: the longest session against the stated minutes", () => {
  it("is not computed without minutesPerSession, or with one that is not a positive number", () => {
    expect(scope(axes(benchDays(30, 2)), "time-budget")).toBeUndefined();
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(scope(axes(benchDays(30, 2), { minutesPerSession: bad }), "time-budget")).toBeUndefined();
    }
  });

  it("needs MORE than 5 minutes over the budget: 50 minutes against 45 is fine, 52.5 is not", () => {
    expect(band(axes(benchDays(20, 2), { minutesPerSession: 45 }), "time-budget")).toBe("Within range");
    expect(band(axes(benchDays(21, 2), { minutesPerSession: 45 }), "time-budget")).toBe("Over budget");
  });

  it("says how many sets would bring the session inside the budget", () => {
    // 21 sets = 52.5 minutes against 45: 7.5 minutes over, 3 sets at 2.5 minutes each.
    expect(scope(axes(benchDays(21, 2), { minutesPerSession: 45 }), "time-budget")?.facts?.program).toEqual({
      sessionName: "D1", sessionSets: 21, sessionMinutes: 52.5, budgetMinutes: 45, trimSets: 3,
    });
  });

  it("P2: two 11-set sessions (27.5 minutes) fit a 45-minute budget", () => {
    expect(band(axes(benchDays(11, 2), { minutesPerSession: 45 }), "time-budget")).toBe("Within range");
  });
});

describe("older axes are untouched", () => {
  it("the other five axes are identical with and without programStructure", () => {
    const p = benchDays(31, 2);
    const without = computeAnalysis(p, REF, { ...HYPERTROPHY_CONFIG, programStructure: undefined }, { now: () => new Date(0) });
    const withRules = computeAnalysis(p, REF, HYPERTROPHY_CONFIG, { now: () => new Date(0) });
    expect(withRules.axisResults.filter((a) => a.axisType !== "PROGRAM_STRUCTURE")).toEqual(without.axisResults);
    expect(withRules.ratios).toEqual(without.ratios);
  });
});
