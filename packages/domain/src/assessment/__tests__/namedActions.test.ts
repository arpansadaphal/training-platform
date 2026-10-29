import { describe, expect, it } from "vitest";
import { computeAnalysis } from "../../analysis/computeAnalysis";
import type { ExerciseReferenceData } from "../../analysis/types";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";
import type { ExercisePrescriptionStructure, ProgramStructure } from "../../types";
import { computeAssessment } from "../computeAssessment";
import { nameActions, type NamedAction, type NamedDaySuggestion } from "../namedActions";

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

// AUDIT TRAIL (ARCH-063 / B2, engine 0.5.0). Several tests below used to look an action up by one muscle's key
// (`volume:add-hamstrings`, `volume:add-upper back`, `volume:add-rear delts`). B2 puts the Lows of one body
// region, or of one missing pattern group, into ONE finding with ONE action, so those keys no longer exist:
// hamstrings and glutes now sit under `exerciseSelectionBalance:add-hinge` (no hinge), the upper-body muscles
// under `volume:add-region-upper`. The behaviours the tests guard are unchanged and are asserted on the
// suggestions inside those actions: equipment already in the program, the engine's after-number, the day, no
// exercise named twice, and the template sentence when nothing fits.
const suggestionsOf = (a: NamedAction) => [...(a.suggestion ? [a.suggestion] : []), ...(a.suggestions ?? [])];
const exerciseNamesOf = (a: NamedAction): string[] => [
  ...suggestionsOf(a).map((s) => s.exerciseName),
  ...(a.newDay?.exercises ?? []).map((e) => e.exerciseName),
];

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
    // No hinge in the program: hamstrings and glutes are one finding, so one action with one addition each.
    const a = byKey("exerciseSelectionBalance:add-hinge");
    const ham = a.suggestions?.find((s) => s.muscle === "hamstrings");
    expect(ham?.exerciseName).toBe("Nordic Hamstring Curl");
    expect(exerciseNamesOf(a)).not.toContain("Leg Curl");
    expect(exerciseNamesOf(a)).not.toContain("Romanian Deadlift");
  });

  it("every proposed exercise uses equipment already in the program (or bodyweight)", () => {
    const allowed = new Set(["dumbbell", "bodyweight"]);
    const equipmentOf = new Map(REF.exercises.map((e) => [e.name, e.equipment]));
    for (const a of actions) {
      for (const name of exerciseNamesOf(a)) expect(allowed.has(equipmentOf.get(name) ?? "?"), name).toBe(true);
    }
  });

  it("the after-number equals an independent engine run over the structure with that exercise added", () => {
    let checked = 0;
    for (const a of actions) {
      for (const s of suggestionsOf(a)) {
        const target = structureWithAdded(DUMBBELLS_ONLY, s.workoutDayName, s.exerciseName, s.sets);
        const analysis = computeAnalysis(target, REF, HYPERTROPHY_CONFIG, { now: () => new Date(0) });
        const vol = analysis.axisResults.find((x) => x.axisType === "VOLUME" && x.scopeKey === s.muscle)!;
        expect(vol.metricValue).toBe(s.afterSets);
        expect(s.afterSets).toBeGreaterThan(s.beforeSets);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("states the Adequate start when the addition alone is not enough", () => {
    const a = actions.find((x) => x.suggestion && x.suggestion.afterSets < 6);
    if (a) expect(a.description).toMatch(/The Adequate range starts at 6\./);
  });

  it("never proposes the same exercise twice in one list", () => {
    const names = actions.flatMap(exerciseNamesOf);
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
    const upper = actions.find((a) => a.rootCauseKey === "volume:add-region-upper");
    const back = upper?.suggestions?.find((s) => s.muscle === "upper back");
    expect(back?.exerciseName).toBe("Rear Delt Fly");
    expect(back?.workoutDayName).toBe("Upper");
    const lower = actions.find((a) => a.rootCauseKey === "volume:add-region-lower");
    const ham = lower?.suggestions?.find((s) => s.muscle === "hamstrings");
    expect(ham?.workoutDayName).toBe("Lower");
  });

  it("does not name the same exercise for a second muscle (Rear Delt Fly went to upper back first)", () => {
    const structure: ProgramStructure = {
      workoutDays: [day("u", "Upper", [rx("Dumbbell Bench Press", 3), rx("Dumbbell Row", 3)])],
    };
    const { actions } = named(structure);
    const upper = actions.find((a) => a.rootCauseKey === "volume:add-region-upper")!;
    const flies = (upper.suggestions ?? []).filter((s) => s.exerciseName === "Rear Delt Fly");
    expect(flies).toHaveLength(1);
    expect(flies[0]!.muscle).toBe("upper back");
    // The muscle that lost the exercise is said plainly, not given a second, contradictory number.
    expect(upper.description).toMatch(/Add weekly volume for rear delts/);
  });

  it("keeps the template sentence when nothing fits the equipment", () => {
    // Only a barbell squat: no preferred biceps or triceps exercise uses a barbell in this small library, and
    // the arms are at 0 sets, so the action is the arms region's template.
    const structure: ProgramStructure = { workoutDays: [day("d", "A", [rx("Back Squat", 3)])] };
    const { assessment, actions } = named(structure);
    const arms = actions.find((a) => a.rootCauseKey === "volume:add-region-arms")!;
    expect(arms.suggestion).toBeUndefined();
    expect(arms.suggestions).toBeUndefined();
    expect(arms.newDay).toBeUndefined();
    expect(arms.description).toBe(
      assessment.actions.find((a) => a.rootCauseKey === "volume:add-region-arms")!.description,
    );
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

// A program with no lower-body work at all (the Exercise selection gaps are squat, hinge and vertical push).
const NO_LEGS: ProgramStructure = {
  workoutDays: [
    day("u1", "Up1", [rx("Dumbbell Bench Press", 3), rx("Dumbbell Row", 3), rx("Dumbbell Curl", 3), rx("Lateral Raise", 3), rx("Rear Delt Fly", 3), rx("Tricep Kickback", 3)]),
    day("u2", "Up2", [rx("Dumbbell Bench Press", 3), rx("Dumbbell Row", 3)]),
  ],
};

function structureWithDay(base: ProgramStructure, d: NamedDaySuggestion): ProgramStructure {
  return {
    workoutDays: [
      ...base.workoutDays,
      day("independent-day", d.dayName, d.exercises.map((e, i) => rx(e.exerciseName, e.sets, `independent-${i}`))),
    ],
  };
}

describe("nameActions: consolidated findings (ARCH-063 / B2)", () => {
  const { assessment, actions } = named(NO_LEGS);
  const lower = actions.find((a) => a.rootCauseKey === "volume:add-region-lower")!;

  it("a region with no training at all gets one action: a new day", () => {
    expect(assessment.findings![0]!.key).toBe("region:lower");
    expect(lower.newDay).toBeDefined();
    expect(lower.description).toMatch(/^Add a lower-body day: 3 sets of /);
    expect(lower.newDay!.exercises.length).toBeGreaterThan(1);
  });

  it("the new day's after-numbers equal an independent engine run over the structure with that day added", () => {
    const day = lower.newDay!;
    const analysis = computeAnalysis(structureWithDay(NO_LEGS, day), REF, HYPERTROPHY_CONFIG, { now: () => new Date(0) });
    for (const { muscle, afterSets } of day.afterSets) {
      const vol = analysis.axisResults.find((x) => x.axisType === "VOLUME" && x.scopeKey === muscle)!;
      expect(vol.metricValue).toBe(afterSets);
      expect(afterSets).toBeGreaterThan(0);
    }
  });

  it("says plainly which muscles the new day does not raise, and where the Adequate range starts", () => {
    // The small library has no calf machine in this program, so calves cannot be named.
    expect(lower.description).toMatch(/Add weekly volume for calves\./);
    expect(lower.newDay!.afterSets.map((a) => a.muscle)).not.toContain("calves");
    expect(lower.description).toMatch(/The Adequate range starts at 6\./);
  });

  it("a multi-muscle sentence says which muscle each number belongs to", () => {
    const { actions: acts } = named(DUMBBELLS_ONLY);
    const hinge = acts.find((a) => a.rootCauseKey === "exerciseSelectionBalance:add-hinge")!;
    expect(hinge.description).toMatch(/→ hamstrings \d/);
    expect(hinge.description).toMatch(/→ glutes \d/);
  });

  it("a pattern finding led by the Exercise-selection axis keeps its template sentence", () => {
    const gaps = actions.find((a) => a.rootCauseKey === "exerciseSelectionBalance:fill-gaps")!;
    expect(gaps.suggestion).toBeUndefined();
    expect(gaps.suggestions).toBeUndefined();
    expect(gaps.newDay).toBeUndefined();
    expect(gaps.description).toMatch(/^Add an overhead or shoulder press/);
  });

  it("the copy passes the forbidden-copy lint", () => {
    assertCleanCopy(actions.map((a) => a.description));
  });

  it("is deterministic", () => {
    expect(JSON.stringify(named(NO_LEGS).actions)).toBe(JSON.stringify(named(NO_LEGS).actions));
  });
});

function structureWithAdded(base: ProgramStructure, dayName: string, exerciseName: string, sets: number): ProgramStructure {
  return {
    workoutDays: base.workoutDays.map((d) =>
      d.name === dayName ? { ...d, prescriptions: [...d.prescriptions, rx(exerciseName, sets, "added")] } : d,
    ),
  };
}
