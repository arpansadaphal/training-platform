// ARCH-063 / B1: the headline is ranked by deficit, not by name.
//
// Before B1 the biggest opportunity was the first axis, in axis order, with the highest leverage. Production
// loads muscle groups sorted by name, so among tied Lows the headline was alphabetical ("biceps" for a program
// with no pulling, "calves" for a program with no legs). Ranking key (computeAssessment.ts, `compareRanked`):
// leverage, axis weight, axis type, deficit, config muscle priority, original order.

import { describe, expect, it } from "vitest";
import type { Analysis, AnalysisAxisResult } from "../../analysis/types";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import { computeAssessment } from "../computeAssessment";

const T = "2026-01-01T00:00:00.000Z";

const volumeBand = (v: number): string => (v < 6 ? "Low" : v < 20 ? "Adequate" : v < 30 ? "High" : "Excessive");
const vol = (muscle: string, value: number): AnalysisAxisResult => ({
  axisType: "VOLUME",
  scopeKey: muscle,
  metricValue: value,
  status: { kind: "BAND", band: volumeBand(value) },
});
const freqLow = (muscle: string, value = 0.5): AnalysisAxisResult => ({
  axisType: "FREQUENCY",
  scopeKey: muscle,
  metricValue: value,
  status: { kind: "BAND", band: "Low" },
});
const progressionIssue: AnalysisAxisResult = {
  axisType: "PROGRESSION_SOUNDNESS",
  scopeKey: null,
  metricValue: 1,
  status: { kind: "BAND", band: "Issue found" },
};
const recoveryHigh: AnalysisAxisResult = {
  axisType: "RECOVERY_COST",
  scopeKey: null,
  metricValue: 100,
  status: { kind: "BAND", band: "High" },
};

const assess = (...axisResults: AnalysisAxisResult[]) => {
  const analysis: Analysis = { programVersionId: "ranking", axisResults, computedAt: T };
  return computeAssessment(analysis, HYPERTROPHY_CONFIG, { goalId: "ranking-goal" }).assessment;
};
const keys = (axes: readonly { axisType: string; scopeKey: string | null }[]): string[] =>
  axes.map((a) => `${a.axisType}:${a.scopeKey ?? ""}`);

describe("B1: deficit beats name order", () => {
  // Names sort biceps < calves < chest; deficits are 1, 6, 3.
  const axes = [vol("biceps", 5), vol("calves", 0), vol("chest", 3)];

  it("the headline is the largest deficit, not the first name", () => {
    expect(keys([assess(...axes).biggestOpportunity!])).toEqual(["VOLUME:calves"]);
  });

  it("the attention areas follow the same order", () => {
    expect(keys(assess(...axes).attentionAreas)).toEqual(["VOLUME:chest", "VOLUME:biceps"]);
  });

  it("the result does not depend on the order the axes arrive in", () => {
    const forward = assess(...axes);
    const reversed = assess(...[...axes].reverse());
    expect(keys([reversed.biggestOpportunity!])).toEqual(keys([forward.biggestOpportunity!]));
    expect(keys(reversed.attentionAreas)).toEqual(keys(forward.attentionAreas));
    expect(reversed.actions.map((a) => a.rootCauseKey)).toEqual(forward.actions.map((a) => a.rootCauseKey));
  });
});

describe("B1: the configured muscle priority breaks a deficit tie", () => {
  it("quads, then lats, then calves when all three sit at 0 sets", () => {
    const a = assess(vol("calves", 0), vol("lats", 0), vol("quads", 0));
    expect(keys([a.biggestOpportunity!])).toEqual(["VOLUME:quads"]);
    expect(keys(a.attentionAreas)).toEqual(["VOLUME:lats", "VOLUME:calves"]);
  });

  it("a muscle the priority list does not name ranks after every named muscle", () => {
    const a = assess(vol("forearms", 0), vol("calves", 0));
    expect(keys([a.biggestOpportunity!])).toEqual(["VOLUME:calves"]);
    expect(keys(a.attentionAreas)).toEqual(["VOLUME:forearms"]);
  });

  it("is the config's list: a config without one falls back to the axis order", () => {
    const { musclePriority: _omitted, ...rest } = HYPERTROPHY_CONFIG;
    const analysis: Analysis = {
      programVersionId: "ranking",
      axisResults: [vol("calves", 0), vol("quads", 0)],
      computedAt: T,
    };
    const a = computeAssessment(analysis, rest, { goalId: "g" }).assessment;
    expect(keys([a.biggestOpportunity!])).toEqual(["VOLUME:calves"]);
  });

  it("deficit still outranks priority: the higher-priority muscle with the smaller deficit loses", () => {
    const a = assess(vol("quads", 5), vol("calves", 0));
    expect(keys([a.biggestOpportunity!])).toEqual(["VOLUME:calves"]);
  });
});

