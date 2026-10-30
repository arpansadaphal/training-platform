import { describe, expect, it } from "vitest";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import { computeAssessment } from "../../assessment/computeAssessment";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";
import { RATIO_TIER_NOTE, ratioLines } from "../../copy/ratioLines";
import type { ExercisePrescriptionStructure, ProgramStructure } from "../../types";
import { computeAnalysis } from "../computeAnalysis";
import { computeCrossMuscleRatios } from "../ratios";
import type { AnalysisContext, ExerciseReferenceData } from "../types";

const MUSCLES = ["chest", "lats", "upper back", "side delts", "rear delts", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves"];
const EX: Array<[string, string, string, Record<string, number>]> = [
  ["Barbell Bench Press", "HORIZONTAL_PUSH", "barbell", { chest: 1, triceps: 0.5 }],
  ["Overhead Press", "VERTICAL_PUSH", "barbell", { "side delts": 0.5, triceps: 0.5 }], // front delts (its primary) are not a scoped group
  ["Barbell Row", "HORIZONTAL_PULL", "barbell", { lats: 1, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 }],
  ["Lat Pulldown", "VERTICAL_PULL", "cable", { lats: 1, "upper back": 0.5, biceps: 0.5 }],
  ["Barbell Curl", "ISOLATION", "barbell", { biceps: 1 }],
  ["Tricep Pushdown", "ISOLATION", "cable", { triceps: 1 }],
  ["Lateral Raise", "ISOLATION", "dumbbell", { "side delts": 1 }],
  ["Back Squat", "SQUAT", "barbell", { quads: 1, glutes: 0.5 }],
  ["Romanian Deadlift", "HINGE", "barbell", { hamstrings: 1, glutes: 0.5 }],
  ["Standing Calf Raise", "ISOLATION", "machine", { calves: 1 }],
];
const REF: ExerciseReferenceData = {
  exercises: EX.map(([name, movementPattern, equipment]) => ({ id: name, name, movementPattern: movementPattern as never, equipment })),
  muscleGroups: MUSCLES.map((m) => ({ id: m, name: m })),
  involvements: EX.flatMap(([name, , , inv]) => Object.entries(inv).map(([m, f]) => ({ exerciseId: name, muscleGroupId: m, involvementFactor: f }))),
};
const rx = (exerciseId: string, sets: number, rpe: number | undefined = 8): ExercisePrescriptionStructure => ({
  id: `${exerciseId}-${sets}`, orderIndex: 0, exerciseId, targetSets: sets, targetRepsLow: 8, targetRepsHigh: 12,
  ...(rpe === undefined ? {} : { targetRpe: rpe }),
  loadScheme: { type: "RPE_BASED", rpe: rpe ?? 8 },
});
const program = (...rows: ExercisePrescriptionStructure[]): ProgramStructure => ({
  workoutDays: [{ id: "d", orderIndex: 0, name: "D", prescriptions: rows }],
});
const ratios = (p: ProgramStructure) => computeCrossMuscleRatios(p, REF, HYPERTROPHY_CONFIG);

describe("computeCrossMuscleRatios", () => {
  it("reads equal bench and row sets as 1 to 1 (a set is counted once, not once per muscle it works)", () => {
    const r = ratios(program(rx("Barbell Bench Press", 4), rx("Barbell Row", 4)));
    expect(r.pushPull).toEqual({ pushSets: 4, pullSets: 4, ratio: 1 });
  });

  it("recognises a vertical press by its movement pattern", () => {
    expect(ratios(program(rx("Overhead Press", 3), rx("Lat Pulldown", 3))).pushPull).toEqual({ pushSets: 3, pullSets: 3, ratio: 1 });
  });

  it("puts triceps work on the push side and biceps work on the pull side, and in arms", () => {
    const r = ratios(program(rx("Tricep Pushdown", 3), rx("Barbell Curl", 2), rx("Back Squat", 5)));
    expect(r.pushPull).toEqual({ pushSets: 3, pullSets: 2, ratio: 1.5 });
    expect(r.armsLegs).toEqual({ armSets: 5, legSets: 5, ratio: 1 });
  });

  it("counts quads and hamstrings by primary mover only", () => {
    const r = ratios(program(rx("Back Squat", 6), rx("Romanian Deadlift", 3)));
    expect(r.quadsHamstrings).toEqual({ quadSets: 6, hamstringSets: 3, ratio: 2 });
  });

  it("returns a null ratio, with the totals, when the second side is zero", () => {
    const r = ratios(program(rx("Barbell Bench Press", 5)));
    expect(r.pushPull).toEqual({ pushSets: 5, pullSets: 0, ratio: null });
  });

  it("returns null for a pair when both sides are zero", () => {
    const r = ratios(program(rx("Barbell Bench Press", 5)));
    expect(r.quadsHamstrings).toBeNull();
    expect(r.armsLegs).toBeNull();
  });

  it("applies the hard-set effort credit: sets at RIR 5 or more count for nothing", () => {
    const r = ratios(program(rx("Barbell Bench Press", 4, 5), rx("Barbell Row", 4)));
    expect(r.pushPull).toEqual({ pushSets: 0, pullSets: 4, ratio: 0 });
  });

  it("travels on the Analysis and the Assessment, and changes no band, severity or leverage", () => {
    const p = program(rx("Barbell Bench Press", 4), rx("Barbell Row", 4), rx("Back Squat", 3));
    const analysis = computeAnalysis(p, REF, HYPERTROPHY_CONFIG, { now: () => new Date(0) });
    expect(analysis.ratios).toEqual(ratios(p));
    const { assessment } = computeAssessment(analysis, HYPERTROPHY_CONFIG, { goalId: "g" });
    expect(assessment.ratios).toEqual(analysis.ratios);
    const stripped = { ...analysis, ratios: undefined };
    const a2 = computeAssessment(stripped, HYPERTROPHY_CONFIG, { goalId: "g" }).assessment;
    expect(JSON.stringify(a2.allAssessedAxes)).toBe(JSON.stringify(assessment.allAssessedAxes));
    expect(a2.ratios).toBeUndefined();
  });
});

describe("AnalysisContext", () => {
  const p = program(rx("Barbell Bench Press", 4), rx("Barbell Row", 3), rx("Back Squat", 3), rx("Lateral Raise", 2));
  const options = { now: () => new Date("2026-01-01T00:00:00Z") };
  // daysPerWeek is read since Session C1 (runsPerWeek.ts, tested in runsPerWeek.test.ts), so a value that differs from
  // the listed days is no longer inert. Here it equals them; the other three fields are still read by nothing.
  const full: AnalysisContext = {
    daysPerWeek: p.workoutDays.length,
    trainingAgeMonths: 18,
    equipment: "home_dumbbells",
    minutesPerSession: 45,
  };

  it("leaves the whole Analysis and Assessment byte-identical whether context is undefined, empty or full", () => {
    const base = computeAnalysis(p, REF, HYPERTROPHY_CONFIG, options);
    const baseAssessment = computeAssessment(base, HYPERTROPHY_CONFIG, { goalId: "g" });
    for (const context of [undefined, {}, full]) {
      const a = computeAnalysis(p, REF, HYPERTROPHY_CONFIG, { ...options, context });
      expect(JSON.stringify(a)).toBe(JSON.stringify(base));
      expect(JSON.stringify(computeAssessment(a, HYPERTROPHY_CONFIG, { goalId: "g" }))).toBe(JSON.stringify(baseAssessment));
    }
  });
});

describe("ratioLines", () => {
  it("states totals and the ratio, in a fixed order", () => {
    const lines = ratioLines({
      pushPull: { pushSets: 15, pullSets: 6, ratio: 2.5 },
      armsLegs: { armSets: 12, legSets: 24, ratio: 0.5 },
      quadsHamstrings: { quadSets: 9, hamstringSets: 3, ratio: 3 },
    });
    expect(lines).toEqual([
      "You press 15 hard sets a week and pull 6 hard sets a week (2.5 to 1).",
      "Your arms get 12 hard sets a week and your legs get 24 hard sets a week (1 to 2).",
      "Your quads get 9 hard sets a week and your hamstrings get 3 hard sets a week (3 to 1).",
    ]);
  });

  it("says 'none' plainly and handles a missing or empty ratio set", () => {
    expect(ratioLines({ pushPull: { pushSets: 6, pullSets: 0, ratio: null }, armsLegs: null, quadsHamstrings: null })).toEqual([
      "You press 6 hard sets a week and pull none.",
    ]);
    expect(ratioLines({ pushPull: null, armsLegs: { armSets: 0, legSets: 8, ratio: null }, quadsHamstrings: null })).toEqual([
      "Your arms get none, and your legs get 8 hard sets a week.",
    ]);
    expect(ratioLines(undefined)).toEqual([]);
  });

  it("passes the forbidden-copy lint, including the tier note, and makes no diagnosis or outcome claim", () => {
    const lines = ratioLines({
      pushPull: { pushSets: 22, pullSets: 6, ratio: 3.7 },
      armsLegs: { armSets: 30, legSets: 10, ratio: 3 },
      quadsHamstrings: { quadSets: 12, hamstringSets: 0, ratio: null },
    });
    assertCleanCopy([...lines, RATIO_TIER_NOTE]);
    for (const l of lines) expect(l).not.toMatch(/shoulder|posture|imbalance|risk|should|too (much|little)/i);
  });
});
