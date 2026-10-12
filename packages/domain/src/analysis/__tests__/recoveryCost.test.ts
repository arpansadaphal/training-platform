// packages/domain/src/analysis/__tests__/recoveryCost.test.ts
import { describe, expect, it } from "vitest";
import type { ExercisePrescriptionStructure, ProgramStructure } from "../../types";
import { computeRecoveryCostAxis, intensityWeight, provisionalRecoveryCostCalculator } from "../recoveryCost";
import { testReferenceData } from "../__fixtures__/exerciseReferenceData";
import { TEST_CONFIG_ALL_NULL, TEST_CONFIG_BOUNDED } from "../__fixtures__/testGoalProfiles";

const rx = (over: Partial<ExercisePrescriptionStructure> = {}): ExercisePrescriptionStructure => ({
  id: "p1",
  orderIndex: 0,
  exerciseId: "squat",
  targetSets: 3,
  targetRepsLow: 8,
  targetRepsHigh: 12,
  loadScheme: { type: "BODYWEIGHT" },
  ...over,
});
const prog = (...rows: ExercisePrescriptionStructure[]): ProgramStructure => ({
  workoutDays: [{ id: "d1", orderIndex: 0, name: "X", prescriptions: rows.map((r, i) => ({ ...r, orderIndex: i, id: `p${i}` })) }],
});
const metric = (s: ProgramStructure, config = TEST_CONFIG_ALL_NULL) =>
  Number(computeRecoveryCostAxis(s, testReferenceData, config).metricValue);

describe("computeRecoveryCostAxis (monotonicity, unchanged)", () => {
  it("metricValue strictly increases with more sets at fixed intensity", () => {
    expect(metric(prog(rx({ targetSets: 6, loadScheme: { type: "RPE_BASED", rpe: 8 } })))).toBeGreaterThan(
      metric(prog(rx({ targetSets: 3, loadScheme: { type: "RPE_BASED", rpe: 8 } }))),
    );
  });
  it("metricValue strictly increases with higher intensity at fixed sets", () => {
    expect(metric(prog(rx({ loadScheme: { type: "RPE_BASED", rpe: 9 } })))).toBeGreaterThan(
      metric(prog(rx({ loadScheme: { type: "RPE_BASED", rpe: 5 } }))),
    );
  });
  it("is deterministic for the same input", () => {
    const s = prog(rx({ loadScheme: { type: "PERCENT_1RM", percent: 0.8 } }));
    expect(metric(s)).toBe(metric(s));
  });
  it("returns UNVALIDATED under the all-null config", () => {
    expect(computeRecoveryCostAxis(prog(rx()), testReferenceData, TEST_CONFIG_ALL_NULL).status.kind).toBe("UNVALIDATED");
  });
});

describe("recovery weight (E9)", () => {
  it("is RPE / 10 from an RPE_BASED load scheme", () => {
    expect(intensityWeight(rx({ loadScheme: { type: "RPE_BASED", rpe: 9 } }))).toBeCloseTo(0.9);
  });
  it("targetRpe takes precedence over the load scheme's rpe", () => {
    expect(intensityWeight(rx({ targetRpe: 6, loadScheme: { type: "RPE_BASED", rpe: 9 } }))).toBeCloseTo(0.6);
  });
  it("targetRpe applies to non-RPE load schemes", () => {
    expect(intensityWeight(rx({ targetRpe: 7, loadScheme: { type: "FIXED_WEIGHT", weight: 40, unit: "kg" } }))).toBeCloseTo(0.7);
  });
  it("weighs 0.8 when no effort is stated, for every load scheme", () => {
    for (const loadScheme of [
      { type: "BODYWEIGHT" } as const,
      { type: "FIXED_WEIGHT", weight: 40, unit: "kg" } as const,
      { type: "PERCENT_1RM", percent: 0.9 } as const,
    ]) expect(intensityWeight(rx({ loadScheme }))).toBeCloseTo(0.8);
  });
  it("ignores the %1RM value entirely (so its unit cannot distort the axis)", () => {
    const at = (percent: number) => metric(prog(rx({ loadScheme: { type: "PERCENT_1RM", percent } })));
    expect(at(0.5)).toBe(at(0.9));
    expect(at(0.5)).toBe(at(75));
  });
  it("totals targetSets x weight", () => {
    expect(metric(prog(rx({ targetSets: 5, loadScheme: { type: "RPE_BASED", rpe: 8 } }), rx({ targetSets: 10 })))).toBeCloseTo(12); // 4 + 8
  });
  it("does not multiply by hard-set credit: an RPE 5 set still costs 0.5", () => {
    expect(metric(prog(rx({ targetSets: 10, targetRpe: 5 })))).toBeCloseTo(5);
  });
  it("the unstated-effort weight follows hardSetCredit.assumedRirWhenUndefined", () => {
    const cfg = { ...TEST_CONFIG_ALL_NULL, hardSetCredit: { fullCreditMaxRir: 3, zeroCreditMinRir: 5, halfCredit: 0.5, assumedRirWhenUndefined: 0 } };
    expect(intensityWeight(rx(), cfg)).toBeCloseTo(1);
  });
  it("clamps to [0, 1]", () => {
    expect(intensityWeight(rx({ targetRpe: 12 }))).toBe(1);
    expect(intensityWeight(rx({ targetRpe: -1 }))).toBe(0);
  });
});

describe("recovery calculator injection (E9)", () => {
  it("computeRecoveryCostAxis uses an injected calculator and passes the config as the third argument", () => {
    let seen: unknown;
    const calc = { compute: (_s: ProgramStructure, _r: unknown, c?: unknown) => ((seen = c), 42) };
    const r = computeRecoveryCostAxis(prog(rx()), testReferenceData, TEST_CONFIG_BOUNDED, calc);
    expect(r.metricValue).toBe(42);
    expect(seen).toBe(TEST_CONFIG_BOUNDED);
  });
  it("the default calculator is the provisional one", () => {
    const s = prog(rx({ targetSets: 4 }));
    expect(computeRecoveryCostAxis(s, testReferenceData, TEST_CONFIG_BOUNDED).metricValue).toBe(
      provisionalRecoveryCostCalculator.compute(s, testReferenceData, TEST_CONFIG_BOUNDED),
    );
  });
});