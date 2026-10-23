// ARCH-061: a rest day is in the rotation but in no axis. Two layers are
// checked: the helper that strips rest days, and the full analysis (all
// axes) that must not move when rest days are added.

import { describe, expect, it } from "vitest";
import { computeAnalysis } from "../../analysis/computeAnalysis";
import { testReferenceData } from "../../analysis/__fixtures__/exerciseReferenceData";
import { fullyCoveredProgram } from "../../analysis/__fixtures__/programStructures";
import { TEST_CONFIG_BOUNDED } from "../../analysis/__fixtures__/testGoalProfiles";
import { computeAssessment } from "../../assessment/computeAssessment";
import type { ProgramStructure } from "../../types";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";
import { REST_DAY_NAME, isRestDay, makeRestDay, trainingDayCount, withoutRestDays } from "../restDay";

function withRestDays(base: ProgramStructure): ProgramStructure {
  const n = base.workoutDays.length;
  return {
    ...base,
    workoutDays: [
      ...base.workoutDays,
      makeRestDay("rest-1", n),
      makeRestDay("rest-2", n + 1),
    ],
  };
}

describe("rest day helpers", () => {
  it("makes an empty, flagged day", () => {
    const d = makeRestDay("r", 3);
    expect(d).toEqual({ id: "r", orderIndex: 3, name: REST_DAY_NAME, prescriptions: [], isRestDay: true });
    expect(isRestDay(d)).toBe(true);
    expect(isRestDay({})).toBe(false);
  });

  it("strips rest days and counts training days only", () => {
    const s = withRestDays(fullyCoveredProgram);
    expect(s.workoutDays.length).toBe(fullyCoveredProgram.workoutDays.length + 2);
    expect(trainingDayCount(s)).toBe(fullyCoveredProgram.workoutDays.length);
    expect(withoutRestDays(s)).toEqual(fullyCoveredProgram);
    // No rest days: the same object comes back.
    expect(withoutRestDays(fullyCoveredProgram)).toBe(fullyCoveredProgram);
  });

  it("copy passes the forbidden-phrase lint", () => {
    assertCleanCopy([
      REST_DAY_NAME,
      "Rest day — no training scheduled.",
      "Continue to next day",
      "A rest day is not counted as a missed session.",
      "Rest day: no exercises. It sits in your rotation and is left out of the analysis.",
      "Rest day done.",
      "Open rest day",
      "Next up: rest day",
    ]);
  });
});

describe("rest days do not count toward any axis", () => {
  const analyze = (s: ProgramStructure) =>
    computeAnalysis(withoutRestDays(s), testReferenceData, TEST_CONFIG_BOUNDED, {
      now: () => new Date("2026-01-01T00:00:00Z"),
    });

  it("leaves volume, frequency, selection balance, progression and recovery unchanged", () => {
    const plain = analyze(fullyCoveredProgram);
    const withRest = analyze(withRestDays(fullyCoveredProgram));
    expect(withRest.axisResults).toEqual(plain.axisResults);
    // And the same assessment on top of it.
    expect(computeAssessment(withRest, TEST_CONFIG_BOUNDED, { goalId: "test-goal" })).toEqual(
      computeAssessment(plain, TEST_CONFIG_BOUNDED, { goalId: "test-goal" }),
    );
  });

  it("holds even for the raw engine, which already ignores a day with no prescriptions", () => {
    // Defence in depth: the strip is at the boundary, but the engine itself
    // reads zero from an empty day on every axis, so a missed call site would
    // still not move a number.
    const now = () => new Date("2026-01-01T00:00:00Z");
    const raw = computeAnalysis(withRestDays(fullyCoveredProgram), testReferenceData, TEST_CONFIG_BOUNDED, { now });
    expect(raw.axisResults).toEqual(analyze(fullyCoveredProgram).axisResults);
  });
});
