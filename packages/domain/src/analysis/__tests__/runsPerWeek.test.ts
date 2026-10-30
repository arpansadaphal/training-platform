// packages/domain/src/analysis/__tests__/runsPerWeek.test.ts
//
// ARCH-063, Session C1: AnalysisContext.daysPerWeek turns the listed structure into a repeating cycle. VOLUME
// multiplies the weekly dose by runsPerWeek; FREQUENCY multiplies it too and rounds the exposures DOWN. Nothing
// else changes, and without context (or with daysPerWeek equal to the listed days) every output is identical.
import { describe, expect, it } from "vitest";
import type { ProgramStructure, WorkoutDayStructure } from "../../types";
import { computeAnalysis } from "../computeAnalysis";
import { computeFrequencyAxis } from "../frequency";
import { runsPerWeek } from "../runsPerWeek";
import { computeVolumeAxis } from "../volume";
import { testReferenceData } from "../__fixtures__/exerciseReferenceData";
import { TEST_CONFIG_BOUNDED } from "../__fixtures__/testGoalProfiles";
import type { GoalProfileConfig } from "../types";

// E6 bands, as in the hypertrophy profile: Low < 1, Adequate 1 to < 4, High >= 4.
const CONFIG: GoalProfileConfig = {
  ...TEST_CONFIG_BOUNDED,
  statusBands: {
    ...TEST_CONFIG_BOUNDED.statusBands,
    FREQUENCY: [
      { status: "Low", lowerBound: null, upperBound: 1 },
      { status: "Adequate", lowerBound: 1, upperBound: 4 },
      { status: "High", lowerBound: 4, upperBound: null },
    ],
  },
};

const day = (id: string, exerciseId: string, sets: number, isRestDay = false): WorkoutDayStructure => ({
  id,
  orderIndex: 0,
  name: id,
  ...(isRestDay ? { isRestDay: true } : {}),
  prescriptions: isRestDay
    ? []
    : [{ id: `${id}-p`, orderIndex: 0, exerciseId, targetSets: sets, targetRepsLow: 8, targetRepsHigh: 12, loadScheme: { type: "RPE_BASED", rpe: 8 } }],
});
const program = (...d: WorkoutDayStructure[]): ProgramStructure => ({ workoutDays: d.map((x, i) => ({ ...x, orderIndex: i })) });

// A three-day cycle (push, squat, pull) and the same three days listed twice.
const cycle = [day("push", "bench", 4), day("legs", "squat", 4), day("pull", "row", 4)] as const;
const THREE = program(...cycle);
const SIX = program(...cycle, ...cycle.map((d) => ({ ...d, id: `${d.id}2` })));

const volume = (s: ProgramStructure, runs?: number) => computeVolumeAxis(s, testReferenceData, CONFIG, runs);
const frequency = (s: ProgramStructure, runs?: number) => computeFrequencyAxis(s, testReferenceData, CONFIG, runs);
const metric = (rs: ReturnType<typeof volume>, id: string) => rs.find((r) => r.scopeKey === id)!.metricValue;

describe("runsPerWeek", () => {
  it("is 1 (unchanged) without context, with an empty context, or with no daysPerWeek", () => {
    expect(runsPerWeek(THREE)).toBe(1);
    expect(runsPerWeek(THREE, {})).toBe(1);
    expect(runsPerWeek(THREE, { daysPerWeek: undefined })).toBe(1);
  });

  it("is 1 when daysPerWeek equals the listed days", () => {
    expect(runsPerWeek(THREE, { daysPerWeek: 3 })).toBe(1);
  });

  it("is daysPerWeek / listedDays otherwise", () => {
    expect(runsPerWeek(THREE, { daysPerWeek: 6 })).toBe(2);
    expect(runsPerWeek(program(...cycle, day("arms", "curl", 4)), { daysPerWeek: 6 })).toBe(1.5);
    expect(runsPerWeek(program(day("a", "bench", 4), day("b", "squat", 4)), { daysPerWeek: 1 })).toBe(0.5);
  });

  it("ignores a daysPerWeek that is not a positive finite number", () => {
    for (const daysPerWeek of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(runsPerWeek(THREE, { daysPerWeek }), String(daysPerWeek)).toBe(1);
    }
  });

  it("does not count rest days as listed days", () => {
    expect(runsPerWeek(program(...cycle, day("rest", "bench", 0, true)), { daysPerWeek: 6 })).toBe(2);
  });

  it("is 1 when there is no training day to repeat", () => {
    expect(runsPerWeek(program(), { daysPerWeek: 6 })).toBe(1);
    expect(runsPerWeek(program(day("rest", "bench", 0, true)), { daysPerWeek: 6 })).toBe(1);
  });
});

