import { describe, expect, it } from "vitest";
import { computeAnalysis } from "../../analysis/computeAnalysis";
import type { ExerciseReferenceData } from "../../analysis/types";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";
import type { ExercisePrescriptionStructure, ProgramStructure } from "../../types";
import { allFrequencyObservationCopy, frequencyObservation, FREQUENCY_COPY } from "../frequencyObservation";

// Five muscles, one exercise each, so a program's exposures are readable by eye. Ids are the names.
const MUSCLES = ["chest", "lats", "quads", "hamstrings", "biceps"];
const EX: Array<[string, string, string]> = [
  ["Bench", "HORIZONTAL_PUSH", "chest"],
  ["Row", "HORIZONTAL_PULL", "lats"],
  ["Squat", "SQUAT", "quads"],
  ["Deadlift", "HINGE", "hamstrings"],
  ["Curl", "ISOLATION", "biceps"],
];
const REF: ExerciseReferenceData = {
  exercises: EX.map(([name, movementPattern]) => ({ id: name, name, movementPattern: movementPattern as never, equipment: "barbell" })),
  muscleGroups: MUSCLES.map((m) => ({ id: m, name: m })),
  involvements: EX.map(([name, , muscle]) => ({ exerciseId: name, muscleGroupId: muscle, involvementFactor: 1 })),
};
const rx = (exerciseId: string, sets: number, i: number): ExercisePrescriptionStructure => ({
  id: `${exerciseId}-${i}`, orderIndex: i, exerciseId, targetSets: sets, targetRepsLow: 8, targetRepsHigh: 10, targetRpe: 8,
  loadScheme: { type: "RPE_BASED", rpe: 8 },
});
const day = (name: string, rows: Array<[string, number]>) => ({
  id: name, orderIndex: 0, name, prescriptions: rows.map(([id, sets], i) => rx(id, sets, i)),
});
const observe = (structure: ProgramStructure, context?: { daysPerWeek: number }) => {
  const analysis = computeAnalysis(structure, REF, HYPERTROPHY_CONFIG, { now: () => new Date(0), ...(context ? { context } : {}) });
  return frequencyObservation(analysis, structure, REF, HYPERTROPHY_CONFIG, context);
};

const ONE_EACH: ProgramStructure = { workoutDays: [day("A", [["Bench", 3], ["Row", 3]]), day("B", [["Squat", 3], ["Deadlift", 3], ["Curl", 3]])] };

describe("frequencyObservation (ARCH-068)", () => {
  it("fires when every muscle has one exposure, and says so in full", () => {
    const o = observe(ONE_EACH);
    expect(o?.text.startsWith("Every muscle is trained once a week.")).toBe(true);
  });

  it("variant B (under the whole-program floor) says add a day, not sets, with the engine's own total", () => {
    const o = observe(ONE_EACH);
    expect(o?.variant).toBe("UNDER_FLOOR");
    expect(o?.text).toContain("Your total is 15 sets, under the general floor");
    expect(o?.text).toContain("add a second training day, not to add more sets to your current days");
  });

  it("variant A (a muscle's whole dose is over the per-session cap) wins over the floor and names the muscle and dose", () => {
    const o = observe({ workoutDays: [day("A", [["Bench", 6], ["Bench", 6]]), day("B", [["Row", 3], ["Squat", 3], ["Deadlift", 3]])] });
    expect(o?.variant).toBe("CAP_EXCEEDED");
    expect(o?.text).toContain("Your chest gets 12 sets, all in one session");
  });

  it("variant C (volume in range) is informational and says one session is not disqualifying", () => {
    // 4 days x 10 sets: each muscle once, none over the 10-set cap, and 40 sets reaches the whole-program floor.
    const o = observe({
      workoutDays: [
        day("A", [["Bench", 5], ["Bench", 5]]), day("B", [["Row", 5], ["Row", 5]]),
        day("C", [["Squat", 5], ["Squat", 5]]), day("D", [["Deadlift", 5], ["Deadlift", 5]]),
      ],
    });
    expect(o?.variant).toBe("IN_RANGE");
    expect(o?.text).toContain("this is informational");
    expect(o?.text).toContain("one session is not disqualifying if the per-session volume is right");
  });

  it("is not fired by a program that trains each muscle twice (a 4-day upper/lower reads null)", () => {
    expect(observe({ workoutDays: [ONE_EACH.workoutDays[0]!, ONE_EACH.workoutDays[1]!, day("C", [["Bench", 3], ["Row", 3]]), day("D", [["Squat", 3], ["Deadlift", 3]])] })).toBeNull();
  });

  it("does not fire once the lifter says they run the days twice (daysPerWeek 4 doubles the exposures)", () => {
    expect(observe(ONE_EACH, { daysPerWeek: 4 })).toBeNull();
    expect(observe(ONE_EACH, { daysPerWeek: 2 })?.variant).toBe("UNDER_FLOOR");
  });

  it("counts only the muscles the program trains: two untrained muscles do not hide the note", () => {
    const o = observe({ workoutDays: [day("A", [["Bench", 3]]), day("B", [["Row", 3]])] });
    expect(o?.text.startsWith("Every muscle you train is trained once a week.")).toBe(true);
  });

  it("fires at 80% of the trained muscles and not below: 4 of 5 once-a-week fires and says 'Most muscles'; 3 of 4 does not", () => {
    // chest twice, the other four once: 4 of 5 trained = 80%.
    const four = observe({ workoutDays: [day("A", [["Bench", 3], ["Row", 3], ["Squat", 3], ["Deadlift", 3], ["Curl", 3]]), day("B", [["Bench", 3]])] });
    expect(four?.text.startsWith("Most muscles are trained once a week.")).toBe(true);
    // chest twice, the other three once: 3 of 4 trained = 75%.
    expect(observe({ workoutDays: [day("A", [["Bench", 3], ["Row", 3], ["Squat", 3], ["Deadlift", 3]]), day("B", [["Bench", 3]])] })).toBeNull();
  });

  it("is a note: it adds nothing to the assessment's findings, strengths or Fit", () => {
    const analysis = computeAnalysis(ONE_EACH, REF, HYPERTROPHY_CONFIG, { now: () => new Date(0) });
    const before = JSON.stringify(analysis);
    frequencyObservation(analysis, ONE_EACH, REF, HYPERTROPHY_CONFIG);
    expect(JSON.stringify(analysis)).toBe(before);
  });

  it("every variant and scope passes the forbidden-copy lint", () => {
    assertCleanCopy(allFrequencyObservationCopy());
  });

  it("never claims once a week is a defect: no 'only', 'too few' or 'bad'", () => {
    for (const line of allFrequencyObservationCopy()) expect(line).not.toMatch(/\bonly\b|too few|\bbad\b|\bwrong\b/i);
    expect(FREQUENCY_COPY.inRange("ALL")).toMatch(/not disqualifying/);
  });
});
