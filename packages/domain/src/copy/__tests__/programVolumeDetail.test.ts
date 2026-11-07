import { describe, expect, it } from "vitest";
import { computeAnalysis } from "../../analysis/computeAnalysis";
import type { ExerciseReferenceData } from "../../analysis/types";
import { computeAssessment } from "../../assessment/computeAssessment";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";
import type { ExercisePrescriptionStructure, ProgramStructure } from "../../types";
import { programVolumeDetail } from "../programVolumeDetail";

// ARCH-065 / Fix 3a. The whole-program finding says "24 hard sets across the body"; this is the sentence that says
// which muscles are behind it. A small library with the real 1.0 / 0.5 involvement convention; ids are the names.
const MUSCLES = ["chest", "lats", "upper back", "side delts", "rear delts", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves"];
const EX: Array<[string, string, string, Record<string, number>]> = [
  ["Barbell Bench Press", "HORIZONTAL_PUSH", "barbell", { chest: 1, triceps: 0.5 }],
  ["Overhead Press", "VERTICAL_PUSH", "barbell", { "side delts": 0.5, triceps: 0.5 }],
  ["Tricep Pushdown", "ISOLATION", "cable", { triceps: 1 }],
  ["Barbell Row", "HORIZONTAL_PULL", "barbell", { lats: 1, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 }],
  ["Pull-Up", "VERTICAL_PULL", "bodyweight", { lats: 1, biceps: 0.5 }],
  ["Barbell Curl", "ISOLATION", "barbell", { biceps: 1 }],
  ["Back Squat", "SQUAT", "barbell", { quads: 1, glutes: 0.5 }],
  ["Romanian Deadlift", "HINGE", "barbell", { hamstrings: 1, glutes: 0.5 }],
];
const REF: ExerciseReferenceData = {
  exercises: EX.map(([name, movementPattern, equipment]) => ({ id: name, name, movementPattern: movementPattern as never, equipment })),
  muscleGroups: MUSCLES.map((m) => ({ id: m, name: m })),
  involvements: EX.flatMap(([name, , , inv]) => Object.entries(inv).map(([m, f]) => ({ exerciseId: name, muscleGroupId: m, involvementFactor: f }))),
};
const rx = (exerciseId: string, sets: number): ExercisePrescriptionStructure => ({
  id: `${exerciseId}-${sets}`, orderIndex: 0, exerciseId, targetSets: sets, targetRepsLow: 8, targetRepsHigh: 12, targetRpe: 8,
  loadScheme: { type: "RPE_BASED", rpe: 8 },
});
const day = (id: string, name: string, rows: ExercisePrescriptionStructure[]) => ({ id, orderIndex: 0, name, prescriptions: rows });

const assess = (structure: ProgramStructure) => {
  const analysis = computeAnalysis(structure, REF, HYPERTROPHY_CONFIG, { now: () => new Date(0) });
  return computeAssessment(analysis, HYPERTROPHY_CONFIG, { goalId: "g" }).assessment;
};

// Push / Pull / Legs once: 24 sets, under the 40-set floor. By hand: chest 3 (bench), quads 3 (squat), hamstrings 3
// (RDL), glutes 3 (0.5 x 6), side delts 1.5 (OHP at 0.5), rear delts 1.5 and upper back 1.5 (rows at 0.5), calves 0.
// Biceps and triceps are 6 (inside the range) and lats 6, so they are not named.
const PPL_ONCE: ProgramStructure = {
  workoutDays: [
    day("push", "Push", [rx("Barbell Bench Press", 3), rx("Overhead Press", 3), rx("Tricep Pushdown", 3)]),
    day("pull", "Pull", [rx("Barbell Row", 3), rx("Pull-Up", 3), rx("Barbell Curl", 3)]),
    day("legs", "Legs", [rx("Back Squat", 3), rx("Romanian Deadlift", 3)]),
  ],
};

describe("programVolumeDetail", () => {
  it("names the muscles behind 'under-dosed overall', grouped by how many sets they get", () => {
    const text = programVolumeDetail(assess(PPL_ONCE), HYPERTROPHY_CONFIG)!;
    expect(text).toMatch(/^Quads, chest, hamstrings and glutes get 3 hard sets a week; /);
    expect(text).toMatch(/; upper back, side delts and rear delts 1\.5; calves 0\./);
  });

  it("says no muscle gets 2+ hard sets on more than one day, when that is what the engine measured", () => {
    const assessment = assess(PPL_ONCE);
    const frequencies = assessment.allAssessedAxes.filter((a) => a.axisType === "FREQUENCY" && typeof a.metricValue === "number");
    expect(frequencies.every((a) => (a.metricValue as number) <= 1)).toBe(true);
    expect(programVolumeDetail(assessment, HYPERTROPHY_CONFIG)).toMatch(/ No muscle gets 2 or more hard sets on more than one day\.$/);
  });

  it("leaves the frequency clause out when a muscle is trained on more than one day", () => {
    const fullBody = (id: string) => day(id, "Full body", [rx("Barbell Bench Press", 3), rx("Barbell Row", 3), rx("Back Squat", 3)]);
    const text = programVolumeDetail(assess({ workoutDays: [fullBody("a"), fullBody("b"), fullBody("c")] }), HYPERTROPHY_CONFIG);
    expect(text).not.toBeNull();
    expect(text).not.toMatch(/more than one day/);
  });

  it("is null when there is no whole-program finding", () => {
    const big = (id: string, name: string) =>
      day(id, name, [
        rx("Barbell Bench Press", 6), rx("Overhead Press", 4), rx("Tricep Pushdown", 4), rx("Barbell Row", 6),
        rx("Pull-Up", 4), rx("Barbell Curl", 4), rx("Back Squat", 6), rx("Romanian Deadlift", 4),
      ]);
    const assessment = assess({ workoutDays: [big("a", "A"), big("b", "B")] });
    expect(assessment.findings?.some((f) => f.lead.scopeKey === "total-volume")).toBe(false);
    expect(programVolumeDetail(assessment, HYPERTROPHY_CONFIG)).toBeNull();
  });

  it("passes the forbidden-copy lint", () => {
    assertCleanCopy([programVolumeDetail(assess(PPL_ONCE), HYPERTROPHY_CONFIG)!]);
  });
});
