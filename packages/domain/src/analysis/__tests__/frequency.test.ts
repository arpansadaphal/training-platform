// packages/domain/src/analysis/__tests__/frequency.test.ts
import { describe, expect, it } from "vitest";
import type { ExercisePrescriptionStructure, ProgramStructure, WorkoutDayStructure } from "../../types";
import type { GoalProfileConfig } from "../types";
import { computeFrequencyAxis, requiredExposures } from "../frequency";
import { testReferenceData } from "../__fixtures__/exerciseReferenceData";
import { emptyProgram, fullyCoveredProgram } from "../__fixtures__/programStructures";
import { TEST_CONFIG_ALL_NULL, TEST_CONFIG_BOUNDED } from "../__fixtures__/testGoalProfiles";

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

// bench: chest 1.0, shoulders 0.4 (fixture).
const benchDay = (id: string, sets: number, over: Partial<ExercisePrescriptionStructure> = {}): WorkoutDayStructure => ({
  id,
  orderIndex: 0,
  name: id,
  prescriptions: [
    { id: `${id}-p`, orderIndex: 0, exerciseId: "bench", targetSets: sets, targetRepsLow: 8, targetRepsHigh: 12, loadScheme: { type: "RPE_BASED", rpe: 8 }, ...over },
  ],
});
const days = (...d: WorkoutDayStructure[]): ProgramStructure => ({ workoutDays: d.map((x, i) => ({ ...x, orderIndex: i })) });
const run = (s: ProgramStructure, config = CONFIG) => computeFrequencyAxis(s, testReferenceData, config);
const by = (rs: ReturnType<typeof run>, id: string) => rs.find((r) => r.scopeKey === id)!;

describe("requiredExposures", () => {
  it("is ceil(weekly / cap), at least 1", () => {
    expect(requiredExposures(0, 10)).toBe(1);
    expect(requiredExposures(9.5, 10)).toBe(1);
    expect(requiredExposures(10, 10)).toBe(1);
    expect(requiredExposures(10.5, 10)).toBe(2);
    expect(requiredExposures(31, 10)).toBe(4);
  });
});

describe("computeFrequencyAxis (E6: distribution of the weekly dose)", () => {
  it("12 sets in ONE session is under-distributed: 1 exposure / 2 required = 0.5 -> Low", () => {
    const r = by(run(days(benchDay("d1", 12))), "chest");
    expect(r.metricValue).toBeCloseTo(0.5);
    expect(r.status).toEqual({ kind: "BAND", band: "Low" });
  });

  it("the same 12 sets in two sessions: 2 / 2 = 1 -> Adequate", () => {
    const r = by(run(days(benchDay("d1", 6), benchDay("d2", 6))), "chest");
    expect(r.metricValue).toBeCloseTo(1);
    expect(r.status).toEqual({ kind: "BAND", band: "Adequate" });
  });

  it("10 sets in one session is exactly on the cap: 1 / 1 = 1 -> Adequate (float-safe)", () => {
    const r = by(run(days(benchDay("d1", 10))), "chest");
    expect(r.metricValue).toBeCloseTo(1);
    expect(r.status).toEqual({ kind: "BAND", band: "Adequate" });
  });

  it("10 sets over five sessions of 2: 5 / 1 -> High (informational)", () => {
    const r = by(run(days(...[1, 2, 3, 4, 5].map((n) => benchDay(`d${n}`, 2)))), "chest");
    expect(r.metricValue).toBeCloseTo(5);
    expect(r.status).toEqual({ kind: "BAND", band: "High" });
  });

  it("a session counts as an exposure only at >= 2.0 fractional sets", () => {
    const one = by(run(days(benchDay("d1", 1))), "chest");
    expect(one.metricValue).toBe(0);
    expect(one.status).toEqual({ kind: "BAND", band: "Low" });
    const two = by(run(days(benchDay("d1", 2))), "chest");
    expect(two.metricValue).toBeCloseTo(1);
  });

  it("indirect work below the threshold is not an exposure (replaces the old 'any involvement counts' rule)", () => {
    // 3 bench sets -> shoulders 3 x 0.4 = 1.2 fractional sets (< 2.0)
    const r = by(run(days(benchDay("d1", 3))), "shoulders");
    expect(r.metricValue).toBe(0);
    expect(r.status).toEqual({ kind: "BAND", band: "Low" });
  });

  it("applies hard-set credit: sets at RPE 5 give no dose and no exposure", () => {
    const r = by(run(days(benchDay("d1", 4, { loadScheme: { type: "BODYWEIGHT" }, targetRpe: 5 }))), "chest");
    expect(r.metricValue).toBe(0);
  });

  it("half-credit sets count at half: 4 sets at RPE 6 = 2.0 fractional sets = one exposure", () => {
    const r = by(run(days(benchDay("d1", 4, { loadScheme: { type: "BODYWEIGHT" }, targetRpe: 6 }))), "chest");
    expect(r.metricValue).toBeCloseTo(1);
  });

  it("a muscle with no dose has metric 0 (Low)", () => {
    expect(by(run(emptyProgram), "chest").metricValue).toBe(0);
    expect(by(run(days(benchDay("d1", 3))), "quads").metricValue).toBe(0);
  });

  it("honours config.frequencyDistribution", () => {
    const tight = { ...CONFIG, frequencyDistribution: { perSessionSetCap: 5, minExposureSets: 1 } };
    // 6 sets in one session, cap 5 -> 2 required, 1 exposure -> 0.5
    expect(by(run(days(benchDay("d1", 6)), tight), "chest").metricValue).toBeCloseTo(0.5);
    // 1 set counts as an exposure under minExposureSets 1
    expect(by(run(days(benchDay("d1", 1)), tight), "chest").metricValue).toBeCloseTo(1);
  });

  it("rejects a non-positive per-session cap", () => {
    const bad = { ...CONFIG, frequencyDistribution: { perSessionSetCap: 0, minExposureSets: 2 } };
    expect(() => run(days(benchDay("d1", 3)), bad)).toThrow(/perSessionSetCap/);
  });

  it("returns one result per muscle group", () => {
    const rs = run(fullyCoveredProgram);
    expect(rs.map((r) => r.scopeKey).sort()).toEqual(testReferenceData.muscleGroups.map((m) => m.id).sort());
    for (const r of rs) expect(r.axisType).toBe("FREQUENCY");
  });

  it("returns UNVALIDATED for every muscle group with all-null bands", () => {
    for (const r of run(fullyCoveredProgram, TEST_CONFIG_ALL_NULL)) expect(r.status.kind).toBe("UNVALIDATED");
  });
});