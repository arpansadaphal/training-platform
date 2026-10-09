// packages/domain/src/analysis/__tests__/hardSetCredit.test.ts
import { describe, expect, it } from "vitest";
import type { ExercisePrescriptionStructure } from "../../types";
import {
  DEFAULT_HARD_SET_CREDIT,
  creditedSets,
  hardSetCredit,
  hasDefinedEffort,
  prescribedRir,
  prescribedRpe,
  resolveHardSetCreditConfig,
} from "../hardSetCredit";

const rx = (over: Partial<ExercisePrescriptionStructure> = {}): ExercisePrescriptionStructure => ({
  id: "p",
  orderIndex: 0,
  exerciseId: "bench",
  targetSets: 3,
  targetRepsLow: 8,
  targetRepsHigh: 12,
  loadScheme: { type: "BODYWEIGHT" },
  ...over,
});
const rpeRx = (rpe: number) => rx({ loadScheme: { type: "RPE_BASED", rpe } });

describe("hardSetCredit (E5)", () => {
  it("gives full credit at RIR <= 3 (RPE >= 7)", () => {
    for (const rpe of [10, 9, 8, 7]) expect(hardSetCredit(rpeRx(rpe))).toBe(1);
  });

  it("gives half credit at RIR 4 and at fractional RIR strictly between 3 and 5", () => {
    expect(hardSetCredit(rpeRx(6))).toBe(0.5); // RIR 4
    expect(hardSetCredit(rpeRx(6.5))).toBe(0.5); // RIR 3.5
    expect(hardSetCredit(rpeRx(5.5))).toBe(0.5); // RIR 4.5
    expect(hardSetCredit(rpeRx(6.9))).toBe(0.5); // RIR 3.1
  });

  it("gives zero credit at RIR >= 5 (RPE <= 5)", () => {
    for (const rpe of [5, 4, 1]) expect(hardSetCredit(rpeRx(rpe))).toBe(0);
  });

  it("targetRpe takes precedence over an RPE_BASED load scheme", () => {
    const p = rx({ targetRpe: 5, loadScheme: { type: "RPE_BASED", rpe: 9 } });
    expect(prescribedRpe(p)).toBe(5);
    expect(hardSetCredit(p)).toBe(0);
  });

  it("targetRpe defines effort on any load scheme", () => {
    expect(hasDefinedEffort(rx({ targetRpe: 8 }))).toBe(true);
    expect(hasDefinedEffort(rx({ targetRpe: 8, loadScheme: { type: "PERCENT_1RM", percent: 0.7 } }))).toBe(true);
  });

  it("assumes RIR 2 (full credit) when no effort is stated", () => {
    for (const loadScheme of [
      { type: "BODYWEIGHT" } as const,
      { type: "FIXED_WEIGHT", weight: 50, unit: "kg" } as const,
      { type: "PERCENT_1RM", percent: 0.8 } as const,
    ]) {
      const p = rx({ loadScheme });
      expect(prescribedRpe(p)).toBeNull();
      expect(hasDefinedEffort(p)).toBe(false);
      expect(prescribedRir(p)).toBe(2);
      expect(hardSetCredit(p)).toBe(1);
    }
  });

  it("creditedSets multiplies targetSets by credit", () => {
    expect(creditedSets(rx({ targetSets: 10, targetRpe: 8 }))).toBe(10);
    expect(creditedSets(rx({ targetSets: 10, targetRpe: 6 }))).toBe(5);
    expect(creditedSets(rx({ targetSets: 10, targetRpe: 5 }))).toBe(0);
  });

  it("honours a custom config (assumed RIR, cut points, half credit)", () => {
    const strict = { fullCreditMaxRir: 1, zeroCreditMinRir: 3, halfCredit: 0.25, assumedRirWhenUndefined: 5 };
    expect(hardSetCredit(rx(), strict)).toBe(0); // undefined effort assumed RIR 5
    expect(hardSetCredit(rpeRx(9), strict)).toBe(1); // RIR 1
    expect(hardSetCredit(rpeRx(8), strict)).toBe(0.25); // RIR 2
    expect(hardSetCredit(rpeRx(7), strict)).toBe(0); // RIR 3
  });

  it("resolves the default config when none is supplied", () => {
    expect(resolveHardSetCreditConfig()).toBe(DEFAULT_HARD_SET_CREDIT);
    expect(resolveHardSetCreditConfig({})).toBe(DEFAULT_HARD_SET_CREDIT);
    const custom = { ...DEFAULT_HARD_SET_CREDIT, assumedRirWhenUndefined: 0 };
    expect(resolveHardSetCreditConfig({ hardSetCredit: custom })).toBe(custom);
  });
});