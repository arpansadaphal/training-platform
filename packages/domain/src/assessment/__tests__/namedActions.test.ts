import { describe, expect, it } from "vitest";
import { computeAnalysis } from "../../analysis/computeAnalysis";
import type { ExerciseReferenceData } from "../../analysis/types";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";
import type { ExercisePrescriptionStructure, ProgramStructure } from "../../types";
import { computeAssessment } from "../computeAssessment";
import { nameActions, type NamedAction, type NamedDaySuggestion } from "../namedActions";

// AUDIT TRAIL (ARCH-063 / Session D, engine 0.6.0). These programs are a few dozen sets, under the PROGRAM_STRUCTURE
// total-volume floor (40), so with the full profile one "under-dosed overall" finding absorbs their per-muscle Lows
// and there is no per-muscle action left to name. What these tests guard (equipment, the engine's after-number, the
// day, no exercise named twice, the template fallback) is independent of that rule, so they run against the same
// profile without `programStructure`. The program-level action itself is tested in programStructure.test.ts.
const PER_MUSCLE_CONFIG = { ...HYPERTROPHY_CONFIG, programStructure: undefined };

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
  const analysis = computeAnalysis(structure, REF, PER_MUSCLE_CONFIG, { now: () => new Date(0) });
  const { assessment } = computeAssessment(analysis, PER_MUSCLE_CONFIG, { goalId: "g" });
  return { assessment, actions: nameActions(assessment, structure, REF, PER_MUSCLE_CONFIG) };
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
        const target = structureWithAdded(DUMBBELLS_ONLY, s.workoutDayName, s.exerciseName, s.sets, s.alsoOn);
        const analysis = computeAnalysis(target, REF, PER_MUSCLE_CONFIG, { now: () => new Date(0) });
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
    // AUDIT TRAIL (ARCH-065 / Fix 1). This used to assert upper back is named with Rear Delt Fly. Upper back is a
    // half-credit muscle here and the capped addition (6 sets, 3 credited) would end under 6, so it is no longer
    // named: the line says "Add weekly volume for upper back" instead. The placement rule the test guards is
    // unchanged and is asserted on rear delts, which the same exercise serves at full credit.
    const upper = actions.find((a) => a.rootCauseKey === "volume:add-region-upper");
    const rear = upper?.suggestions?.find((s) => s.muscle === "rear delts");
    expect(rear?.exerciseName).toBe("Rear Delt Fly");
    expect(rear?.workoutDayName).toBe("Upper");
    const lower = actions.find((a) => a.rootCauseKey === "volume:add-region-lower");
    const ham = lower?.suggestions?.find((s) => s.muscle === "hamstrings");
    expect(ham?.workoutDayName).toBe("Lower");
  });

  it("names an exercise once: it goes to the muscle it serves at full credit, and the half-credit muscle is said plainly", () => {
    // AUDIT TRAIL (ARCH-065 / Fix 1). Before, Rear Delt Fly went to upper back first (priority order) and rear delts
    // lost it. Upper back is now only named when the capped addition reaches the range, so the fly goes to rear
    // delts and upper back is told as "Add weekly volume for upper back". One exercise, one muscle, still holds.
    const structure: ProgramStructure = {
      workoutDays: [day("u", "Upper", [rx("Dumbbell Bench Press", 3), rx("Dumbbell Row", 3)])],
    };
    const { actions } = named(structure);
    const upper = actions.find((a) => a.rootCauseKey === "volume:add-region-upper")!;
    const flies = (upper.suggestions ?? []).filter((s) => s.exerciseName === "Rear Delt Fly");
    expect(flies).toHaveLength(1);
    expect(flies[0]!.muscle).toBe("rear delts");
    expect(upper.description).toMatch(/Add weekly volume for upper back/);
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
    const analysis = computeAnalysis(structureWithDay(NO_LEGS, day), REF, PER_MUSCLE_CONFIG, { now: () => new Date(0) });
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

function structureWithAdded(
  base: ProgramStructure,
  dayName: string,
  exerciseName: string,
  sets: number,
  alsoOn?: { workoutDayName: string; sets: number },
): ProgramStructure {
  return {
    workoutDays: base.workoutDays.map((d) => {
      if (d.name === dayName) return { ...d, prescriptions: [...d.prescriptions, rx(exerciseName, sets, "added")] };
      if (alsoOn && d.name === alsoOn.workoutDayName) {
        return { ...d, prescriptions: [...d.prescriptions, rx(exerciseName, alsoOn.sets, "added-too")] };
      }
      return d;
    }),
  };
}

// ARCH-063 / Session D follow-up. The whole-program volume finding replaces the per-muscle Lows with ONE action; that
// action now names the two largest deficits, so an under-dosed program still hears "Add 3 sets of Leg Curl on Day 2",
// not only "you are under-dosed". These run against the FULL profile (with `programStructure`), unlike the rest of
// this file.
describe("nameActions: the whole-program volume action names the largest deficits", () => {
  const analysis = computeAnalysis(DUMBBELLS_ONLY, REF, HYPERTROPHY_CONFIG, { now: () => new Date(0) });
  const { assessment } = computeAssessment(analysis, HYPERTROPHY_CONFIG, { goalId: "g" });
  const actions = nameActions(assessment, DUMBBELLS_ONLY, REF, HYPERTROPHY_CONFIG);
  const program = actions.find((a) => a.rootCauseKey === "programStructure:add-volume")!;

  it("is still ONE finding and ONE action", () => {
    expect(assessment.findings?.map((f) => f.key)).toContain("PROGRAM_STRUCTURE:total-volume");
    expect(assessment.actions.filter((a) => a.rootCauseKey === "programStructure:add-volume")).toHaveLength(1);
    expect(actions).toHaveLength(assessment.actions.length);
  });

  it("names two exercises, each with the engine's after-number for the muscle it raises", () => {
    // AUDIT TRAIL (ARCH-065 / Fix 2): the "Start with:" prefix is gone (it read as an order across actions; the
    // display now labels each action with the finding it fixes).
    expect(program.description).toMatch(/^Add \d sets? of .+ on Day \d → [\w ]+ [\d.]+ sets\/week\./);
    expect(program.description).not.toMatch(/Start with/);
    expect(program.suggestions).toHaveLength(2);
    const [a, b] = program.suggestions!;
    expect(a!.exerciseName).not.toBe(b!.exerciseName);
    expect(a!.muscle).not.toBe(b!.muscle);
    for (const s of program.suggestions!) expect(s.afterSets).toBeGreaterThan(s.beforeSets);
  });

  it("names only muscles the program-level finding absorbed, the ones furthest below the Adequate range", () => {
    // Hamstrings and glutes are explained by the "no hinge" finding, which has its own action; calves has no
    // equipment in this program. That leaves side delts (0 sets) and then the next-lowest.
    const explained = new Set((assessment.findings ?? []).flatMap((f) => f.members.map((m) => m.muscle)));
    expect(explained.has("hamstrings")).toBe(true);
    const names = program.suggestions!.map((s) => s.muscle);
    for (const m of names) expect(explained.has(m)).toBe(false);
    expect(names[0]).toBe("side delts");
    const beforeSets = program.suggestions!.map((s) => s.beforeSets);
    expect(beforeSets).toEqual([...beforeSets].sort((a, b) => a - b));
    expect(Math.max(...beforeSets)).toBeLessThan(6);
  });

  it("leaves the persisted assessment's template sentence alone and passes the forbidden-copy lint", () => {
    expect(assessment.actions.find((a) => a.rootCauseKey === "programStructure:add-volume")?.description).toBe(
      "Add hard sets across the program, starting with the muscles furthest below the 6–20 range.",
    );
    assertCleanCopy([program.description]);
  });

  it("falls back to the template sentence when no muscle can be named", () => {
    const empty: ExerciseReferenceData = { ...REF, exercises: REF.exercises.filter((e) => e.equipment === "barbell") };
    const a = computeAnalysis(DUMBBELLS_ONLY, empty, HYPERTROPHY_CONFIG, { now: () => new Date(0) });
    const { assessment: asm } = computeAssessment(a, HYPERTROPHY_CONFIG, { goalId: "g" });
    const out = nameActions(asm, DUMBBELLS_ONLY, empty, HYPERTROPHY_CONFIG).find((x) => x.rootCauseKey === "programStructure:add-volume");
    expect(out?.suggestions).toBeUndefined();
    expect(out?.description).toBe("Add hard sets across the program, starting with the muscles furthest below the 6–20 range.");
  });
});

// ARCH-065 / Fix 1 (the /check stranger audit). An action must reach the number it cites: "Add 4 sets of Cable
// Lateral Raise → side delts 5.5 sets/week. The Adequate range starts at 6." contradicted itself because one addition
// was capped at 4 sets. A muscle that needs 5-8 sets is now split over the two best days, and the day is the one that
// already trains the muscle (a face pull goes on the pull day, not on the first upper-body day). The after-number is
// still the engine's: these tests re-run the engine independently over the structure with the additions applied.
const PPL_EX: Array<[string, string, string, Record<string, number>]> = [
  ["Barbell Bench Press", "HORIZONTAL_PUSH", "barbell", { chest: 1, triceps: 0.5 }],
  ["Overhead Press", "VERTICAL_PUSH", "barbell", { "side delts": 0.5, triceps: 0.5 }],
  ["Tricep Pushdown", "ISOLATION", "cable", { triceps: 1 }],
  ["Barbell Row", "HORIZONTAL_PULL", "barbell", { lats: 1, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 }],
  ["Pull-Up", "VERTICAL_PULL", "bodyweight", { lats: 1, biceps: 0.5 }],
  ["Barbell Curl", "ISOLATION", "barbell", { biceps: 1 }],
  ["Back Squat", "SQUAT", "barbell", { quads: 1, glutes: 0.5 }],
  ["Romanian Deadlift", "HINGE", "barbell", { hamstrings: 1, glutes: 0.5 }],
  ["Cable Lateral Raise", "ISOLATION", "cable", { "side delts": 1 }],
  ["Face Pull", "ISOLATION", "cable", { "rear delts": 1, "upper back": 0.5 }],
];
const PPL_REF: ExerciseReferenceData = {
  exercises: PPL_EX.map(([name, movementPattern, equipment]) => ({ id: name, name, movementPattern: movementPattern as never, equipment })),
  muscleGroups: MUSCLES.map((m) => ({ id: m, name: m })),
  involvements: PPL_EX.flatMap(([name, , , inv]) => Object.entries(inv).map(([m, f]) => ({ exerciseId: name, muscleGroupId: m, involvementFactor: f }))),
};
const PPL_ONCE: ProgramStructure = {
  workoutDays: [
    day("push", "Push", [rx("Barbell Bench Press", 3), rx("Overhead Press", 3), rx("Tricep Pushdown", 3)]),
    day("pull", "Pull", [rx("Barbell Row", 3), rx("Pull-Up", 3), rx("Barbell Curl", 3)]),
    day("legs", "Legs", [rx("Back Squat", 3), rx("Romanian Deadlift", 3)]),
  ],
};

describe("nameActions: an addition reaches the Adequate range it cites (ARCH-065 / Fix 1)", () => {
  const analysis = computeAnalysis(PPL_ONCE, PPL_REF, PER_MUSCLE_CONFIG, { now: () => new Date(0) });
  const { assessment } = computeAssessment(analysis, PER_MUSCLE_CONFIG, { goalId: "g" });
  const actions = nameActions(assessment, PPL_ONCE, PPL_REF, PER_MUSCLE_CONFIG);
  const upper = actions.find((a) => a.rootCauseKey === "volume:add-region-upper")!;
  const side = upper.suggestions?.find((s) => s.muscle === "side delts");

  it("splits a 5-set need over the two best days instead of stopping at 4 sets short of the range", () => {
    expect(side?.exerciseName).toBe("Cable Lateral Raise");
    expect(side?.sets).toBe(3);
    expect(side?.alsoOn?.sets).toBe(2);
    expect(side!.sets + side!.alsoOn!.sets).toBe(5);
    expect(side!.afterSets).toBeGreaterThanOrEqual(6);
    expect(upper.description).toMatch(/Add 3 sets of Cable Lateral Raise on Push and 2 on Pull → side delts 6\.5 sets\/week\./);
  });

  it("puts the larger share on the day that already trains the muscle (overhead press is on Push)", () => {
    expect(side?.workoutDayName).toBe("Push");
    expect(side?.alsoOn?.workoutDayName).toBe("Pull");
  });

  it("the split after-number equals an independent engine run over the structure with both additions", () => {
    const target = structureWithAdded(PPL_ONCE, side!.workoutDayName, side!.exerciseName, side!.sets, side!.alsoOn);
    const a = computeAnalysis(target, PPL_REF, PER_MUSCLE_CONFIG, { now: () => new Date(0) });
    const vol = a.axisResults.find((x) => x.axisType === "VOLUME" && x.scopeKey === "side delts")!;
    expect(vol.metricValue).toBe(side!.afterSets);
  });

  it("never cites an Adequate start the addition already reaches", () => {
    // Every full-credit suggestion that ends at or above 6 must not be followed by the contradiction line.
    const reached = (upper.suggestions ?? []).filter((s) => !s.halfCredit && s.afterSets >= 6);
    expect(reached.length).toBeGreaterThan(0);
    const lowerBoundSentences = upper.description.match(/The Adequate range starts at 6\./g) ?? [];
    const short = (upper.suggestions ?? []).filter((s) => s.afterSets < 6);
    expect(lowerBoundSentences.length).toBe(short.length > 0 ? 1 : 0);
  });

  it("does not name a half-credit addition that cannot reach the range (it would end below the line it cites)", () => {
    // Rows count half toward upper back: 6 sets of Face Pull would take it from 1.5 to 4.5, short of 6.
    expect(upper.suggestions?.find((s) => s.muscle === "upper back")).toBeUndefined();
    expect(upper.description).toMatch(/Add weekly volume for upper back/);
  });

  it("copy passes the forbidden-copy lint", () => {
    assertCleanCopy(actions.map((a) => a.description));
  });
});

describe("nameActions: half credit and shared day names (ARCH-065 / Fix 1)", () => {
  // 6 sets of rows on Pull credit upper back 3; 6 more sets of Face Pull at half credit reach exactly 6.
  const HEAVY_ROWS: ProgramStructure = {
    workoutDays: [
      day("push", "Push", [rx("Barbell Bench Press", 3), rx("Overhead Press", 3), rx("Tricep Pushdown", 3)]),
      day("pull", "Pull", [rx("Barbell Row", 6), rx("Pull-Up", 3), rx("Barbell Curl", 3)]),
      day("legs", "Legs", [rx("Back Squat", 3), rx("Romanian Deadlift", 3)]),
    ],
  };
  const analysis = computeAnalysis(HEAVY_ROWS, PPL_REF, PER_MUSCLE_CONFIG, { now: () => new Date(0) });
  const { assessment } = computeAssessment(analysis, PER_MUSCLE_CONFIG, { goalId: "g" });
  const upper = nameActions(assessment, HEAVY_ROWS, PPL_REF, PER_MUSCLE_CONFIG).find(
    (a) => a.rootCauseKey === "volume:add-region-upper",
  )!;

  it("names a half-credit addition that does reach the range, and says each set counts half", () => {
    const back = upper.suggestions?.find((s) => s.muscle === "upper back");
    expect(back?.halfCredit).toBe(true);
    expect(back?.afterSets).toBeGreaterThanOrEqual(6);
    expect(back?.alsoOn).toBeUndefined();
    expect(upper.description).toMatch(/Each set counts as half for upper back\./);
  });

  it("puts a face pull on the pull day, where rows already train the muscle", () => {
    const back = upper.suggestions?.find((s) => s.muscle === "upper back");
    expect(back?.exerciseName).toBe("Face Pull");
    expect(back?.workoutDayName).toBe("Pull");
  });

  it("a split over two days with the same name says 'the other Full Body day'", () => {
    const twin: ProgramStructure = {
      workoutDays: [
        day("a", "Full Body", [rx("Barbell Bench Press", 3), rx("Barbell Row", 3), rx("Back Squat", 3), rx("Tricep Pushdown", 3)]),
        day("b", "Full Body", [rx("Barbell Bench Press", 3), rx("Barbell Row", 3), rx("Back Squat", 3), rx("Tricep Pushdown", 3)]),
      ],
    };
    const a = computeAnalysis(twin, PPL_REF, PER_MUSCLE_CONFIG, { now: () => new Date(0) });
    const { assessment: asm } = computeAssessment(a, PER_MUSCLE_CONFIG, { goalId: "g" });
    const text = nameActions(asm, twin, PPL_REF, PER_MUSCLE_CONFIG).map((x) => x.description).join(" ");
    expect(text).toMatch(/ on Full Body and \d on the other Full Body day /);
    expect(text).not.toMatch(/on Full Body and \d on Full Body/);
  });
});

// ARCH-065 / Fix 3b. The whole-program volume action leads with the cheapest fix a lifter can make when the program is
// a once-a-week rotation of 3 days or fewer: run it twice. The total is the engine's (daysPerWeek doubled), never
// multiplied here, and the advice is withheld wherever it would be wrong.
describe("nameActions: run the rotation twice a week (ARCH-065 / Fix 3b)", () => {
  const run = (structure: ProgramStructure) => {
    const analysis = computeAnalysis(structure, PPL_REF, HYPERTROPHY_CONFIG, { now: () => new Date(0) });
    const { assessment } = computeAssessment(analysis, HYPERTROPHY_CONFIG, { goalId: "g" });
    return nameActions(assessment, structure, PPL_REF, HYPERTROPHY_CONFIG).find(
      (a) => a.rootCauseKey === "programStructure:add-volume",
    );
  };

  it("a 3-day once-a-week rotation under the floor leads with 'Run your 3 days twice a week → 48 hard sets a week.'", () => {
    const action = run(PPL_ONCE);
    expect(action?.rotation).toEqual({ days: 3, totalSets: 48 });
    expect(action?.description).toMatch(/^Run your 3 days twice a week → 48 hard sets a week\. Or, on 3 days a week: Add /);
  });

  it("the 48 is the engine's own number for the same program run twice a week", () => {
    const analysis = computeAnalysis(PPL_ONCE, PPL_REF, HYPERTROPHY_CONFIG, {
      now: () => new Date(0),
      context: { daysPerWeek: 6 },
    });
    const total = analysis.axisResults.find((a) => a.axisType === "PROGRAM_STRUCTURE" && a.scopeKey === "total-volume");
    expect(total?.metricValue).toBe(48);
    expect(run(PPL_ONCE)?.rotation?.totalSets).toBe(total?.metricValue);
  });

  it("still names the additions for a lifter who keeps 3 days", () => {
    expect(run(PPL_ONCE)?.suggestions?.length).toBeGreaterThan(0);
  });

  it("is withheld when running it twice would still be under the floor", () => {
    const small: ProgramStructure = {
      workoutDays: [
        day("a", "Push", [rx("Barbell Bench Press", 3), rx("Tricep Pushdown", 2)]),
        day("b", "Pull", [rx("Barbell Row", 3), rx("Barbell Curl", 2)]),
        day("c", "Legs", [rx("Back Squat", 3), rx("Romanian Deadlift", 2)]),
      ],
    };
    const action = run(small);
    expect(action?.rotation).toBeUndefined();
    expect(action?.description).not.toMatch(/twice a week/);
  });

  it("is withheld when muscles are already trained more than once (a 3-day full-body program is not a rotation)", () => {
    const fullBody = (id: string) => day(id, "Full body", [rx("Barbell Bench Press", 3), rx("Barbell Row", 3), rx("Back Squat", 3)]);
    const action = run({ workoutDays: [fullBody("a"), fullBody("b"), fullBody("c")] });
    expect(action?.rotation).toBeUndefined();
  });

  it("is withheld for more than 3 listed days", () => {
    const d = (id: string, name: string) => day(id, name, [rx("Barbell Bench Press", 1), rx("Barbell Row", 1)]);
    const action = run({ workoutDays: [d("a", "A"), d("b", "B"), d("c", "C"), d("d", "D")] });
    expect(action?.rotation).toBeUndefined();
  });

  it("the copy passes the forbidden-copy lint", () => {
    assertCleanCopy([run(PPL_ONCE)!.description]);
  });
});