describe("VOLUME with runsPerWeek", () => {
  it("multiplies the weekly sets: the 3-day cycle at 6 days a week is the 3 days listed twice", () => {
    expect(volume(THREE, 2)).toEqual(volume(SIX));
    expect(metric(volume(THREE, 2), "chest")).toBe(2 * (metric(volume(THREE), "chest") as number));
  });

  it("a fractional run multiplies fractionally (1.5x the sets for 1.5 runs)", () => {
    expect(metric(volume(THREE, 1.5), "chest")).toBeCloseTo(1.5 * (metric(volume(THREE), "chest") as number));
  });

  it("a runs of 1 (the default) changes nothing", () => {
    expect(volume(THREE, 1)).toEqual(volume(THREE));
  });
});

describe("FREQUENCY with runsPerWeek", () => {
  it("the 3-day cycle at 6 days a week is the 3 days listed twice", () => {
    expect(frequency(THREE, 2)).toEqual(frequency(SIX));
  });

  it("rounds exposures DOWN: 3 sessions run 1.5 times are 4 exposures, not 4.5", () => {
    // chest: 3 listed bench days of 4 sets -> 12 sets, 3 exposures. At 1.5 runs: 18 sets (2 required), floor(4.5) = 4.
    const bench3 = program(day("a", "bench", 4), day("b", "bench", 4), day("c", "bench", 4));
    expect(metric(frequency(bench3), "chest")).toBeCloseTo(3 / 2);
    expect(metric(frequency(bench3, 1.5), "chest")).toBeCloseTo(4 / 2);
  });

  it("is float-safe: 3 sessions run 4/3 times are exactly 4 exposures", () => {
    const bench3 = program(day("a", "bench", 4), day("b", "bench", 4), day("c", "bench", 4));
    expect(metric(frequency(bench3, 4 / 3), "chest")).toBeCloseTo(4 / 2); // 16 sets -> 2 required
  });

  it("a runs of 1 (the default) changes nothing", () => {
    expect(frequency(THREE, 1)).toEqual(frequency(THREE));
  });
});

describe("computeAnalysis with context.daysPerWeek", () => {
  const options = { now: () => new Date("2026-01-01T00:00:00Z") };
  const analyse = (s: ProgramStructure, context?: { daysPerWeek?: number }) =>
    computeAnalysis(s, testReferenceData, CONFIG, { ...options, ...(context ? { context } : {}) });

  it("reads the cycle in VOLUME and FREQUENCY and leaves every other axis and the ratios alone", () => {
    const listed = analyse(THREE);
    const cyc = analyse(THREE, { daysPerWeek: 6 });
    const only = (a: ReturnType<typeof analyse>, types: string[]) => a.axisResults.filter((r) => types.includes(r.axisType));
    expect(only(cyc, ["VOLUME", "FREQUENCY"])).toEqual(only(analyse(SIX), ["VOLUME", "FREQUENCY"]));
    expect(only(cyc, ["VOLUME", "FREQUENCY"])).not.toEqual(only(listed, ["VOLUME", "FREQUENCY"]));
    const rest = ["EXERCISE_SELECTION_BALANCE", "PROGRESSION_SOUNDNESS", "RECOVERY_COST"];
    expect(only(cyc, rest)).toEqual(only(listed, rest));
    expect(cyc.ratios).toEqual(listed.ratios);
  });

  it("is byte-identical to no context when daysPerWeek is absent or equals the listed days", () => {
    const base = JSON.stringify(analyse(THREE));
    expect(JSON.stringify(analyse(THREE, {}))).toBe(base);
    expect(JSON.stringify(analyse(THREE, { daysPerWeek: 3 }))).toBe(base);
  });
});
