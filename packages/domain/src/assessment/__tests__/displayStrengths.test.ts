import { describe, expect, it } from "vitest";
import { displayStrengths, EARNED_VOLUME_SETS } from "../displayStrengths";
import type { AssessedAxis } from "../types";

// ARCH-065 / Fix 4. A strength has to be earned: the engine's strengths include a muscle at the very floor of the
// range and an effort check that passes on effort the checker assumed. Display only.
const axis = (axisType: AssessedAxis["axisType"], scopeKey: string | null, metricValue: number): AssessedAxis =>
  ({
    axisType,
    scopeKey,
    metricValue,
    status: { kind: "BAND", band: "x" },
    weight: "HIGH",
    severity: "NONE",
    leverage: "NONE",
  }) as unknown as AssessedAxis;

describe("displayStrengths", () => {
  it("a muscle at the floor of the range (6 sets) is a pass, not a strength", () => {
    const shown = displayStrengths([axis("VOLUME", "biceps", 6), axis("VOLUME", "chest", 9.5), axis("VOLUME", "quads", 12)]);
    expect(shown.map((a) => a.scopeKey)).toEqual(["quads"]);
    expect(EARNED_VOLUME_SETS).toBe(10);
  });

  it("10 sets is the first number that is earned", () => {
    expect(displayStrengths([axis("VOLUME", "lats", 10)])).toHaveLength(1);
    expect(displayStrengths([axis("VOLUME", "lats", 9.9)])).toHaveLength(0);
  });

  it("exercise selection is a strength only when every required pattern is covered", () => {
    expect(displayStrengths([axis("EXERCISE_SELECTION_BALANCE", null, 1)])).toHaveLength(1);
    expect(displayStrengths([axis("EXERCISE_SELECTION_BALANCE", null, 5 / 6)])).toHaveLength(0);
  });

  it("effort is never a strength when it was assumed, and is shown as the engine has it when it was stated", () => {
    const effort = axis("PROGRESSION_SOUNDNESS", null, 0);
    expect(displayStrengths([effort], { effortAssumed: true })).toHaveLength(0);
    expect(displayStrengths([effort], { effortAssumed: false })).toHaveLength(1);
    expect(displayStrengths([effort])).toHaveLength(1);
  });

  it("changes nothing it was not asked to: the input is not modified", () => {
    const input = [axis("VOLUME", "biceps", 6)];
    displayStrengths(input);
    expect(input).toHaveLength(1);
  });
});
