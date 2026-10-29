// ARCH-063 / B2: findings. One problem, said once.
//
// Before B2 a program with no leg work produced nine cards (four VOLUME Lows, four FREQUENCY "no exposure" cards
// for the same muscles, and a hidden Exercise-selection gap), and Program A produced eighteen. The axes are not
// dropped: they stay in allAssessedAxes, which is what the Fit band reads (invariant 8). Only what is surfaced is
// grouped.

import { describe, expect, it } from "vitest";
import type { Analysis, AnalysisAxisResult, MovementPattern } from "../../analysis/types";
import { findingSentence } from "../../copy/findingSentence";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";
import { computeAssessment } from "../computeAssessment";
import { projectFitBand } from "../computeFitScore";

const T = "2026-01-01T00:00:00.000Z";
const MUSCLES = ["chest", "lats", "upper back", "side delts", "rear delts", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves"];

const volumeBand = (v: number): string => (v < 6 ? "Low" : v < 20 ? "Adequate" : v < 30 ? "High" : "Excessive");
const vol = (muscle: string, value: number): AnalysisAxisResult => ({
  axisType: "VOLUME",
  scopeKey: muscle,
  metricValue: value,
  status: { kind: "BAND", band: volumeBand(value) },
});
const freq = (muscle: string, value: number): AnalysisAxisResult => ({
  axisType: "FREQUENCY",
  scopeKey: muscle,
  metricValue: value,
  status: { kind: "BAND", band: value < 1 ? "Low" : "Adequate" },
});
const esb = (missing: readonly MovementPattern[]): AnalysisAxisResult => {
  const ratio = (6 - missing.length) / 6;
  return {
    axisType: "EXERCISE_SELECTION_BALANCE",
    scopeKey: null,
    metricValue: ratio,
    status: { kind: "BAND", band: ratio >= 0.75 ? "Balanced" : "Gaps present" },
    ...(missing.length > 0 ? { facts: { missingPatterns: missing } } : {}),
  };
};
const progressionSound: AnalysisAxisResult = {
  axisType: "PROGRESSION_SOUNDNESS",
  scopeKey: null,
  metricValue: 0,
  status: { kind: "BAND", band: "Sound" },
};
const recoveryModerate: AnalysisAxisResult = {
  axisType: "RECOVERY_COST",
  scopeKey: null,
  metricValue: 60,
  status: { kind: "BAND", band: "Moderate" },
};

/** Every relevant muscle at `value` sets unless overridden; FREQUENCY adequate for all. */
function program(overrides: Record<string, number>, ...extra: AnalysisAxisResult[]): AnalysisAxisResult[] {
  return [
    ...MUSCLES.map((m) => vol(m, overrides[m] ?? 12)),
    ...MUSCLES.map((m) => freq(m, 1)),
    esb([]),
    progressionSound,
    recoveryModerate,
    ...extra,
  ];
}
/** Replace the matching axes of `base` (by type and scope) with `replacements`. */
function with_(base: AnalysisAxisResult[], ...replacements: AnalysisAxisResult[]): AnalysisAxisResult[] {
  return base.map(
    (a) => replacements.find((r) => r.axisType === a.axisType && r.scopeKey === a.scopeKey) ?? a,
  );
}

const assess = (axisResults: AnalysisAxisResult[]) => {
  const analysis: Analysis = { programVersionId: "findings", axisResults, computedAt: T };
  return computeAssessment(analysis, HYPERTROPHY_CONFIG, { goalId: "findings-goal" }).assessment;
};
const keysOf = (a: ReturnType<typeof assess>): string[] => (a.findings ?? []).map((f) => f.key);

describe("B2a: a region with no training at all is one finding (F2's shape)", () => {
  // No legs: the lower body at 0 sets, FREQUENCY "no exposure" for each, chest frequency low, and the Exercise
  // selection axis missing squat, hinge and vertical push.
  const noLegs = with_(
    program({ quads: 0, hamstrings: 0, glutes: 0, calves: 0 }),
    ...["quads", "hamstrings", "glutes", "calves"].map((m) => freq(m, 0)),
    freq("chest", 0.667),
    esb(["SQUAT", "HINGE", "VERTICAL_PUSH"]),
  );
  const a = assess(noLegs);

  it("nine surfaced cards become three findings", () => {
    expect(keysOf(a)).toEqual(["region:lower", "FREQUENCY:chest", "pattern:gaps"]);
    expect((a.biggestOpportunity ? 1 : 0) + a.attentionAreas.length).toBe(3);
  });

  it("the headline is the lower-body finding, led by the highest-priority member", () => {
    const f = a.findings![0]!;
    expect(f.kind).toBe("REGION");
    expect(f.absent).toBe(true);
    expect(f.lead.scopeKey).toBe("quads");
    expect(f.members.map((m) => m.muscle)).toEqual(["quads", "hamstrings", "glutes", "calves"]);
    expect(a.biggestOpportunity).toBe(f.lead);
  });

  it("the sentence says it once, with the numbers", () => {
    expect(findingSentence(a.findings![0]!, HYPERTROPHY_CONFIG)).toBe(
      "No lower-body training: quads, hamstrings, glutes and calves get 0 hard sets a week.",
    );
  });

  it("squat and hinge are absorbed by the region; only the vertical push gap is left", () => {
    const gaps = a.findings!.find((f) => f.key === "pattern:gaps")!;
    expect(gaps.patterns).toEqual(["vertical-push"]);
    expect(gaps.missingPatterns).toEqual(["VERTICAL_PUSH"]);
    expect(findingSentence(gaps, HYPERTROPHY_CONFIG)).toBe("No vertical pushing exercise in the program.");
  });

  it("there is one action for the region, not nine", () => {
    expect(a.actions.map((x) => x.rootCauseKey)).toEqual([
      "volume:add-region-lower",
      "frequency:split-chest",
      "exerciseSelectionBalance:fill-gaps",
    ]);
    expect(a.actions[0]!.description).toMatch(/^Add a leg day: a squat or leg press, a Romanian deadlift, a leg curl and a calf raise/);
  });

  it("invariant 8: the roll-up still holds every axis, so Fit sees all of them", () => {
    expect(a.allAssessedAxes).toHaveLength(noLegs.length);
    expect(a.allAssessedAxes.filter((x) => x.axisType === "VOLUME" && x.status.band === "Low")).toHaveLength(4);
  });
});

describe("B2a: several Lows in one region are one finding (Program A's shape)", () => {
  // Every muscle low: upper (5), arms (2), lower (4) Lows, and FREQUENCY "no exposure" for most.
  const allLow = with_(
    program({ chest: 2, lats: 4, "upper back": 2, "side delts": 1, "rear delts": 1, biceps: 2, triceps: 2, quads: 2, hamstrings: 2, glutes: 2, calves: 0 }),
    ...["upper back", "side delts", "rear delts", "biceps", "triceps", "glutes", "calves"].map((m) => freq(m, 0)),
  );
  const a = assess(allLow);

  it("seventeen attention areas and a headline become three findings", () => {
    expect(keysOf(a).sort()).toEqual(["region:arms", "region:lower", "region:upper"]);
  });

  it("each region's members are listed, best-ranked first, with their sets", () => {
    const lower = a.findings!.find((f) => f.key === "region:lower")!;
    expect(lower.absent).toBe(false);
    expect(lower.members).toEqual([
      { muscle: "calves", sets: 0 },
      { muscle: "quads", sets: 2 },
      { muscle: "hamstrings", sets: 2 },
      { muscle: "glutes", sets: 2 },
    ]);
    expect(findingSentence(lower, HYPERTROPHY_CONFIG)).toBe(
      "Lower-body volume is low: calves 0, quads 2, hamstrings 2 and glutes 2 hard sets a week, under the 6–20 range the evidence supports.",
    );
  });

  it("the Fit band still reads every underlying finding: NEEDS_WORK, not softened by grouping", () => {
    const fit = projectFitBand(a);
    expect(fit.band).toBe("NEEDS_WORK");
    // 11 VOLUME Lows (MAJOR x HIGH) plus 7 FREQUENCY Lows count toward breadth, whatever is surfaced.
    expect(a.allAssessedAxes.filter((x) => x.leverage !== "NONE" && x.severity !== "MINOR").length).toBe(18);
  });

  it("a region with one Low muscle stays a single-axis finding", () => {
    const one = assess(program({ calves: 3 }));
    expect(keysOf(one)).toEqual(["VOLUME:calves"]);
    expect(one.findings![0]!.kind).toBe("AXIS");
  });

  it("a region is 'absent' only when every in-scope muscle is at 0 sets", () => {
    const nearly = assess(program({ quads: 0, hamstrings: 0, glutes: 0, calves: 4 }));
    const f = nearly.findings!.find((x) => x.key === "region:lower")!;
    expect(f.absent).toBe(false);
    expect(findingSentence(f, HYPERTROPHY_CONFIG)).toMatch(/^Lower-body volume is low: /);
  });
});

describe("B2c: a whole missing movement pattern is surfaced (Starting Strength's shape)", () => {
  const noPulling = with_(
    program({ lats: 0, "upper back": 0, biceps: 0, "rear delts": 0, "side delts": 1.5, chest: 3, triceps: 3 }),
    esb(["HORIZONTAL_PULL", "VERTICAL_PULL"]),
  );
  const a = assess(noPulling);

  it("leads with 'no pulling', not with a muscle", () => {
    expect(a.findings![0]!.key).toBe("pattern:pull");
    expect(a.findings![0]!.kind).toBe("PATTERN");
    expect(findingSentence(a.findings![0]!, HYPERTROPHY_CONFIG)).toBe(
      "No pulling exercises: lats and upper back get 0 hard sets a week.",
    );
  });

  it("absorbs the muscles it explains, so they are not also listed on their own", () => {
    const all = a.findings!.flatMap((f) => [f.lead.scopeKey, ...f.members.map((m) => m.muscle)]);
    const pull = a.findings![0]!;
    expect(pull.members.map((m) => m.muscle)).toEqual(["lats", "upper back"]);
    for (const other of a.findings!.slice(1)) {
      expect(other.members.map((m) => m.muscle)).not.toContain("lats");
      expect(other.lead.scopeKey).not.toBe("lats");
    }
    expect(all.length).toBeGreaterThan(0);
  });

  it("the action is the one Tier 3 line for pulling", () => {
    expect(a.actions[0]).toMatchObject({
      rootCauseKey: "exerciseSelectionBalance:add-pull",
      description: "Add 3 sets of rows and 3 of pulldowns.",
    });
  });

  it("states real numbers when the muscles are not at zero", () => {
    const noHinge = assess(with_(program({ hamstrings: 1.5, glutes: 4.5 }), esb(["HINGE"])));
    expect(findingSentence(noHinge.findings![0]!, HYPERTROPHY_CONFIG)).toBe(
      "No hinge exercises: hamstrings 1.5 and glutes 4.5 hard sets a week.",
    );
  });

  it("a missing pattern that is not a whole group stays silent (rows but no pulldown)", () => {
    const rowsOnly = assess(with_(program({}), esb(["VERTICAL_PULL"])));
    expect(rowsOnly.findings).toEqual([]);
    expect(rowsOnly.biggestOpportunity).toBeNull();
    // Balanced band, NONE severity, exactly as before B2.
    const axis = rowsOnly.allAssessedAxes.find((x) => x.axisType === "EXERCISE_SELECTION_BALANCE")!;
    expect(axis.severity).toBe("NONE");
  });

  it("a gap that explains no Low is led by the Exercise-selection axis and names every missing pattern", () => {
    const noPress = assess(with_(program({}), esb(["VERTICAL_PUSH", "VERTICAL_PULL"])));
    const f = noPress.findings![0]!;
    expect(f.key).toBe("pattern:gaps");
    expect(f.lead.axisType).toBe("EXERCISE_SELECTION_BALANCE");
    expect(findingSentence(f, HYPERTROPHY_CONFIG)).toBe("No vertical pushing or vertical pulling exercise in the program.");
    expect(noPress.actions[0]!.description).toBe(
      "Add an overhead or shoulder press and a pulldown or chin-up, about 3 sets each.",
    );
  });
});

describe("B2c: the Exercise-selection severity bump", () => {
  const axisOf = (a: ReturnType<typeof assess>) =>
    a.allAssessedAxes.find((x) => x.axisType === "EXERCISE_SELECTION_BALANCE")!;

  it("raises severity to MODERATE (LOW leverage) while a whole pattern group is absent, even on a Balanced band", () => {
    const axis = axisOf(assess(with_(program({}), esb(["VERTICAL_PUSH"]))));
    expect(axis.status.band).toBe("Balanced");
    expect(axis.severity).toBe("MODERATE");
    expect(axis.leverage).toBe("LOW");
  });

  it("leaves band, metric and weight untouched", () => {
    const axis = axisOf(assess(with_(program({}), esb(["VERTICAL_PUSH"]))));
    expect(axis.metricValue).toBeCloseTo(5 / 6);
    expect(axis.weight).toBe("LOW");
  });

  it("does not touch an axis with no whole group missing: Gaps present stays MINOR, NONE leverage", () => {
    const axis = axisOf(assess(with_(program({}), esb(["HORIZONTAL_PUSH", "VERTICAL_PULL"]))));
    expect(axis.status.band).toBe("Gaps present");
    expect(axis.severity).toBe("MINOR");
    expect(axis.leverage).toBe("NONE");
  });

  it("is not a strength while the group is absent, and counts toward Fit breadth like any MODERATE finding", () => {
    const a = assess(with_(program({}), esb(["VERTICAL_PUSH"])));
    expect(a.strengths.map((s) => s.axisType)).not.toContain("EXERCISE_SELECTION_BALANCE");
    expect(projectFitBand(a).band).toBe("STRONG"); // one finding is below the breadth floor of three
  });
});

describe("B2b: restored de-duplication across VOLUME and FREQUENCY", () => {
  it("drops a 'no exposure' FREQUENCY axis for a muscle that already has a VOLUME Low", () => {
    const a = assess(with_(program({ calves: 3 }), freq("calves", 0)));
    expect(keysOf(a)).toEqual(["VOLUME:calves"]);
    expect(a.actions.map((x) => x.rootCauseKey)).toEqual(["volume:add-calves"]);
  });

  it("keeps a 'no exposure' FREQUENCY axis when the volume is in range: it says something distinct", () => {
    const a = assess(with_(program({}), freq("calves", 0)));
    expect(keysOf(a)).toEqual(["FREQUENCY:calves"]);
    expect(a.actions[0]!.description).toMatch(/at least one session/);
  });

  it("keeps an under-distributed FREQUENCY axis", () => {
    const a = assess(with_(program({ chest: 24 }), freq("chest", 0.667)));
    expect(keysOf(a)).toEqual(["FREQUENCY:chest"]);
  });
});

describe("B2: nothing else about the roll-up moves", () => {
  it("biggestOpportunity and attentionAreas are exactly the findings' lead axes", () => {
    const a = assess(with_(program({ quads: 0, hamstrings: 0, glutes: 0, calves: 0 }), esb(["SQUAT", "HINGE"])));
    const leads = a.findings!.map((f) => f.lead);
    expect(a.biggestOpportunity).toBe(leads[0]);
    expect(a.attentionAreas).toEqual(leads.slice(1));
  });

  it("is deterministic", () => {
    const input = with_(program({ quads: 0, hamstrings: 0, glutes: 0, calves: 0 }), esb(["SQUAT", "HINGE"]));
    expect(JSON.stringify(assess(input))).toBe(JSON.stringify(assess(input)));
  });

  it("all new copy passes the forbidden-copy lint", () => {
    const inputs = [
      with_(program({ quads: 0, hamstrings: 0, glutes: 0, calves: 0 }), esb(["SQUAT", "HINGE", "VERTICAL_PUSH"])),
      with_(program({ lats: 0, "upper back": 0 }), esb(["HORIZONTAL_PULL", "VERTICAL_PULL"])),
      with_(program({ hamstrings: 1.5, glutes: 4.5 }), esb(["HINGE"])),
      with_(program({}), esb(["VERTICAL_PUSH", "VERTICAL_PULL"])),
      program({ chest: 2, lats: 4, "upper back": 2, "side delts": 1, "rear delts": 1 }),
    ];
    const lines = inputs.flatMap((input) => {
      const a = assess(input);
      return [
        ...(a.findings ?? []).map((f) => findingSentence(f, HYPERTROPHY_CONFIG) ?? ""),
        ...a.actions.map((x) => x.description),
      ].filter((l) => l.length > 0);
    });
    expect(lines.length).toBeGreaterThan(8);
    assertCleanCopy(lines);
  });
});

describe("B3: the near-failure finding (Program J's shape)", () => {
  const nearFailure = (share: number): AnalysisAxisResult => ({
    axisType: "PROGRESSION_SOUNDNESS",
    scopeKey: null,
    metricValue: 1,
    status: { kind: "BAND", band: "Issue found" },
    facts: { failedChecks: [{ id: "NEAR_FAILURE", share, detail: `${share * 100}% of sets at RIR 0 (max 50%)` }] },
  });
  const recoveryHigh: AnalysisAxisResult = {
    axisType: "RECOVERY_COST",
    scopeKey: null,
    metricValue: 120,
    status: { kind: "BAND", band: "High" },
  };
  // J: nothing wrong with volume, one failed effort check, high recovery cost, and no overhead press or pulldown.
  const j = with_(program({}), nearFailure(1), recoveryHigh, esb(["VERTICAL_PUSH", "VERTICAL_PULL"]));
  const a = assess(j);

  it("leads with near-failure: Effort & rep ranges outranks Recovery cost and the selection gap on weight", () => {
    // Recovery cost High is MINOR severity, below the materiality bar, so it is not an attention area; the
    // selection gap is MODERATE (the whole-pattern bump) and is.
    expect(keysOf(a)).toEqual(["PROGRESSION_SOUNDNESS", "pattern:gaps"]);
    expect(a.allAssessedAxes.find((x) => x.axisType === "RECOVERY_COST")!.leverage).toBe("LOW");
  });

  it("says it in the words the brief gives, with the share the engine measured", () => {
    expect(findingSentence(a.findings![0]!, HYPERTROPHY_CONFIG)).toBe(
      "100% of your sets are to failure. Growth doesn't need failure — leave 1–2 reps in reserve on most sets.",
    );
    expect(findingSentence(assess(with_(program({}), nearFailure(0.516))).findings![0]!, HYPERTROPHY_CONFIG)).toMatch(
      /^52% of your sets are to failure\./,
    );
  });

  it("the copy passes the forbidden-copy lint and never says safe, injury or prevent", () => {
    const all = [
      findingSentence(a.findings![0]!, HYPERTROPHY_CONFIG)!,
      ...["EFFORT_DEFINED", "FAR_FROM_FAILURE", "REP_RANGE", "PERCENT_1RM_FEASIBILITY"].map(
        (id) =>
          findingSentence(
            assess(
              with_(program({}), {
                ...nearFailure(0.3),
                facts: { failedChecks: [{ id, share: 0.3, detail: id }] },
              }),
            ).findings![0]!,
            HYPERTROPHY_CONFIG,
          )!,
      ),
    ];
    expect(all.every((s) => s.length > 0)).toBe(true);
    assertCleanCopy(all);
    for (const line of all) expect(line).not.toMatch(/\b(safe|safely|injur\w*|prevent\w*)\b/i);
  });

  it("an Effort & rep ranges finding without per-check facts has no sentence of its own (older snapshots)", () => {
    const old: AnalysisAxisResult = { ...nearFailure(1), facts: undefined };
    const f = assess(with_(program({}), old)).findings![0]!;
    expect(f.key).toBe("PROGRESSION_SOUNDNESS");
    expect(findingSentence(f, HYPERTROPHY_CONFIG)).toBeNull();
  });

  it("KNOWN LIMITATION: Fit stays STRONG. Effort & rep ranges is MINOR severity, below the breadth bar", () => {
    // Pinned so the limitation is visible and a future change to it is deliberate (graded severity, E4, or a
    // decision to raise PROGRESSION from MINOR to MODERATE; both are separate ARCHs). Until then J's headline
    // reads 'near-failure' and its action is correct, but the band label understates the problem.
    const axis = a.allAssessedAxes.find((x) => x.axisType === "PROGRESSION_SOUNDNESS")!;
    expect(axis.severity).toBe("MINOR");
    expect(axis.leverage).toBe("LOW");
    expect(projectFitBand(a).band).toBe("STRONG");
  });
});
