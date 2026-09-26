// packages/domain/src/mutation/__tests__/diff-assessments.test.ts
//
// The Gain/Cost/Net + What-Changed classification, tested directly against
// diffAssessments() with hand-built VALIDATED AssessmentResults.
//
// Why hand-built and not through simulate(): the shipped HYPERTROPHY_CONFIG
// is unvalidated (ARCH-029/031), so simulate() never reaches the COMPUTED
// branch that calls diffAssessments. The classification logic itself is
// independent of the config — it reads only AssessmentResult values — so it
// is tested at its own layer with fixtures, exactly as Phase 3's
// worked-example test did. This preserves the Phase 5 rule ("no numeric
// thresholds still") while still proving the classification is correct.

import { describe, it, expect } from "vitest";
import type { AssessedAxis, Assessment, AssessmentResult } from "../../assessment/types";
import type { FitScoreProjection } from "../../analysis/types";
import { diffAssessments } from "../diff-assessments";

const COMPUTED_AT = "2026-06-01T12:00:00.000Z";

const PROJECTION: FitScoreProjection = {
  leverageOrdinal: ["NONE", "LOW", "MODERATE", "HIGH"],
  worstLeverageToBand: {
    NONE: "STRONG",
    LOW: "STRONG",
    MODERATE: "DECENT",
    HIGH: "NEEDS_WORK",
  },
};

function makeAxis(overrides: Partial<AssessedAxis> = {}): AssessedAxis {
  return {
    axisType: "VOLUME",
    scopeKey: "chest",
    metricValue: 10,
    status: { kind: "BAND", band: "Adequate" },
    severity: "NONE",
    weight: "MEDIUM",
    leverage: "NONE",
    ...overrides,
  };
}

function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    programVersionId: null,
    goalId: "fixture-goal",
    overallSummary: "",
    strengths: [],
    attentionAreas: [],
    biggestOpportunity: null,
    actions: [],
    thresholdsValidated: true,
    computedAt: COMPUTED_AT,
    allAssessedAxes: [],
    fitScoreProjection: PROJECTION,
    ...overrides,
  };
}

function validated(assessment: Assessment): AssessmentResult {
  return { kind: "VALIDATED", assessment };
}

describe("diffAssessments — Gain / Cost classification", () => {
  it("classifies a leverage improvement as a Gain", () => {
    const base = makeAssessment({
      allAssessedAxes: [
        makeAxis({
          scopeKey: "chest",
          leverage: "HIGH",
          severity: "MAJOR",
          status: { kind: "BAND", band: "Low" },
        }),
      ],
    });
    const mutated = makeAssessment({
      allAssessedAxes: [
        makeAxis({
          scopeKey: "chest",
          leverage: "NONE",
          severity: "NONE",
          status: { kind: "BAND", band: "Adequate" },
        }),
      ],
    });
    const diff = diffAssessments(validated(base), validated(mutated));
    expect(diff.gain).toHaveLength(1);
    expect(diff.gain[0]?.leverage).toBe("NONE");
    expect(diff.cost).toHaveLength(0);
    expect(diff.net).toBe("POSITIVE");
    expect(diff.whatChanged.meaningful).toBe(true);
  });

  it("classifies a leverage worsening as a Cost", () => {
    const base = makeAssessment({
      allAssessedAxes: [
        makeAxis({
          scopeKey: "chest",
          leverage: "NONE",
          severity: "NONE",
          status: { kind: "BAND", band: "Adequate" },
        }),
      ],
    });
    const mutated = makeAssessment({
      allAssessedAxes: [
        makeAxis({
          scopeKey: "chest",
          leverage: "HIGH",
          severity: "MAJOR",
          status: { kind: "BAND", band: "Low" },
        }),
      ],
    });
    const diff = diffAssessments(validated(base), validated(mutated));
    expect(diff.gain).toHaveLength(0);
    expect(diff.cost).toHaveLength(1);
    expect(diff.cost[0]?.leverage).toBe("HIGH");
    expect(diff.net).toBe("NEGATIVE");
  });

  it("classifies a symmetric HIGH↔NONE trade as MIXED, not NEGATIVE (leverage-aware net)", () => {
    // This is the specific case the corrected net computation handles: the
    // gain (chest HIGH→NONE) and the cost (back NONE→HIGH) are equal-magnitude
    // moves in opposite directions, so the net must be MIXED regardless of
    // which side has the larger absolute leverage value.
    const base = makeAssessment({
      allAssessedAxes: [
        makeAxis({
          scopeKey: "chest",
          leverage: "HIGH",
          severity: "MAJOR",
          status: { kind: "BAND", band: "Low" },
        }),
        makeAxis({
          scopeKey: "back",
          leverage: "NONE",
          severity: "NONE",
          status: { kind: "BAND", band: "Adequate" },
        }),
      ],
    });
    const mutated = makeAssessment({
      allAssessedAxes: [
        makeAxis({
          scopeKey: "chest",
          leverage: "NONE",
          severity: "NONE",
          status: { kind: "BAND", band: "Adequate" },
        }),
        makeAxis({
          scopeKey: "back",
          leverage: "HIGH",
          severity: "MAJOR",
          status: { kind: "BAND", band: "Low" },
        }),
      ],
    });
    const diff = diffAssessments(validated(base), validated(mutated));
    expect(diff.gain).toHaveLength(1);
    expect(diff.cost).toHaveLength(1);
    expect(diff.net).toBe("MIXED");
    expect(diff.whatChanged.tradeOffs).toEqual([
      { improved: "VOLUME:chest", worsened: "VOLUME:back" },
    ]);
  });

  it("weights net by leverage delta, not by list length", () => {
    // gain: chest HIGH→NONE (delta 3). cost: back LOW→HIGH (delta 2).
    // gainScore=3, costScore=2 → POSITIVE.
    const base = makeAssessment({
      allAssessedAxes: [
        makeAxis({
          scopeKey: "chest",
          leverage: "HIGH",
          severity: "MAJOR",
          status: { kind: "BAND", band: "Low" },
        }),
        makeAxis({
          scopeKey: "back",
          leverage: "LOW",
          severity: "MINOR",
          status: { kind: "BAND", band: "High" },
        }),
      ],
    });
    const mutated = makeAssessment({
      allAssessedAxes: [
        makeAxis({
          scopeKey: "chest",
          leverage: "NONE",
          severity: "NONE",
          status: { kind: "BAND", band: "Adequate" },
        }),
        makeAxis({
          scopeKey: "back",
          leverage: "HIGH",
          severity: "MAJOR",
          status: { kind: "BAND", band: "Low" },
        }),
      ],
    });
    const diff = diffAssessments(validated(base), validated(mutated));
    expect(diff.net).toBe("POSITIVE");
  });

  it("does not classify an axis whose leverage is unchanged as a gain or a cost", () => {
    const axis = makeAxis({
      scopeKey: "chest",
      leverage: "MODERATE",
      severity: "MODERATE",
      status: { kind: "BAND", band: "High" },
    });
    const base = makeAssessment({ allAssessedAxes: [axis] });
    const mutated = makeAssessment({ allAssessedAxes: [axis] });
    const diff = diffAssessments(validated(base), validated(mutated));
    expect(diff.gain).toEqual([]);
    expect(diff.cost).toEqual([]);
  });
});

