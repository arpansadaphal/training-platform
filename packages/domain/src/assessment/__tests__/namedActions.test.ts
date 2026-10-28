import { describe, expect, it } from "vitest";
import { computeAnalysis } from "../../analysis/computeAnalysis";
import type { ExerciseReferenceData } from "../../analysis/types";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";
import type { ExercisePrescriptionStructure, ProgramStructure } from "../../types";
import { computeAssessment } from "../computeAssessment";
import { nameActions } from "../namedActions";

// A small library with the real names, equipment and 1.0 / 0.5 involvement convention. Ids are the names.
const MUSCLES = ["chest", "lats", "upper back", "side delts", "rear delts", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves"];
const EX: Array<[string, string, string, Record<string, number>]> = [
  ["Dumbbell Bench Press", "HORIZONTAL_PUSH", "dumbbell", { chest: 1, triceps: 0.5 }],
  ["Dumbbell Row", "HORIZONTAL_PULL", "dumbbell", { lats: 1, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 }],
  ["Goblet Squat", "SQUAT", "dumbbell", { quads: 1, glutes: 0.5 }],
  ["Dumbbell Curl", "ISOLATION", "dumbbell", { biceps: 1 }],
  ["Tricep Kickback", "ISOLATION", "dumbbell", { triceps: 1 }],
  ["Tricep Pushdown", "ISOLATION", "cable", { triceps: 1 }],
  ["Lateral Raise", "ISOLATION", "dumbbell", { "side delts": 1 }],
  ["Rear Delt Fly", "ISOLATION", "dumbbell", { "rear delts": 1, "upper back": 0.5 }],
  ["Leg Curl", "ISOLATION", "machine", { hamstrings: 1 }],
  ["Romanian Deadlift", "HINGE", "barbell", { hamstrings: 1, glutes: 0.5 }],
  ["Nordic Hamstring Curl", "ISOLATION", "bodyweight", { hamstrings: 1 }],
  ["Glute Bridge", "HINGE", "bodyweight", { glutes: 1, hamstrings: 0.5 }],
  ["Standing Calf Raise", "ISOLATION", "machine", { calves: 1 }],
  ["Back Squat", "SQUAT", "barbell", { quads: 1, glutes: 0.5 }],
];
const REF: ExerciseReferenceData = {
  exercises: EX.map(([name, movementPattern, equipment]) => ({ id: name, name, movementPattern: movementPattern as never, equipment })),
  muscleGroups: MUSCLES.map((m) => ({ id: m, name: m })),
  involvements: EX.flatMap(([name, , , inv]) => Object.entries(inv).map(([m, f]) => ({ exerciseId: name, muscleGroupId: m, involvementFactor: f }))),
};

const rx = (exerciseId: string, sets: number, id = `${exerciseId}-${sets}`): ExercisePrescriptionStructure => ({
  id, orderIndex: 0, exerciseId, targetSets: sets, targetRepsLow: 8, targetRepsHigh: 12, targetRpe: 8,
  loadScheme: { type: "RPE_BASED", rpe: 8 },
});
const day = (id: string, name: string, rows: ExercisePrescriptionStructure[]) => ({ id, orderIndex: 0, name, prescriptions: rows });

// Dumbbells and a bodyweight bridge only. No bar, no cable, no machine.
const DUMBBELLS_ONLY: ProgramStructure = {
  workoutDays: [
    day("d1", "Day 1", [rx("Goblet Squat", 3), rx("Dumbbell Bench Press", 3), rx("Dumbbell Row", 3)]),
    day("d2", "Day 2", [rx("Goblet Squat", 3), rx("Dumbbell Bench Press", 3), rx("Dumbbell Row", 3), rx("Dumbbell Curl", 3)]),
  ],
};

function named(structure: ProgramStructure) {
  const analysis = computeAnalysis(structure, REF, HYPERTROPHY_CONFIG, { now: () => new Date(0) });
  const { assessment } = computeAssessment(analysis, HYPERTROPHY_CONFIG, { goalId: "g" });
  return { assessment, actions: nameActions(assessment, structure, REF, HYPERTROPHY_CONFIG) };
}

describe("nameActions: dumbbells only", () => {
  const { assessment, actions } = named(DUMBBELLS_ONLY);
  const byKey = (k: string) => actions.find((a) => a.rootCauseKey === k)!;

  it("returns one entry per assessment action, in order", () => {
    expect(actions.map((a) => a.rootCauseKey)).toEqual(assessment.actions.map((a) => a.rootCauseKey));
  });

  it("names a dumbbell exercise for triceps, never the cable pushdown", () => {
    const a = byKey("volume:add-triceps");
    expect(a.suggestion?.exerciseName).toBe("Tricep Kickback");
    expect(a.description).toMatch(/^Add \d sets of Tricep Kickback on Day \d → [\d.]+ sets\/week\./);
    expect(a.description).not.toMatch(/Pushdown/);
  });

  it("names a bodyweight exercise when no machine or bar is in the program", () => {
    const a = byKey("volume:add-hamstrings");
    expect(["Nordic Hamstring Curl"]).toContain(a.suggestion?.exerciseName);
    expect(a.suggestion?.exerciseName).not.toBe("Leg Curl");
    expect(a.suggestion?.exerciseName).not.toBe("Romanian Deadlift");
  });

  it("every proposed exercise uses equipment already in the program (or bodyweight)", () => {
    const allowed = new Set(["dumbbell", "bodyweight"]);
    const equipmentOf = new Map(REF.exercises.map((e) => [e.name, e.equipment]));
    for (const a of actions) {
      if (a.suggestion) expect(allowed.has(equipmentOf.get(a.suggestion.exerciseName) ?? "?")).toBe(true);
    }
  });

  it("the after-number equals an independent engine run over the structure with that exercise added", () => {
    for (const a of actions) {
      const s = a.suggestion;
      if (!s) continue;
      const target = structureWithAdded(DUMBBELLS_ONLY, s.workoutDayName, s.exerciseName, s.sets);
      const analysis = computeAnalysis(target, REF, HYPERTROPHY_CONFIG, { now: () => new Date(0) });
      const vol = analysis.axisResults.find((x) => x.axisType === "VOLUME" && x.scopeKey === s.muscle)!;
      expect(vol.metricValue).toBe(s.afterSets);
      expect(s.afterSets).toBeGreaterThan(s.beforeSets);
    }
  });

  it("states the Adequate start when the addition alone is not enough", () => {
    const a = actions.find((x) => x.suggestion && x.suggestion.afterSets < 6);
    if (a) expect(a.description).toMatch(/The Adequate range starts at 6\./);
  });

  it("never proposes the same exercise twice in one list", () => {
    const names = actions.filter((a) => a.suggestion).map((a) => a.suggestion!.exerciseName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("copy passes the forbidden-copy lint", () => {
    assertCleanCopy(actions.map((a) => a.description));
  });
});

describe("nameActions: placement and fallback", () => {
  it("puts a leg exercise on the lower-body day and an upper one on the upper-body day", () => {
    const structure: ProgramStructure = {
      workoutDays: [
        day("u", "Upper", [rx("Dumbbell Bench Press", 3), rx("Dumbbell Row", 3), rx("Dumbbell Curl", 3)]),
        day("l", "Lower", [rx("Goblet Squat", 3), rx("Romanian Deadlift", 3), rx("Standing Calf Raise", 3), rx("Glute Bridge", 3)]),
        day("x", "Short", [rx("Dumbbell Bench Press", 1)]),
      ],
    };
    const { actions } = named(structure);
    const back = actions.find((a) => a.rootCauseKey === "volume:add-upper back");
    expect(back?.suggestion?.exerciseName).toBe("Rear Delt Fly");
    expect(back?.suggestion?.workoutDayName).toBe("Upper");
    const ham = actions.find((a) => a.rootCauseKey === "volume:add-hamstrings");
    expect(ham?.suggestion?.workoutDayName).toBe("Lower");
  });

  it("does not name the same exercise for a second muscle (Rear Delt Fly went to upper back first)", () => {
    const structure: ProgramStructure = {
      workoutDays: [day("u", "Upper", [rx("Dumbbell Bench Press", 3), rx("Dumbbell Row", 3)])],
    };
    const { actions } = named(structure);
    const rear = actions.find((a) => a.rootCauseKey === "volume:add-rear delts");
    expect(rear?.suggestion).toBeUndefined();
    expect(rear?.description).toBe("Add weekly volume for rear delts.");
  });

  it("keeps the template sentence when nothing fits the equipment", () => {
    // Only a barbell squat: no preferred triceps exercise uses a barbell except Skull Crusher/Close-Grip,
    // which are not in this small library.
    const structure: ProgramStructure = { workoutDays: [day("d", "A", [rx("Back Squat", 3)])] };
    const { assessment, actions } = named(structure);
    const tri = actions.find((a) => a.rootCauseKey === "volume:add-triceps")!;
    expect(tri.suggestion).toBeUndefined();
    expect(tri.description).toBe(assessment.actions.find((a) => a.rootCauseKey === "volume:add-triceps")!.description);
  });

  it("leaves non-volume actions exactly as the template wrote them", () => {
    const structure: ProgramStructure = { workoutDays: [day("d", "A", [rx("Back Squat", 3)])] };
    const { assessment, actions } = named(structure);
    assessment.actions.forEach((a, i) => {
      if (a.relatedAxis.axisType !== "VOLUME") expect(actions[i]!.description).toBe(a.description);
    });
  });

  it("is deterministic", () => {
    expect(JSON.stringify(named(DUMBBELLS_ONLY).actions)).toBe(JSON.stringify(named(DUMBBELLS_ONLY).actions));
  });
});

function structureWithAdded(base: ProgramStructure, dayName: string, exerciseName: string, sets: number): ProgramStructure {
  return {
    workoutDays: base.workoutDays.map((d) =>
      d.name === dayName ? { ...d, prescriptions: [...d.prescriptions, rx(exerciseName, sets, "added")] } : d,
    ),
  };
}