describe("B1: magnitude within the same severity", () => {
  it("0 sets leads 5 sets (both Low, MAJOR severity)", () => {
    const a = assess(vol("triceps", 5), vol("biceps", 0));
    expect(a.allAssessedAxes.every((x) => x.severity === "MAJOR")).toBe(true);
    expect(keys([a.biggestOpportunity!])).toEqual(["VOLUME:biceps"]);
  });

  it("an Excessive axis is ranked by how far past the High band it is (36 beats 31)", () => {
    const a = assess(vol("triceps", 31), vol("lats", 36));
    expect(keys([a.biggestOpportunity!])).toEqual(["VOLUME:lats"]);
    expect(keys(a.attentionAreas)).toEqual(["VOLUME:triceps"]);
  });

  it("FREQUENCY is ranked by its own distance below the Adequate band (0 beats 0.5)", () => {
    const a = assess(freqLow("chest", 0.5), freqLow("calves", 0));
    expect(keys([a.biggestOpportunity!])).toEqual(["FREQUENCY:calves"]);
  });
});

describe("B1: a lone finding is unchanged", () => {
  it("one VOLUME Low among Adequate axes is the headline, with no attention areas (Program L's shape)", () => {
    const a = assess(vol("chest", 12), vol("lats", 12), vol("calves", 5), vol("quads", 12));
    expect(keys([a.biggestOpportunity!])).toEqual(["VOLUME:calves"]);
    expect(a.attentionAreas).toEqual([]);
    expect(a.strengths).toHaveLength(3);
    expect(a.actions.map((x) => x.rootCauseKey)).toEqual(["volume:add-calves"]);
    expect(a.overallSummary).toBe("Identified 3 strengths, biggest opportunity on VOLUME:calves.");
  });

  it("nothing wrong still gives no headline", () => {
    const a = assess(vol("chest", 12), vol("lats", 12));
    expect(a.biggestOpportunity).toBeNull();
    expect(a.attentionAreas).toEqual([]);
  });
});

describe("B1: axes of different types", () => {
  it("leverage still decides first: a VOLUME Low (HIGH) beats PROGRESSION and RECOVERY (LOW)", () => {
    const a = assess(progressionIssue, recoveryHigh, vol("calves", 4));
    expect(keys([a.biggestOpportunity!])).toEqual(["VOLUME:calves"]);
  });

  it("at the same leverage, axis weight decides: PROGRESSION (MEDIUM) leads FREQUENCY (LOW), whatever the order", () => {
    const first = assess(freqLow("chest"), progressionIssue);
    const second = assess(progressionIssue, freqLow("chest"));
    for (const a of [first, second]) {
      expect(a.allAssessedAxes.every((x) => x.leverage === "LOW")).toBe(true);
      expect(keys([a.biggestOpportunity!])).toEqual(["PROGRESSION_SOUNDNESS:"]);
      expect(keys(a.attentionAreas)).toEqual(["FREQUENCY:chest"]);
    }
  });

  it("at the same leverage and weight, the Analysis's own axis order decides: PROGRESSION before RECOVERY", () => {
    const a = assess(vol("chest", 12), recoveryHigh, progressionIssue);
    // `typeOrder` is the order the Analysis lists the types, so RECOVERY first here means RECOVERY leads.
    expect(keys([a.biggestOpportunity!])).toEqual(["RECOVERY_COST:"]);
    const b = assess(vol("chest", 12), progressionIssue, recoveryHigh);
    expect(keys([b.biggestOpportunity!])).toEqual(["PROGRESSION_SOUNDNESS:"]);
  });
});

describe("B1: what ranking must not touch", () => {
  it("allAssessedAxes keeps the Analysis order (invariant 8: Fit reads the full roll-up)", () => {
    const input = [vol("biceps", 5), vol("calves", 0), vol("chest", 3)];
    expect(keys(assess(...input).allAssessedAxes)).toEqual(keys(input));
  });

  it("strengths keep the Analysis order", () => {
    const a = assess(vol("lats", 12), vol("chest", 12), vol("calves", 0));
    expect(keys(a.strengths)).toEqual(["VOLUME:lats", "VOLUME:chest"]);
  });

  it("is deterministic", () => {
    const input = [vol("biceps", 5), vol("calves", 0), vol("chest", 3), freqLow("lats"), progressionIssue];
    expect(JSON.stringify(assess(...input))).toBe(JSON.stringify(assess(...input)));
  });
});
