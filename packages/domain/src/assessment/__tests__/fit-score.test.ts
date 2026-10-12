// packages/domain/src/assessment/__tests__/fit-score.test.ts
//
// Tests for computeFitScore (engine 0.4.0, E11: breadth-aware Fit).
//
// Sections:
//   1. Derivation from Assessment: the pre-E11 guarantees, unchanged (invariant 8).
//   2. The four canonical profiles under the shipped hypertrophy projection.
//   3. Breadth-floor semantics: cliff, cap, cumulative counting, severity bar, monotonicity.
//   4. Reversibility, and the lone-HIGH policy expressed purely as config.
//   5. Config validation.
//   6. The shipped projection is pinned.
//   7. Integration: computeAssessment -> computeFitScore on the shipped config, checking that every
//      finding that moves the band is one the narrative surfaces.
//
// Sections 1-6 use hand-built Assessments (like the invariant-8 case); section 7 runs the real roll-up.

import { describe, expect, it } from "vitest";
import type {
  Analysis,
  AnalysisAxisResult,
  FitScoreBand,
  FitScoreProjection,
  Leverage,
  Severity,
} from "../../analysis/types";
import type { AssessedAxis, Assessment, AssessmentResult } from "../types";
import { computeAssessment } from "../computeAssessment";
import { computeFitScore, projectFitBand } from "../computeFitScore";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import {
  WORKED_EXAMPLE_GOAL_ID,
  workedExampleAnalysis,
  workedExampleConfig,
} from "../__fixtures__/workedExample";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const T = "2026-01-01T00:00:00.000Z";

const SHIPPED = HYPERTROPHY_CONFIG.fitScoreProjection;

/** The 0.3.0 projection: worst single leverage only. */
const WORST_ONLY: FitScoreProjection = {
  leverageOrdinal: SHIPPED.leverageOrdinal,
  worstLeverageToBand: SHIPPED.worstLeverageToBand,
};

/** Badness rank, for monotonicity checks. */
const BAD: Readonly<Record<FitScoreBand, number>> = { STRONG: 0, DECENT: 1, NEEDS_WORK: 2 };

/** Severity a finding of each leverage carries in the shipped hypertrophy tables (all clear the MODERATE bar). */
const FINDING_SEVERITY: Readonly<Record<Leverage, Severity>> = {
  NONE: "NONE",
  LOW: "MODERATE", // FREQUENCY Low: MODERATE x LOW weight
  MODERATE: "MODERATE", // RECOVERY_COST Excessive: MODERATE x MEDIUM weight
  HIGH: "MAJOR", // VOLUME Low: MAJOR x HIGH weight
};

function axis(leverage: Leverage, index: number, severity: Severity = FINDING_SEVERITY[leverage]): AssessedAxis {
  return {
    axisType: "FREQUENCY",
    scopeKey: `${leverage.toLowerCase()}-${index}`,
    metricValue: 0,
    status: { kind: "BAND", band: "Low" },
    severity,
    weight: "LOW",
    leverage,
  };
}

/** `count` axes at one leverage tier. */
const tier = (leverage: Leverage, count: number, severity?: Severity): AssessedAxis[] =>
  Array.from({ length: count }, (_, i) => axis(leverage, i, severity));

function assessmentOf(axes: readonly AssessedAxis[], projection: FitScoreProjection = SHIPPED): Assessment {
  return {
    programVersionId: "fit-test",
    goalId: "fit-test-goal",
    overallSummary: "hand-built",
    strengths: [],
    attentionAreas: [],
    biggestOpportunity: null,
    actions: [],
    thresholdsValidated: true,
    computedAt: T,
    allAssessedAxes: axes,
    fitScoreProjection: projection,
  };
}

const validated = (assessment: Assessment): AssessmentResult => ({ kind: "VALIDATED", assessment });

function bandOf(axes: readonly AssessedAxis[], projection: FitScoreProjection = SHIPPED): FitScoreBand {
  const result = computeFitScore(validated(assessmentOf(axes, projection)));
  if (result.kind !== "VALIDATED") throw new Error("expected VALIDATED");
  return result.fitScore.band;
}

interface Profile {
  readonly name: string;
  readonly axes: readonly AssessedAxis[];
  /** Band under the 0.3.0 rule (worst single leverage). */
  readonly worstOnly: FitScoreBand;
  /** Band under the shipped 0.4.0 projection. */
  readonly shipped: FitScoreBand;
}

