// packages/domain/src/analysis/__tests__/volume.effort.test.ts
import { describe, expect, it } from "vitest";
import type { ExercisePrescriptionStructure, ProgramStructure } from "../../types";
import { computeVolumeAxis } from "../volume";
import { testReferenceData } from "../__fixtures__/exerciseReferenceData";
import { TEST_CONFIG_BOUNDED } from "../__fixtures__/testGoalProfiles";

// bench involvement in the fixture: chest 1.0, shoulders 0.4. VOLUME bands (test config): Low < 8, Adequate 8-16.
const prog = (...rows: Partial<ExercisePrescriptionStructure>[]): ProgramStructure => ({
  workoutDays: [
    {
      id: "d1",
      orderIndex: 0,
      name: "D",
      prescriptions: rows.map((r, i) => ({
        id: `p${i}`,
        orderIndex: i,
        exerciseId: "bench",
        targetSets: 10,
        targetRepsLow: 8,
        targetRepsHigh: 12,
        loadScheme: { type: "BODYWEIGHT" },
        ...r,
      })),
    },
  ],
});
const chest = (s: ProgramStructure, config = TEST_CONFIG_BOUNDED) =>
  computeVolumeAxis(s, testReferenceData, config).find((r) => r.scopeKey === "chest")!;
const shoulders = (s: ProgramStructure) =>
  computeVolumeAxis(s, testReferenceData, TEST_CONFIG_BOUNDED).find((r) => r.scopeKey === "shoulders")!;

describe("computeVolumeAxis: effort-aware counting (E5)", () => {
  it("counts sets at RPE 7 and above in full", () => {
    expect(chest(prog({ targetRpe: 7 })).metricValue).toBeCloseTo(10);
    expect(chest(prog({ targetRpe: 10 })).metricValue).toBeCloseTo(10);
  });

  it("counts sets at RPE 6 (RIR 4) at half credit", () => {
    expect(chest(prog({ targetRpe: 6 })).metricValue).toBeCloseTo(5);
  });

  it("counts sets at RPE 5 or below (RIR >= 5) as zero", () => {
    expect(chest(prog({ targetRpe: 5 })).metricValue).toBeCloseTo(0);
    expect(chest(prog({ targetRpe: 3 })).metricValue).toBeCloseTo(0);
  });

  it("a sandbagged program no longer reads Adequate", () => {
    expect(chest(prog({ targetRpe: 8 })).status).toEqual({ kind: "BAND", band: "Adequate" });
    expect(chest(prog({ targetRpe: 5 })).status).toEqual({ kind: "BAND", band: "Low" });
  });

  it("applies credit per prescription and sums", () => {
    // 6 sets at RPE 8 (6.0) + 4 sets at RPE 5 (0)
    expect(chest(prog({ targetSets: 6, targetRpe: 8 }, { targetSets: 4, targetRpe: 5 })).metricValue).toBeCloseTo(6);
  });

  it("scales indirect involvement by the same credit", () => {
    expect(shoulders(prog({ targetRpe: 8 })).metricValue).toBeCloseTo(4); // 10 x 0.4
    expect(shoulders(prog({ targetRpe: 6 })).metricValue).toBeCloseTo(2); // 10 x 0.5 x 0.4
  });

  it("targetRpe overrides an RPE_BASED load scheme", () => {
    const p = prog({ targetRpe: 5, loadScheme: { type: "RPE_BASED", rpe: 9 } });
    expect(chest(p).metricValue).toBeCloseTo(0);
  });

  it("uses an RPE_BASED load scheme when targetRpe is absent", () => {
    expect(chest(prog({ loadScheme: { type: "RPE_BASED", rpe: 6 } })).metricValue).toBeCloseTo(5);
  });

  it("assumes RIR 2 (full credit) when no effort is stated", () => {
    expect(chest(prog({})).metricValue).toBeCloseTo(10);
    expect(chest(prog({ loadScheme: { type: "PERCENT_1RM", percent: 0.8 } })).metricValue).toBeCloseTo(10);
  });

  it("honours config.hardSetCredit", () => {
    const strict = { ...TEST_CONFIG_BOUNDED, hardSetCredit: { fullCreditMaxRir: 0, zeroCreditMinRir: 2, halfCredit: 0.5, assumedRirWhenUndefined: 2 } };
    expect(chest(prog({ targetRpe: 8 }), strict).metricValue).toBeCloseTo(0); // RIR 2 -> zero under this config
    expect(chest(prog({ targetRpe: 9 }), strict).metricValue).toBeCloseTo(5); // RIR 1 -> half
    expect(chest(prog({ targetRpe: 10 }), strict).metricValue).toBeCloseTo(10); // RIR 0 -> full
  });
});