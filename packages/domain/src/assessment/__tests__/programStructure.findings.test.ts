// packages/domain/src/assessment/__tests__/programStructure.findings.test.ts
//
// ARCH-063, Session D: how the PROGRAM_STRUCTURE axis becomes findings. Absorption (what the program-level finding
// replaces and what it must leave), ranking, leverage, Fit (invariant 8), and the copy.
import { describe, expect, it } from "vitest";
import { computeAnalysis } from "../../analysis/computeAnalysis";
import type { AnalysisContext, ExerciseReferenceData } from "../../analysis/types";
import { findingSentence } from "../../copy/findingSentence";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";
import type { ExercisePrescriptionStructure, ProgramStructure, WorkoutDayStructure } from "../../types";
import { actionTemplateFor } from "../actionTemplates";
import { computeAssessment } from "../computeAssessment";
import { projectFitBand } from "../computeFitScore";
import type { Assessment, AssessmentFinding } from "../types";

const MUSCLES = ["chest", "lats", "upper back", "side delts", "rear delts", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves"];
const EX: Array<[string, string, Record<string, number>]> = [
  ["Barbell Bench Press", "HORIZONTAL_PUSH", { chest: 1, triceps: 0.5 }],
  ["Barbell Row", "HORIZONTAL_PULL", { lats: 1, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 }],
  ["Back Squat", "SQUAT", { quads: 1, glutes: 0.5 }],
  ["Romanian Deadlift", "HINGE", { hamstrings: 1, glutes: 0.5 }],
  ["Overhead Press", "VERTICAL_PUSH", { "side delts": 0.5, triceps: 0.5 }],
  ["Lat Pulldown", "VERTICAL_PULL", { lats: 1, "upper back": 0.5, biceps: 0.5 }],
];
const REF: ExerciseReferenceData = {
  exercises: EX.map(([name, movementPattern]) => ({ id: name, name, movementPattern: movementPattern as never, equipment: "barbell" })),
  muscleGroups: MUSCLES.map((m) => ({ id: m, name: m })),
  involvements: EX.flatMap(([name, , inv]) => Object.entries(inv).map(([m, f]) => ({ exerciseId: name, muscleGroupId: m, involvementFactor: f }))),
};
const rx = (exerciseId: string, sets: number): ExercisePrescriptionStructure => ({
  id: `${exerciseId}-${sets}`, orderIndex: 0, exerciseId, targetSets: sets, targetRepsLow: 8, targetRepsHigh: 12,
  targetRpe: 8, loadScheme: { type: "RPE_BASED", rpe: 8 },
});
const day = (name: string, ...rows: ExercisePrescriptionStructure[]): WorkoutDayStructure => ({ id: name, orderIndex: 0, name, prescriptions: rows });
const program = (...days: WorkoutDayStructure[]): ProgramStructure => ({ workoutDays: days.map((d, i) => ({ ...d, orderIndex: i })) });

function assess(p: ProgramStructure, context?: AnalysisContext): Assessment {
  const analysis = computeAnalysis(p, REF, HYPERTROPHY_CONFIG, { now: () => new Date(0), ...(context ? { context } : {}) });
  return computeAssessment(analysis, HYPERTROPHY_CONFIG, { goalId: "g" }).assessment;
}
const keys = (a: Assessment): string[] => (a.findings ?? []).map((f) => f.key);
const programAxis = (a: Assessment, scope: string) =>
  a.allAssessedAxes.find((x) => x.axisType === "PROGRAM_STRUCTURE" && x.scopeKey === scope)!;
const sentence = (f: AssessmentFinding): string | null => findingSentence(f, HYPERTROPHY_CONFIG);

// Program A's shape: twelve sets over two days, every pattern present, every muscle Low.
const UNDER_DOSED = program(
  day("Mon", rx("Barbell Bench Press", 2), rx("Lat Pulldown", 2), rx("Back Squat", 2)),
  day("Thu", rx("Overhead Press", 2), rx("Barbell Row", 2), rx("Romanian Deadlift", 2)),
);

describe("total-volume: one finding replaces the per-muscle Lows", () => {
  const a = assess(UNDER_DOSED);

  it("is HIGH leverage and the headline", () => {
    expect(programAxis(a, "total-volume").severity).toBe("MODERATE");
    expect(programAxis(a, "total-volume").leverage).toBe("HIGH");
    expect(a.findings?.[0]?.key).toBe("PROGRAM_STRUCTURE:total-volume");
  });

  it("is said once, in the founder's words", () => {
    expect(sentence(a.findings![0]!)).toBe(
      "Your program is under-dosed overall: 12 hard sets per week across the body. A general floor is around 40.",
    );
  });

  it("surfaces no per-muscle or per-region volume finding", () => {
    expect(keys(a).filter((k) => k.startsWith("VOLUME:") || k.startsWith("region:"))).toEqual([]);
  });

  it("leaves every per-muscle axis in allAssessedAxes (invariant 8): the Lows are hidden, not deleted", () => {
    const lows = a.allAssessedAxes.filter((x) => x.axisType === "VOLUME" && x.status.band === "Low");
    expect(lows.length).toBeGreaterThanOrEqual(9);
    expect(lows.every((x) => x.leverage === "HIGH")).toBe(true);
  });

  it("reads NEEDS_WORK in Fit, from the same roll-up", () => {
    expect(projectFitBand(a).band).toBe("NEEDS_WORK");
  });

  it("does not fire at 40 sets, and then the per-muscle findings are untouched", () => {
    const forty = assess(program(day("A", rx("Barbell Bench Press", 20)), day("B", rx("Barbell Row", 20))));
    expect(programAxis(forty, "total-volume").status.band).toBe("Within range");
    expect(keys(forty)).not.toContain("PROGRAM_STRUCTURE:total-volume");
    expect(keys(forty).some((k) => k.startsWith("VOLUME:") || k.startsWith("region:") || k.startsWith("pattern:"))).toBe(true);
  });
});

describe("total-volume keeps structural findings (a missing pattern, an absent region)", () => {
  // Bench and squat only, 12 sets: nothing pulls.
  const a = assess(program(day("A", rx("Barbell Bench Press", 3), rx("Back Squat", 3)), day("B", rx("Barbell Bench Press", 3), rx("Back Squat", 3))));

  it("still says 'no pulling' beside the under-dose, and ranks it first (VOLUME-led beats program-level on a tie)", () => {
    expect(keys(a)).toContain("PROGRAM_STRUCTURE:total-volume");
    expect(keys(a)).toContain("pattern:pull");
    expect(keys(a).indexOf("pattern:pull")).toBeLessThan(keys(a).indexOf("PROGRAM_STRUCTURE:total-volume"));
  });
});

describe("attendance: fewer than two training days", () => {
  const one = program(day("Day A", rx("Barbell Bench Press", 3), rx("Barbell Row", 3), rx("Back Squat", 3)));
  const a = assess(one);

  it("is HIGH leverage and outranks every other finding, including VOLUME-led pattern findings", () => {
    expect(programAxis(a, "attendance").leverage).toBe("HIGH");
    expect(a.findings?.[0]?.key).toBe("PROGRAM_STRUCTURE:attendance");
  });

  it("absorbs the total-volume finding and the per-muscle Lows, so the program is not told it is under-dosed twice", () => {
    expect(keys(a)).not.toContain("PROGRAM_STRUCTURE:total-volume");
    expect(keys(a).filter((k) => k.startsWith("VOLUME:"))).toEqual([]);
    expect(programAxis(a, "total-volume").status.band).toBe("Under-dosed"); // still in the roll-up
  });

  it("keeps a structural finding (no hinge) alongside", () => {
    expect(keys(a)).toContain("pattern:hinge");
  });

  it("says it in the founder's words", () => {
    expect(sentence(a.findings![0]!)).toBe(
      "One training session a week cannot cover a full week's volume. Get a second session in before adding anything to this one.",
    );
  });

  it("does not fire for the same sets listed over two days, or for a one-day cycle run three times", () => {
    expect(keys(assess(program(day("A", rx("Barbell Bench Press", 3)), day("B", rx("Barbell Row", 3))))).includes("PROGRAM_STRUCTURE:attendance")).toBe(false);
    expect(keys(assess(one, { daysPerWeek: 3 })).includes("PROGRAM_STRUCTURE:attendance")).toBe(false);
  });
});

describe("session-size: MODERATE leverage, independent of the other findings", () => {
  const long = program(day("Push", rx("Barbell Bench Press", 32)), day("Pull", rx("Barbell Row", 20)));
  const a = assess(long);

  it("MODERATE severity on a MEDIUM-weight scope is MODERATE leverage", () => {
    const axis = programAxis(a, "session-size");
    expect([axis.severity, axis.weight, axis.leverage]).toEqual(["MODERATE", "MEDIUM", "MODERATE"]);
  });

  it("is a finding of its own that absorbs nothing", () => {
    expect(keys(a)).toContain("PROGRAM_STRUCTURE:session-size");
    expect(keys(a).some((k) => k.startsWith("VOLUME:") || k.startsWith("region:") || k.startsWith("pattern:"))).toBe(true);
  });

  it("names the session, its sets and minutes", () => {
    const f = a.findings!.find((x) => x.key === "PROGRAM_STRUCTURE:session-size")!;
    expect(sentence(f)).toBe("Session Push is 32 sets, roughly 80 minutes. Consider splitting it.");
  });
});

describe("push-pull: MINOR severity, LOW leverage", () => {
  const a = assess(program(day("A", rx("Barbell Bench Press", 24), rx("Barbell Row", 11)), day("B", rx("Back Squat", 12))));
  it("is information: it can never be the headline over a stronger finding", () => {
    const axis = programAxis(a, "push-pull");
    expect([axis.severity, axis.weight, axis.leverage]).toEqual(["MINOR", "MEDIUM", "LOW"]);
    expect(a.findings?.[0]?.key).not.toBe("PROGRAM_STRUCTURE:push-pull");
  });

  it("reads in the founder's words", () => {
    const axis = programAxis(a, "push-pull");
    const finding: AssessmentFinding = { kind: "AXIS", key: "PROGRAM_STRUCTURE:push-pull", lead: axis, members: [] };
    expect(sentence(finding)).toBe("You press 24 sets for every 11 you pull (2.2 to 1). A typical ratio is closer to 1:1.");
  });
});

describe("time-budget: MODERATE leverage, only with a stated budget", () => {
  const p = program(day("Day A", rx("Barbell Bench Press", 21)), day("Day B", rx("Barbell Row", 11)));

  it("is absent without a budget, so the output is the same with or without the field", () => {
    expect(assess(p).allAssessedAxes.some((x) => x.scopeKey === "time-budget")).toBe(false);
    expect(keys(assess(p))).toEqual(keys(assess(p, {})));
  });

  it("flags a session more than 5 minutes over, MODERATE leverage", () => {
    const a = assess(p, { minutesPerSession: 45 });
    const axis = programAxis(a, "time-budget");
    expect([axis.severity, axis.leverage]).toEqual(["MODERATE", "MODERATE"]);
    const f = a.findings!.find((x) => x.key === "PROGRAM_STRUCTURE:time-budget")!;
    expect(sentence(f)).toBe("Session Day A is about 53 minutes. You said 45. Consider supersetting or trimming 3 sets.");
  });

  it("is silent when every session fits", () => {
    expect(keys(assess(p, { minutesPerSession: 60 }))).not.toContain("PROGRAM_STRUCTURE:time-budget");
  });
});

describe("copy and actions", () => {
  const sentences = [
    "Your program is under-dosed overall: 12 hard sets per week across the body. A general floor is around 40.",
    "Session Push is 32 sets, roughly 80 minutes. Consider splitting it.",
    "You press 24 sets for every 11 you pull (2.2 to 1). A typical ratio is closer to 1:1.",
    "Session Day A is about 53 minutes. You said 45. Consider supersetting or trimming 3 sets.",
    "One training session a week cannot cover a full week's volume. Get a second session in before adding anything to this one.",
  ];

  it("passes the forbidden-copy lint (invariants 9 and 10)", () => {
    assertCleanCopy(sentences);
  });

  it("every firing scope has an action with its own root cause, none shared with a per-muscle action", () => {
    const a = assess(UNDER_DOSED, { minutesPerSession: 10 });
    const fired = a.allAssessedAxes.filter((x) => x.axisType === "PROGRAM_STRUCTURE" && x.severity !== "NONE");
    expect(fired.length).toBeGreaterThan(0);
    const out = fired.map((x) => actionTemplateFor(x, "HYPERTROPHY"));
    for (const t of out) {
      expect(t).not.toBeNull();
      expect(t!.rootCauseKey).toMatch(/^programStructure:/);
      assertCleanCopy([t!.description]);
    }
    expect(new Set(out.map((t) => t!.rootCauseKey)).size).toBe(out.length);
  });

  it("a scope that is within range has no action", () => {
    const fine = assess(program(day("A", rx("Barbell Bench Press", 20)), day("B", rx("Barbell Row", 20))));
    expect(actionTemplateFor(programAxis(fine, "total-volume"), "HYPERTROPHY")).toBeNull();
  });
});

describe("highVolume: the informational 'What's trending high' block", () => {
  // Bench 24 sets (chest High), row 36 (lats Excessive), a squat day to keep the rest quiet.
  const a = assess(program(day("A", rx("Barbell Bench Press", 24), rx("Barbell Row", 36)), day("B", rx("Back Squat", 12))));

  it("lists High and Excessive muscles with their band name and set count, most sets first", () => {
    const rows = (a.highVolume ?? []).filter((e) => e.muscle === "chest" || e.muscle === "lats");
    expect(rows).toEqual([
      { muscle: "lats", sets: 36, band: "Excessive" },
      { muscle: "chest", sets: 24, band: "High" },
    ]);
    expect(a.highVolume!.map((e) => e.sets)).toEqual([...a.highVolume!.map((e) => e.sets)].sort((x, y) => y - x));
  });

  it("is a fact, not a finding: it adds no leverage, no finding and no Fit input", () => {
    expect(keys(a).some((k) => k === "VOLUME:chest")).toBe(false); // a High band is severity NONE
    const without = { ...a, highVolume: undefined };
    expect(projectFitBand(without as Assessment).band).toBe(projectFitBand(a).band);
  });

  it("an Excessive muscle is both listed and a finding of its own", () => {
    expect(keys(a)).toContain("VOLUME:lats");
  });

  it("is absent (not an empty list) when nothing is High or Excessive", () => {
    const quiet = assess(program(day("A", rx("Barbell Bench Press", 12)), day("B", rx("Barbell Row", 12))));
    expect("highVolume" in quiet).toBe(false);
  });

  it("copy: one line per muscle, in the founder's format, and clean", async () => {
    const { highVolumeLines } = await import("../../copy/highVolumeLines");
    const lines = highVolumeLines([
      { muscle: "biceps", sets: 24.5, band: "High" },
      { muscle: "hamstrings", sets: 24, band: "High" },
      { muscle: "lats", sets: 36, band: "Excessive" },
    ]);
    expect(lines).toEqual([
      "Biceps: 24.5 hard sets/week (High)",
      "Hamstrings: 24 hard sets/week (High)",
      "Lats: 36 hard sets/week (Excessive)",
    ]);
    assertCleanCopy(lines);
    expect(highVolumeLines(undefined)).toEqual([]);
  });
});