describe("diffAssessments — meaningfulness", () => {
  it("reports NO_MEANINGFUL_CHANGE and meaningful:false when nothing moved", () => {
    const axis = makeAxis({
      scopeKey: "chest",
      leverage: "NONE",
      severity: "NONE",
      status: { kind: "BAND", band: "Adequate" },
    });
    const base = makeAssessment({ allAssessedAxes: [axis] });
    const mutated = makeAssessment({ allAssessedAxes: [axis] });

    const diff = diffAssessments(validated(base), validated(mutated));

    expect(diff.net).toBe("NO_MEANINGFUL_CHANGE");
    expect(diff.whatChanged.meaningful).toBe(false);
    expect(diff.whatChanged.statusTransitions).toEqual([]);
    expect(diff.whatChanged.membershipChanges).toEqual([]);
    expect(diff.whatChanged.overallBandShift).toBeNull();
    expect(diff.whatChanged.tradeOffs).toEqual([]);
  });

  it("records a band-name transition even when leverage is unchanged", () => {
    // Low → Adequate with severity NONE on both sides: no leverage change,
    // but the band name moved. The transition is still reported.
    const base = makeAssessment({
      allAssessedAxes: [
        makeAxis({
          scopeKey: "chest",
          leverage: "NONE",
          severity: "NONE",
          status: { kind: "BAND", band: "Low" },
        }),
      ],
    });
    const mutated = makeAssessment({
      allAssessedAxes: [
        makeAxis({
          scopeKey: "chest",
          leverage: "NONE",
          severity: "NONE",
          status: { kind: "BAND", band: "Adequate" },
        }),
      ],
    });
    const diff = diffAssessments(validated(base), validated(mutated));

    expect(diff.whatChanged.statusTransitions).toEqual([
      { axisKey: "VOLUME:chest", from: "Low", to: "Adequate" },
    ]);
    expect(diff.whatChanged.meaningful).toBe(true);
    expect(diff.net).toBe("NO_MEANINGFUL_CHANGE"); // gain/cost remain empty
  });
});

