// packages/domain/src/assessment/__tests__/fit-score.test.ts
//
// Tests for computeFitScore, focusing on the structural guarantee behind
// invariant 8: the Fit Score is a pure function of the Assessment's leverage
// roll-up, and it cannot produce a band when the assessment is UNVALIDATED.
//
// Four cases:
//   1. VALIDATED assessment -> VALIDATED FitScoreResult, band derived from
//      the worst leverage across allAssessedAxes.
//   2. UNVALIDATED assessment -> UNVALIDATED FitScoreResult, reason carried
//      verbatim from the source assessment.
//   3. The band is a projection of allAssessedAxes, not of the surfaced
//      subset — an axis whose leverage is worst but which is not surfaced as
//      a strength/attention/opportunity still drives the band.
//   4. Empty allAssessedAxes on a VALIDATED result -> throws (upstream
//      inconsistency; computeAssessment should never produce this).

import { describe, expect, it } from "vitest";
import type { Assessment } from "../types";
import { computeAssessment } from "../computeAssessment";
import { computeFitScore } from "../computeFitScore";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import {
  WORKED_EXAMPLE_GOAL_ID,
  workedExampleAnalysis,
  workedExampleConfig,
} from "../__fixtures__/workedExample";

describe("computeFitScore — derivation from Assessment", () => {
  it("returns VALIDATED with a band when the source assessment is VALIDATED", () => {
    const assessment = computeAssessment(workedExampleAnalysis, workedExampleConfig, {
      goalId: WORKED_EXAMPLE_GOAL_ID,
    });
    // Worked example: Chest HIGH, Recovery MODERATE, Quads LOW, Back NONE.
    // Worst = HIGH -> worstLeverageToBand[HIGH] = "NEEDS_WORK".
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
    expect(result.fitScore.derivedFromAssessmentComputedAt).toBe(
      assessment.assessment.computedAt,
    );
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
    // Same reason, carried verbatim.
    expect(result.reason).toBe(assessment.reason);
  });

  it("derives the band from allAssessedAxes, not from the surfaced subset (invariant 8)", () => {
    // Hand-built assessment: an axis with HIGH leverage that appears in
    // NEITHER strengths NOR attentionAreas (severity below materiality), but
    // is present in allAssessedAxes. computeFitScore must still see it.
    const hiddenHighLeverage = {
      axisType: "RECOVERY_COST" as const,
      scopeKey: null,
      metricValue: 999,
      status: { kind: "BAND" as const, band: "Excessive" },
      severity: "MODERATE" as const,
      weight: "HIGH" as const,
      leverage: "HIGH" as const,
    };
    const assessment: Assessment = {
      programVersionId: "hand-built",
      goalId: "hand-built-goal",
      overallSummary: "hand-built",
      strengths: [],
      attentionAreas: [],
      biggestOpportunity: null,
      actions: [],
      thresholdsValidated: true,
      computedAt: "2026-01-01T00:00:00.000Z",
      allAssessedAxes: [hiddenHighLeverage],
      fitScoreProjection: workedExampleConfig.fitScoreProjection,
    };
    const result = computeFitScore({ kind: "VALIDATED", assessment });
    if (result.kind !== "VALIDATED") throw new Error("expected VALIDATED");
    expect(result.fitScore.band).toBe("NEEDS_WORK");
  });

  it("throws when a VALIDATED result has zero assessed axes (upstream inconsistency)", () => {
    const emptyAssessment: Assessment = {
      programVersionId: "empty",
      goalId: "empty-goal",
      overallSummary: "empty",
      strengths: [],
      attentionAreas: [],
      biggestOpportunity: null,
      actions: [],
      thresholdsValidated: true,
      computedAt: "2026-01-01T00:00:00.000Z",
      allAssessedAxes: [],
      fitScoreProjection: workedExampleConfig.fitScoreProjection,
    };
    expect(() =>
      computeFitScore({ kind: "VALIDATED", assessment: emptyAssessment }),
    ).toThrow(/zero assessed axes/);
  });
});