const PROFILES: readonly Profile[] = [
  { name: "no findings", axes: tier("NONE", 3), worstOnly: "STRONG", shipped: "STRONG" },
  { name: "one LOW", axes: tier("LOW", 1), worstOnly: "STRONG", shipped: "STRONG" },
  { name: "two LOW", axes: tier("LOW", 2), worstOnly: "STRONG", shipped: "STRONG" },
  { name: "three LOW", axes: tier("LOW", 3), worstOnly: "STRONG", shipped: "DECENT" },
  { name: "five LOW", axes: tier("LOW", 5), worstOnly: "STRONG", shipped: "DECENT" },
  { name: "one MODERATE", axes: tier("MODERATE", 1), worstOnly: "DECENT", shipped: "DECENT" },
  {
    name: "one MODERATE + three LOW",
    axes: [...tier("MODERATE", 1), ...tier("LOW", 3)],
    worstOnly: "DECENT",
    shipped: "DECENT",
  },
  {
    name: "one MODERATE + seven LOW",
    axes: [...tier("MODERATE", 1), ...tier("LOW", 7)],
    worstOnly: "DECENT",
    shipped: "DECENT",
  },
  { name: "one HIGH", axes: tier("HIGH", 1), worstOnly: "NEEDS_WORK", shipped: "NEEDS_WORK" },
  {
    name: "one HIGH + ten LOW",
    axes: [...tier("HIGH", 1), ...tier("LOW", 10)],
    worstOnly: "NEEDS_WORK",
    shipped: "NEEDS_WORK",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. Derivation from Assessment (pre-E11 guarantees, unchanged)
// ─────────────────────────────────────────────────────────────────────────────

describe("computeFitScore — derivation from Assessment", () => {
  it("returns VALIDATED with a band when the source assessment is VALIDATED", () => {
    const assessment = computeAssessment(workedExampleAnalysis, workedExampleConfig, {
      goalId: WORKED_EXAMPLE_GOAL_ID,
    });
    // Worked example: Chest HIGH, Recovery MODERATE, Quads LOW, Back NONE. Worst = HIGH -> NEEDS_WORK.
    const result = computeFitScore(assessment);
    expect(result.kind).toBe("VALIDATED");
    if (result.kind !== "VALIDATED") throw new Error("expected VALIDATED");
    expect(result.fitScore.band).toBe("NEEDS_WORK");
  });

  it("carries derivedFromAssessmentComputedAt from the source assessment", () => {
    const assessment = computeAssessment(workedExampleAnalysis, workedExampleConfig, {
      goalId: WORKED_EXAMPLE_GOAL_ID,
    });
    const result = computeFitScore(assessment);
    if (result.kind !== "VALIDATED") throw new Error("expected VALIDATED");
    expect(result.fitScore.derivedFromAssessmentComputedAt).toBe(assessment.assessment.computedAt);
  });

  it("returns UNVALIDATED with the same reason when the source assessment is UNVALIDATED", () => {
    const assessment = computeAssessment(workedExampleAnalysis, HYPERTROPHY_CONFIG, {
      goalId: "shipped-config-goal",
    });
    expect(assessment.kind).toBe("UNVALIDATED");
    const result = computeFitScore(assessment);
    expect(result.kind).toBe("UNVALIDATED");
    if (result.kind !== "UNVALIDATED" || assessment.kind !== "UNVALIDATED") {
      throw new Error("expected UNVALIDATED on both");
    }
    expect(result.reason).toBe(assessment.reason);
  });

  it("derives the band from allAssessedAxes, not from the surfaced subset (invariant 8)", () => {
    // A HIGH-leverage axis that appears in NEITHER strengths NOR attentionAreas (severity below
    // materiality) but is present in allAssessedAxes. computeFitScore must still see it.
    const hiddenHighLeverage: AssessedAxis = {
      axisType: "RECOVERY_COST",
      scopeKey: null,
      metricValue: 999,
      status: { kind: "BAND", band: "Excessive" },
      severity: "MODERATE",
      weight: "HIGH",
      leverage: "HIGH",
    };
    const assessment: Assessment = {
      ...assessmentOf([hiddenHighLeverage], workedExampleConfig.fitScoreProjection),
      programVersionId: "hand-built",
      goalId: "hand-built-goal",
    };
    const result = computeFitScore(validated(assessment));
    if (result.kind !== "VALIDATED") throw new Error("expected VALIDATED");
    expect(result.fitScore.band).toBe("NEEDS_WORK");
  });

  it("throws when a VALIDATED result has zero assessed axes (upstream inconsistency)", () => {
    expect(() => computeFitScore(validated(assessmentOf([])))).toThrow(/zero assessed axes/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. The four canonical profiles (shipped hypertrophy projection)
// ─────────────────────────────────────────────────────────────────────────────

describe("E11 — the four canonical profiles under the shipped projection", () => {
  it("(a) one HIGH finding -> NEEDS_WORK from the base rule; no breadth floor involved", () => {
    const p = projectFitBand(assessmentOf(tier("HIGH", 1)));
    expect(p.band).toBe("NEEDS_WORK");
    expect(p.baseBand).toBe("NEEDS_WORK");
    expect(p.triggeredFloors).toEqual([]);
  });

  it("(b) five LOW findings -> DECENT from the breadth floor (the base band alone would read STRONG)", () => {
    const p = projectFitBand(assessmentOf(tier("LOW", 5)));
    expect(p.baseBand).toBe("STRONG");
    expect(p.band).toBe("DECENT");
    expect(p.triggeredFloors).toEqual([{ leverageAtLeast: "LOW", minCount: 3, band: "DECENT" }]);
  });

  it("(c) one MODERATE + three LOW -> DECENT: the MODERATE sets it; the floor fires but cannot worsen it", () => {
    const p = projectFitBand(assessmentOf([...tier("MODERATE", 1), ...tier("LOW", 3)]));
    expect(p.baseBand).toBe("DECENT");
    expect(p.band).toBe("DECENT");
    expect(p.triggeredFloors).toHaveLength(1);
  });

  it("(d) no findings -> STRONG", () => {
    const p = projectFitBand(assessmentOf(tier("NONE", 4)));
    expect(p.band).toBe("STRONG");
    expect(p.triggeredFloors).toEqual([]);
  });

  it("a leverage-NONE axis is not a finding even when its severity is MINOR (e.g. selection gaps)", () => {
    expect(bandOf(tier("NONE", 6, "MINOR"))).toBe("STRONG");
  });

  for (const p of PROFILES) {
    it(`profile "${p.name}": shipped -> ${p.shipped}`, () => {
      expect(bandOf(p.axes)).toBe(p.shipped);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Breadth-floor semantics
// ─────────────────────────────────────────────────────────────────────────────

describe("E11 — breadth-floor semantics", () => {
  it("two LOW findings stay STRONG; the third tips the band to DECENT (the documented cliff)", () => {
    expect(bandOf(tier("LOW", 2))).toBe("STRONG");
    expect(bandOf(tier("LOW", 3))).toBe("DECENT");
  });

  it("sub-HIGH breadth is capped at DECENT: one MODERATE + seven LOW (Program K's profile) never reaches NEEDS_WORK", () => {
    expect(bandOf([...tier("MODERATE", 1), ...tier("LOW", 7)])).toBe("DECENT");
    expect(bandOf(tier("LOW", 40))).toBe("DECENT");
  });

  it("breadth never improves a band: one HIGH plus ten LOW is still NEEDS_WORK", () => {
    expect(bandOf([...tier("HIGH", 1), ...tier("LOW", 10)])).toBe("NEEDS_WORK");
  });

  it("findings below the severity bar do not count: five MINOR-severity LOW axes stay STRONG", () => {
    expect(bandOf(tier("LOW", 5, "MINOR"))).toBe("STRONG");
  });

  it("the severity bar is inclusive and counted per axis: 2 MODERATE-severity + 3 MINOR-severity LOW -> STRONG; 3 + 2 -> DECENT", () => {
    expect(bandOf([...tier("LOW", 2, "MODERATE"), ...tier("LOW", 3, "MINOR").map((a, i) => ({ ...a, scopeKey: `minor-${i}` }))])).toBe("STRONG");
    expect(bandOf([...tier("LOW", 3, "MODERATE"), ...tier("LOW", 2, "MINOR").map((a, i) => ({ ...a, scopeKey: `minor-${i}` }))])).toBe("DECENT");
  });

  it("never better than the worst-leverage band, across every profile (monotone)", () => {
    for (const p of PROFILES) {
      expect(BAD[bandOf(p.axes)]).toBeGreaterThanOrEqual(BAD[bandOf(p.axes, WORST_ONLY)]);
    }
  });

  it("counting is cumulative: a HIGH finding also counts toward a LOW floor", () => {
    // Two LOW + one HIGH = three findings at LOW-or-worse. Isolate the floor by softening the base band.
    const softBase: FitScoreProjection = {
      ...SHIPPED,
      worstLeverageToBand: { NONE: "STRONG", LOW: "STRONG", MODERATE: "STRONG", HIGH: "STRONG" },
    };
    expect(bandOf([...tier("HIGH", 1), ...tier("LOW", 2)], softBase)).toBe("DECENT");
    expect(bandOf([...tier("HIGH", 1), ...tier("LOW", 1)], softBase)).toBe("STRONG");
  });

  it("the final band is the worst of the base band and every triggered floor", () => {
    const twoFloors: FitScoreProjection = {
      ...SHIPPED,
      breadth: {
        findingMinSeverity: "MODERATE",
        floors: [
          { leverageAtLeast: "LOW", minCount: 3, band: "DECENT" },
          { leverageAtLeast: "LOW", minCount: 6, band: "NEEDS_WORK" },
        ],
      },
    };
    expect(bandOf(tier("LOW", 5), twoFloors)).toBe("DECENT");
    expect(bandOf(tier("LOW", 6), twoFloors)).toBe("NEEDS_WORK");
    expect(projectFitBand(assessmentOf(tier("LOW", 6), twoFloors)).triggeredFloors).toHaveLength(2);
  });

  it("a MODERATE-tier floor counts HIGH findings too, and is dormant under the shipped config", () => {
    const moderateFloor: FitScoreProjection = {
      ...SHIPPED,
      worstLeverageToBand: { NONE: "STRONG", LOW: "STRONG", MODERATE: "DECENT", HIGH: "DECENT" },
      breadth: {
        findingMinSeverity: "MODERATE",
        floors: [{ leverageAtLeast: "MODERATE", minCount: 2, band: "NEEDS_WORK" }],
      },
    };
    expect(bandOf(tier("MODERATE", 2), moderateFloor)).toBe("NEEDS_WORK");
    expect(bandOf([...tier("HIGH", 1), ...tier("MODERATE", 1)], moderateFloor)).toBe("NEEDS_WORK");
    expect(bandOf(tier("MODERATE", 1), moderateFloor)).toBe("DECENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Reversibility and the lone-HIGH policy, both as pure config
// ─────────────────────────────────────────────────────────────────────────────

describe("E11 — reversibility and policy knobs", () => {
  it("without `breadth` every profile reads exactly its worst-leverage band (the 0.3.0 behaviour)", () => {
    for (const p of PROFILES) {
      expect(bandOf(p.axes, WORST_ONLY)).toBe(p.worstOnly);
    }
  });

  it("`floors: []` is identical to no `breadth` at all", () => {
    const empty: FitScoreProjection = { ...SHIPPED, breadth: { findingMinSeverity: "MODERATE", floors: [] } };
    for (const p of PROFILES) {
      expect(bandOf(p.axes, empty)).toBe(p.worstOnly);
    }
  });

  it("the lone-HIGH policy is config only: HIGH -> DECENT plus a two-HIGH floor", () => {
    const loneHighSoftened: FitScoreProjection = {
      ...SHIPPED,
      worstLeverageToBand: { NONE: "STRONG", LOW: "STRONG", MODERATE: "DECENT", HIGH: "DECENT" },
      breadth: {
        findingMinSeverity: "MODERATE",
        floors: [
          { leverageAtLeast: "LOW", minCount: 3, band: "DECENT" },
          { leverageAtLeast: "HIGH", minCount: 2, band: "NEEDS_WORK" },
        ],
      },
    };
    expect(bandOf(tier("HIGH", 1), loneHighSoftened)).toBe("DECENT");
    expect(bandOf(tier("HIGH", 2), loneHighSoftened)).toBe("NEEDS_WORK");
    expect(bandOf([...tier("HIGH", 1), ...tier("LOW", 10)], loneHighSoftened)).toBe("DECENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Config validation (fail loudly; never fabricate a band)
// ─────────────────────────────────────────────────────────────────────────────

describe("E11 — config validation", () => {
  const withFloor = (floor: { leverageAtLeast: Leverage; minCount: number; band: FitScoreBand }): FitScoreProjection => ({
    ...SHIPPED,
    breadth: { findingMinSeverity: "MODERATE", floors: [floor] },
  });

  it("rejects minCount 0", () => {
    expect(() => bandOf(tier("LOW", 1), withFloor({ leverageAtLeast: "LOW", minCount: 0, band: "DECENT" }))).toThrow(/minCount/);
  });

  it("rejects a non-integer minCount", () => {
    expect(() => bandOf(tier("LOW", 1), withFloor({ leverageAtLeast: "LOW", minCount: 2.5, band: "DECENT" }))).toThrow(/minCount/);
  });

  it("rejects a floor tier missing from leverageOrdinal", () => {
    const bad = withFloor({ leverageAtLeast: "EXTREME" as Leverage, minCount: 1, band: "DECENT" });
    expect(() => bandOf(tier("LOW", 1), bad)).toThrow(/leverageOrdinal/);
  });

  it("rejects an axis leverage missing from leverageOrdinal", () => {
    const bad: FitScoreProjection = { ...SHIPPED, leverageOrdinal: ["NONE", "LOW", "MODERATE"] };
    expect(() => bandOf(tier("HIGH", 1), bad)).toThrow(/leverageOrdinal/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. The shipped projection is pinned
// ─────────────────────────────────────────────────────────────────────────────

describe("E11 — the shipped hypertrophy projection is pinned", () => {
  it("keeps the worst-leverage mapping unchanged", () => {
    expect(SHIPPED.leverageOrdinal).toEqual(["NONE", "LOW", "MODERATE", "HIGH"]);
    expect(SHIPPED.worstLeverageToBand).toEqual({
      NONE: "STRONG",
      LOW: "STRONG",
      MODERATE: "DECENT",
      HIGH: "NEEDS_WORK",
    });
  });

  it("ships exactly one breadth floor: three findings at LOW or worse -> no better than DECENT", () => {
    expect(SHIPPED.breadth).toEqual({
      findingMinSeverity: "MODERATE",
      floors: [{ leverageAtLeast: "LOW", minCount: 3, band: "DECENT" }],
    });
  });

  it("the finding bar mirrors the attention-area materiality bar (drift guard)", () => {
    expect(SHIPPED.breadth?.findingMinSeverity).toBe(HYPERTROPHY_CONFIG.materialitySeverityThreshold);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Integration: real roll-up on the shipped config
// ─────────────────────────────────────────────────────────────────────────────

describe("E11 — integration: every finding that moves the band is one the narrative surfaces", () => {
  const freq = (i: number): AnalysisAxisResult => ({
    axisType: "FREQUENCY",
    scopeKey: `muscle-${i}`,
    metricValue: 0.5,
    status: { kind: "BAND", band: "Low" },
  });
  // MINOR severity on the shipped tables: leverage LOW, but below the materiality bar.
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

  const analysisOf = (...axisResults: AnalysisAxisResult[]): Analysis => ({
    programVersionId: "fit-integration",
    axisResults,
    computedAt: T,
  });

  function run(...axisResults: AnalysisAxisResult[]) {
    const result = computeAssessment(analysisOf(...axisResults), HYPERTROPHY_CONFIG, {
      goalId: "fit-integration-goal",
    });
    // The real result is gated (the shipped profile is unvalidated). Wrap the inner assessment to read the
    // band the projection WOULD give, exactly as the calibration harness does. PROVISIONAL: never user-visible.
    const provisional = computeFitScore({ kind: "VALIDATED", assessment: result.assessment });
    if (provisional.kind !== "VALIDATED") throw new Error("expected VALIDATED");
    const surfaced =
      (result.assessment.biggestOpportunity === null ? 0 : 1) + result.assessment.attentionAreas.length;
    const lowOrWorse = result.assessment.allAssessedAxes.filter((a) => a.leverage !== "NONE").length;
    return { result, gated: computeFitScore(result), band: provisional.fitScore.band, surfaced, lowOrWorse };
  }

  it("the real Fit result stays UNVALIDATED while the profile is unvalidated", () => {
    const { gated } = run(freq(0), freq(1), freq(2));
    expect(gated.kind).toBe("UNVALIDATED");
  });

  it("five FREQUENCY Low findings -> DECENT, and the narrative surfaces all five", () => {
    const { band, surfaced } = run(freq(0), freq(1), freq(2), freq(3), freq(4));
    expect(band).toBe("DECENT");
    expect(surfaced).toBe(5);
  });

  it("three material findings plus two MINOR-severity axes -> DECENT, and exactly the three are surfaced", () => {
    const { band, surfaced, lowOrWorse } = run(freq(0), freq(1), freq(2), progressionIssue, recoveryHigh);
    expect(band).toBe("DECENT");
    expect(surfaced).toBe(3);
    expect(lowOrWorse).toBe(5); // the two MINOR-severity axes carry leverage but do not count toward breadth
  });

  it("two material findings plus two MINOR-severity axes -> STRONG, even though four axes carry leverage", () => {
    const { band, surfaced, lowOrWorse } = run(freq(0), freq(1), progressionIssue, recoveryHigh);
    expect(band).toBe("STRONG");
    expect(surfaced).toBe(2);
    expect(lowOrWorse).toBe(4);
  });
});