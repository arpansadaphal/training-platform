// packages/domain/src/analysis/__tests__/progressionSoundness.test.ts
import { describe, expect, it } from "vitest";
import type { ExercisePrescriptionStructure, LoadScheme, ProgramStructure } from "../../types";
import {
  computeProgressionSoundnessAxis,
  epleyMaxReps,
  evaluateProgressionChecks,
  normalizePercentFraction,
} from "../progressionSoundness";
import { testReferenceData } from "../__fixtures__/exerciseReferenceData";
import { emptyProgram, fullyCoveredProgram } from "../__fixtures__/programStructures";
import { TEST_CONFIG_ALL_NULL, TEST_CONFIG_BOUNDED } from "../__fixtures__/testGoalProfiles";

// PS bands (test config): Sound < 0.5, Issue found >= 0.5; the metric is the number of failed checks.
const rpe = (n: number): LoadScheme => ({ type: "RPE_BASED", rpe: n });
const rx = (id: string, over: Partial<ExercisePrescriptionStructure> = {}): ExercisePrescriptionStructure => ({
  id,
  orderIndex: 0,
  exerciseId: "bench",
  targetSets: 3,
  targetRepsLow: 8,
  targetRepsHigh: 12,
  loadScheme: rpe(8),
  ...over,
});
const prog = (...rows: ExercisePrescriptionStructure[]): ProgramStructure => ({
  workoutDays: [{ id: "d1", orderIndex: 0, name: "D", prescriptions: rows.map((r, i) => ({ ...r, orderIndex: i })) }],
});
const five = (over: (i: number) => Partial<ExercisePrescriptionStructure> = () => ({})) =>
  prog(...[0, 1, 2, 3, 4].map((i) => rx(`p${i}`, over(i))));
const run = (s: ProgramStructure, config = TEST_CONFIG_BOUNDED) =>
  computeProgressionSoundnessAxis(s, testReferenceData, config);
const failedIds = (s: ProgramStructure) =>
  evaluateProgressionChecks(s, TEST_CONFIG_BOUNDED).filter((c) => c.failed).map((c) => c.id);

