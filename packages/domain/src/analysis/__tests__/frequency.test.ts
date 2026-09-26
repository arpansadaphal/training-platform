// packages/domain/src/analysis/__tests__/frequency.test.ts
import { describe, expect, it } from "vitest";
import { computeFrequencyAxis } from "../frequency";
import { testReferenceData } from "../__fixtures__/exerciseReferenceData";
import {
  fullyCoveredProgram,
  programWithGaps,
  emptyProgram,
} from "../__fixtures__/programStructures";
import {
  TEST_CONFIG_ALL_NULL,
  TEST_CONFIG_BOUNDED,
} from "../__fixtures__/testGoalProfiles";

describe("computeFrequencyAxis", () => {
  it("counts distinct days touching each muscle group", () => {
    const results = computeFrequencyAxis(
      programWithGaps,
      testReferenceData,
      TEST_CONFIG_BOUNDED,
    );
    const by = (id: string) => results.find((r) => r.scopeKey === id)!;
    // chest: touched on d1 only (bench)
    expect(by("chest").metricValue).toBe(1);
    // quads: touched on d2 only (squat)
    expect(by("quads").metricValue).toBe(1);
    // hamstrings: touched on d2 only, via squat's partial involvement
    // (involvementFactor 0.3, which is > 0 and therefore counts as touching
    // the muscle group on that day, per frequency.ts's documented rule).
    expect(by("hamstrings").metricValue).toBe(1);
  });

  it("bands a below-range count to Low", () => {
    const results = computeFrequencyAxis(
      programWithGaps,
      testReferenceData,
      TEST_CONFIG_BOUNDED,
    );
    // chest appears once (< 2 -> Low)
    expect(results.find((r) => r.scopeKey === "chest")!.status).toEqual({
      kind: "BAND",
      band: "Low",
    });
  });

  it("bands an in-range count to Adequate (via a hand-built structure)", () => {
    // Build a structure touching chest on three distinct days.
    const structure = {
      workoutDays: ["d1", "d2", "d3"].map((id, i) => ({
        id,
        orderIndex: i,
        name: id,
        prescriptions: [
          {
            id: "p1",
            orderIndex: 0,
            exerciseId: "bench",
            targetSets: 3,
            targetRepsLow: 8,
            targetRepsHigh: 12,
            loadScheme: { type: "RPE_BASED" as const, rpe: 8 },
          },
        ],
      })),
    };
    const results = computeFrequencyAxis(structure, testReferenceData, TEST_CONFIG_BOUNDED);
    expect(results.find((r) => r.scopeKey === "chest")!.status).toEqual({
      kind: "BAND",
      band: "Adequate",
    });
  });

  it("bands an above-range count to High (via a hand-built structure)", () => {
    const structure = {
      workoutDays: ["d1", "d2", "d3", "d4", "d5"].map((id, i) => ({
        id,
        orderIndex: i,
        name: id,
        prescriptions: [
          {
            id: "p1",
            orderIndex: 0,
            exerciseId: "bench",
            targetSets: 3,
            targetRepsLow: 8,
            targetRepsHigh: 12,
            loadScheme: { type: "RPE_BASED" as const, rpe: 8 },
          },
        ],
      })),
    };
    const results = computeFrequencyAxis(structure, testReferenceData, TEST_CONFIG_BOUNDED);
    expect(results.find((r) => r.scopeKey === "chest")!.status).toEqual({
      kind: "BAND",
      band: "High",
    });
  });

  it("zero relevant prescriptions -> metricValue 0 (edge case)", () => {
    const results = computeFrequencyAxis(emptyProgram, testReferenceData, TEST_CONFIG_BOUNDED);
    for (const r of results) expect(r.metricValue).toBe(0);
  });

  it("returns UNVALIDATED for every muscle group with all-null bands", () => {
    const results = computeFrequencyAxis(
      fullyCoveredProgram,
      testReferenceData,
      TEST_CONFIG_ALL_NULL,
    );
    for (const r of results) expect(r.status.kind).toBe("UNVALIDATED");
  });
});