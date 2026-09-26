// packages/domain/src/analysis/__tests__/volume.test.ts
import { describe, expect, it } from "vitest";
import { computeVolumeAxis } from "../volume";
import { testReferenceData } from "../__fixtures__/exerciseReferenceData";
import {
  fullyCoveredProgram,
  programWithGaps,
} from "../__fixtures__/programStructures";
import {
  TEST_CONFIG_ALL_NULL,
  TEST_CONFIG_BOUNDED,
} from "../__fixtures__/testGoalProfiles";

describe("computeVolumeAxis", () => {
  it("returns one result per muscle group in reference data", () => {
    const results = computeVolumeAxis(
      fullyCoveredProgram,
      testReferenceData,
      TEST_CONFIG_BOUNDED,
    );
    expect(results.map((r) => r.scopeKey).sort()).toEqual(
      testReferenceData.muscleGroups.map((m) => m.id).sort(),
    );
    for (const r of results) expect(r.axisType).toBe("VOLUME");
  });

  it("sums targetSets * involvementFactor per muscle group", () => {
    // fullyCoveredProgram: bench 3x (chest 1.0, shoulders 0.4), incline n/a,
    // ohp 3x (shoulders 1.0), squat 3x (quads 1.0, ham 0.3), deadlift 3x (ham 0.8, back 0.5).
    const results = computeVolumeAxis(
      fullyCoveredProgram,
      testReferenceData,
      TEST_CONFIG_BOUNDED,
    );
    const by = (id: string) => results.find((r) => r.scopeKey === id)!;
    expect(by("chest").metricValue).toBeCloseTo(3);
    expect(by("quads").metricValue).toBeCloseTo(3);
    expect(by("hamstrings").metricValue).toBeCloseTo(3 * 0.3 + 3 * 0.8);
    expect(by("shoulders").metricValue).toBeCloseTo(3 * 0.4 + 3 * 1.0);
  });

  it("bands a below-range value to Low", () => {
    const results = computeVolumeAxis(
      fullyCoveredProgram,
      testReferenceData,
      TEST_CONFIG_BOUNDED,
    );
    // chest = 3, which is < 8 -> Low
    expect(results.find((r) => r.scopeKey === "chest")!.status).toEqual({
      kind: "BAND",
      band: "Low",
    });
  });

  it("bands an in-range value to Adequate (via a hand-built structure)", () => {
    const structure = {
      workoutDays: [
        {
          id: "d1",
          orderIndex: 0,
          name: "X",
          prescriptions: [
            {
              id: "p1",
              orderIndex: 0,
              exerciseId: "bench",
              targetSets: 10,
              targetRepsLow: 8,
              targetRepsHigh: 12,
              loadScheme: { type: "RPE_BASED" as const, rpe: 8 },
            },
          ],
        },
      ],
    };
    const results = computeVolumeAxis(structure, testReferenceData, TEST_CONFIG_BOUNDED);
    // chest = 10 (in [8, 16))
    expect(results.find((r) => r.scopeKey === "chest")!.status).toEqual({
      kind: "BAND",
      band: "Adequate",
    });
  });

  it("bands an above-range value to Excessive (via a hand-built structure)", () => {
    const structure = {
      workoutDays: [
        {
          id: "d1",
          orderIndex: 0,
          name: "X",
          prescriptions: [
            {
              id: "p1",
              orderIndex: 0,
              exerciseId: "bench",
              targetSets: 40,
              targetRepsLow: 8,
              targetRepsHigh: 12,
              loadScheme: { type: "RPE_BASED" as const, rpe: 8 },
            },
          ],
        },
      ],
    };
    const results = computeVolumeAxis(structure, testReferenceData, TEST_CONFIG_BOUNDED);
    expect(results.find((r) => r.scopeKey === "chest")!.status).toEqual({
      kind: "BAND",
      band: "Excessive",
    });
  });

  it("returns UNVALIDATED for every muscle group with all-null bands", () => {
    const results = computeVolumeAxis(
      programWithGaps,
      testReferenceData,
      TEST_CONFIG_ALL_NULL,
    );
    for (const r of results) expect(r.status.kind).toBe("UNVALIDATED");
  });

  it("zero relevant prescriptions -> metricValue 0 (edge case)", () => {
    const structure = {
      workoutDays: [
        {
          id: "d1",
          orderIndex: 0,
          name: "Empty",
          prescriptions: [],
        },
      ],
    };
    const results = computeVolumeAxis(structure, testReferenceData, TEST_CONFIG_BOUNDED);
    for (const r of results) expect(r.metricValue).toBe(0);
  });
});