describe("computeProgressionSoundnessAxis (E8)", () => {
  it("Sound when effort is stated, near failure, in range, and no %1RM is infeasible", () => {
    const r = run(five());
    expect(r.metricValue).toBe(0);
    expect(r.status).toEqual({ kind: "BAND", band: "Sound" });
  });

  describe("EFFORT_DEFINED (>= 80% of prescriptions)", () => {
    const undefinedFor = (n: number) => five((i) => (i < n ? { loadScheme: { type: "BODYWEIGHT" } as LoadScheme } : {}));
    it("passes at exactly 80% defined (4 of 5)", () => expect(failedIds(undefinedFor(1))).toEqual([]));
    it("fails at 60% defined (3 of 5)", () => {
      expect(failedIds(undefinedFor(2))).toEqual(["EFFORT_DEFINED"]);
      expect(run(undefinedFor(2)).status).toEqual({ kind: "BAND", band: "Issue found" });
    });
    it("targetRpe counts as defined on a non-RPE load scheme", () => {
      expect(failedIds(five(() => ({ loadScheme: { type: "BODYWEIGHT" } as LoadScheme, targetRpe: 8 })))).toEqual([]);
    });
    it("the shared fixture program (2 of 8 prescriptions without effort) is below the threshold", () => {
      expect(run(fullyCoveredProgram).metricValue).toBe(1);
    });
  });

  describe("FAR_FROM_FAILURE (<= 25% of sets at RIR >= 5)", () => {
    it("fails when 40% of sets are at RPE 5", () => {
      expect(failedIds(five((i) => (i < 2 ? { loadScheme: rpe(5) } : {})))).toEqual(["FAR_FROM_FAILURE"]);
    });
    it("passes at exactly 25% (1 of 4 sets)", () => {
      const s = prog(rx("a", { targetSets: 1, loadScheme: rpe(5) }), rx("b", { targetSets: 3 }));
      expect(failedIds(s)).toEqual([]);
    });
    it("RPE 6 (RIR 4) is not far from failure", () => {
      expect(failedIds(five(() => ({ loadScheme: rpe(6) })))).toEqual([]);
    });
    it("prescriptions with no stated effort are not counted as far", () => {
      expect(failedIds(five(() => ({ loadScheme: { type: "BODYWEIGHT" } as LoadScheme })))).toEqual(["EFFORT_DEFINED"]);
    });
  });

  describe("REP_RANGE (>= 80% of sets wholly inside 5-30)", () => {
    it("fails when 60% of sets are outside", () => {
      expect(failedIds(five((i) => (i < 3 ? { targetRepsLow: 3, targetRepsHigh: 5 } : {})))).toEqual(["REP_RANGE"]);
    });
    it("passes at exactly 80% inside (1 of 5 outside)", () => {
      expect(failedIds(five((i) => (i === 0 ? { targetRepsLow: 1, targetRepsHigh: 3 } : {})))).toEqual([]);
    });
    it("a range reaching above 30 is outside", () => {
      expect(failedIds(five(() => ({ targetRepsLow: 20, targetRepsHigh: 35 })))).toEqual(["REP_RANGE"]);
    });
    it("5-30 inclusive is inside", () => {
      expect(failedIds(five(() => ({ targetRepsLow: 5, targetRepsHigh: 30 })))).toEqual([]);
    });
  });

  describe("PERCENT_1RM_FEASIBILITY (interim Epley)", () => {
    const pctRow = (percent: number, high: number, over: Partial<ExercisePrescriptionStructure> = {}) =>
      rx("pct", { loadScheme: { type: "PERCENT_1RM", percent }, targetRepsLow: Math.min(8, high), targetRepsHigh: high, targetRpe: 8, ...over });

    it("accepts a rep range the percentage allows (60% x 12 at RPE 8)", () => {
      expect(failedIds(prog(pctRow(0.6, 12)))).toEqual([]);
    });
    it("rejects an impossible one (85% x 12 at RPE 8)", () => {
      expect(failedIds(prog(pctRow(0.85, 12)))).toEqual(["PERCENT_1RM_FEASIBILITY"]);
    });
    it("reads 75 as 75%", () => {
      expect(failedIds(prog(pctRow(75, 10)))).toEqual(failedIds(prog(pctRow(0.75, 10))));
      expect(failedIds(prog(pctRow(75, 10)))).toEqual(["PERCENT_1RM_FEASIBILITY"]); // 10 reps + 2 RIR at 75%
    });
    it("judges unstated effort to failure (RIR 0): 80% x 7 is feasible, 80% x 12 is not", () => {
      expect(failedIds(prog(pctRow(0.8, 7, { targetRpe: undefined })))).toEqual(["EFFORT_DEFINED"]); // feasibility passes
      expect(failedIds(prog(pctRow(0.8, 12, { targetRpe: undefined })))).toEqual(["EFFORT_DEFINED", "PERCENT_1RM_FEASIBILITY"]);
    });
    it("a 1-rep prescription is no longer special: %1RM with only a single and no stated effort still fails effort", () => {
      const r = run(prog(rx("single", { loadScheme: { type: "PERCENT_1RM", percent: 0.8 }, targetRepsLow: 1, targetRepsHigh: 1, targetRpe: undefined })));
      expect(r.status).toEqual({ kind: "BAND", band: "Issue found" });
    });
    it("ignores non-%1RM prescriptions", () => {
      expect(failedIds(five())).not.toContain("PERCENT_1RM_FEASIBILITY");
    });
  });

  it("metricValue counts failed checks", () => {
    const s = five(() => ({ loadScheme: { type: "BODYWEIGHT" } as LoadScheme, targetRepsLow: 1, targetRepsHigh: 3 }));
    expect(failedIds(s)).toEqual(["EFFORT_DEFINED", "REP_RANGE"]);
    expect(run(s).metricValue).toBe(2);
  });

  it("an empty program is Sound (nothing to evaluate)", () => {
    expect(run(emptyProgram).metricValue).toBe(0);
  });

  it("honours config.progressionRules", () => {
    const strict = { ...TEST_CONFIG_BOUNDED, progressionRules: { minShareEffortDefined: 1, farFromFailureMinRir: 3, maxShareFarFromFailure: 0, acceptedRepRange: [8, 12] as const, minShareInAcceptedRepRange: 1, percent1RmRepTolerance: 0 } };
    expect(failedIds(five(() => ({ loadScheme: rpe(7) })))).toEqual([]);
    expect(evaluateProgressionChecks(five(() => ({ loadScheme: rpe(7) })), strict).filter((c) => c.failed).map((c) => c.id)).toEqual(["FAR_FROM_FAILURE"]);
  });

  it("returns UNVALIDATED when bounds are null", () => {
    expect(run(five(() => ({ loadScheme: { type: "BODYWEIGHT" } as LoadScheme })), TEST_CONFIG_ALL_NULL).status.kind).toBe("UNVALIDATED");
  });
});

describe("epleyMaxReps / normalizePercentFraction", () => {
  it("matches the Epley equation", () => {
    expect(epleyMaxReps(0.75)).toBeCloseTo(10);
    expect(epleyMaxReps(0.5)).toBeCloseTo(30);
    expect(epleyMaxReps(0.6)).toBeCloseTo(20);
  });
  it("never goes below one rep", () => {
    expect(epleyMaxReps(1)).toBe(1);
    expect(epleyMaxReps(1.2)).toBe(1);
  });
  it("normalises whole percents", () => {
    expect(normalizePercentFraction(75)).toBe(0.75);
    expect(normalizePercentFraction(0.75)).toBe(0.75);
  });
});