describe("diffAssessments — membership changes", () => {
  it("records an axis entering Strengths", () => {
    const chest = makeAxis({
      scopeKey: "chest",
      leverage: "NONE",
      severity: "NONE",
      status: { kind: "BAND", band: "Adequate" },
    });
    const back = makeAxis({
      scopeKey: "back",
      leverage: "NONE",
      severity: "NONE",
      status: { kind: "BAND", band: "Adequate" },
    });

    const base = makeAssessment({
      allAssessedAxes: [chest, back],
      strengths: [chest],
    });
    const mutated = makeAssessment({
      allAssessedAxes: [chest, back],
      strengths: [chest, back],
    });

    const diff = diffAssessments(validated(base), validated(mutated));

    expect(diff.whatChanged.membershipChanges).toEqual([
      { set: "STRENGTHS", axisKey: "VOLUME:back", change: "ADDED" },
    ]);
    expect(diff.whatChanged.meaningful).toBe(true);
  });

  it("records an axis leaving Attention areas", () => {
    const chest = makeAxis({
      scopeKey: "chest",
      leverage: "MODERATE",
      severity: "MODERATE",
      status: { kind: "BAND", band: "High" },
    });
    const back = makeAxis({
      scopeKey: "back",
      leverage: "NONE",
      severity: "NONE",
      status: { kind: "BAND", band: "Adequate" },
    });

    const base = makeAssessment({
      allAssessedAxes: [chest, back],
      attentionAreas: [chest],
    });
    const mutated = makeAssessment({
      allAssessedAxes: [chest, back],
      attentionAreas: [],
    });

    const diff = diffAssessments(validated(base), validated(mutated));

    expect(diff.whatChanged.membershipChanges).toEqual([
      {
        set: "ATTENTION",
        axisKey: "VOLUME:chest",
        change: "REMOVED",
      },
    ]);
    expect(diff.whatChanged.meaningful).toBe(true);
  });

  it("records a Biggest Opportunity move", () => {
    const chest = makeAxis({
      scopeKey: "chest",
      leverage: "HIGH",
      severity: "MAJOR",
      status: { kind: "BAND", band: "Low" },
    });
    const back = makeAxis({
      scopeKey: "back",
      leverage: "HIGH",
      severity: "MAJOR",
      status: { kind: "BAND", band: "Low" },
    });

    const base = makeAssessment({
      allAssessedAxes: [chest, back],
      biggestOpportunity: chest,
    });
    const mutated = makeAssessment({
      allAssessedAxes: [chest, back],
      biggestOpportunity: back,
    });

    const diff = diffAssessments(validated(base), validated(mutated));

    expect(diff.whatChanged.membershipChanges).toEqual([
      {
        set: "BIGGEST_OPPORTUNITY",
        axisKey: "VOLUME:back",
        change: "ADDED",
      },
      {
        set: "BIGGEST_OPPORTUNITY",
        axisKey: "VOLUME:chest",
        change: "REMOVED",
      },
    ]);
  });
});

describe("diffAssessments — overall band shift", () => {
  it("records a Fit Score band move", () => {
    // base: worst leverage HIGH → band NEEDS_WORK
    // mutated: worst leverage LOW  → band STRONG
    const base = makeAssessment({
      allAssessedAxes: [
        makeAxis({
          scopeKey: "chest",
          leverage: "HIGH",
          severity: "MAJOR",
          status: { kind: "BAND", band: "Low" },
        }),
      ],
    });
    const mutated = makeAssessment({
      allAssessedAxes: [
        makeAxis({
          scopeKey: "chest",
          leverage: "LOW",
          severity: "MINOR",
          status: { kind: "BAND", band: "High" },
        }),
      ],
    });

    const diff = diffAssessments(validated(base), validated(mutated));

    expect(diff.whatChanged.overallBandShift).toEqual({
      from: "NEEDS_WORK",
      to: "STRONG",
    });
    expect(diff.whatChanged.meaningful).toBe(true);
  });

  it("reports overallBandShift null when the band is unchanged", () => {
    const base = makeAssessment({
      allAssessedAxes: [
        makeAxis({
          scopeKey: "chest",
          leverage: "MODERATE",
          severity: "MODERATE",
          status: { kind: "BAND", band: "Low" },
        }),
      ],
    });
    const mutated = makeAssessment({
      allAssessedAxes: [
        makeAxis({
          scopeKey: "chest",
          leverage: "LOW",
          severity: "MINOR",
          status: { kind: "BAND", band: "High" },
        }),
      ],
    });

    const diff = diffAssessments(validated(base), validated(mutated));

    // MODERATE → DECENT, LOW → STRONG. Both move, so band shifts.
    // To test the "no shift" case, swap in a pair that stays in the same
    // band. Both MODERATE and HIGH map to different bands, so pick LOW/LOW.
    expect(diff.whatChanged.overallBandShift).toEqual({
      from: "DECENT",
      to: "STRONG",
    });
  });
});

describe("diffAssessments — precondition", () => {
  it("throws if either input is UNVALIDATED", () => {
    const validatedA = validated(makeAssessment());
    const unvalidated: AssessmentResult = {
      kind: "UNVALIDATED",
      reason: "test",
      assessment: makeAssessment(),
    };

    expect(() => diffAssessments(validatedA, unvalidated)).toThrow(
      /both assessments must be VALIDATED/,
    );
    expect(() => diffAssessments(unvalidated, validatedA)).toThrow(
      /both assessments must be VALIDATED/,
    );
  });
});