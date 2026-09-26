// packages/domain/src/assessment/__tests__/worked-example.test.ts
//
// The Final Freeze's worked example, verbatim (06-assessment-engine.md
// §Testability and phases/phase-03-assessment-engine.md):
//
//   Axis      Status      Severity   Weight   Leverage
//   Chest     Low         MAJOR      HIGH     HIGH
//   Back      Adequate    NONE       LOW      NONE
//   Quads     High        MINOR      MEDIUM   LOW
//   Recovery  Excessive   MODERATE   MEDIUM   MODERATE
//
// Expected classification:
//   Biggest Opportunity = Chest
//   Attention area      = Recovery
//   Strength            = Back
//   Quads               = not surfaced (severity below materiality; leverage
//                         not the argmax) — it still appears in
//                         `allAssessedAxes`.
//
// See the fixture for the four-tuple derivation and the provisional-values
// warning.

import { describe, expect, it } from "vitest";
import { computeAssessment } from "../computeAssessment";
import {
  WORKED_EXAMPLE_GOAL_ID,
  workedExampleAnalysis,
  workedExampleConfig,
} from "../__fixtures__/workedExample";

function axisLabel(a: { axisType: string; scopeKey: string | null }): string {
  return a.scopeKey ? `${a.axisType}:${a.scopeKey}` : a.axisType;
}

describe("computeAssessment — the Final Freeze worked example", () => {
  const result = computeAssessment(workedExampleAnalysis, workedExampleConfig, {
    goalId: WORKED_EXAMPLE_GOAL_ID,
  });

  it("returns the VALIDATED branch (fixture config is validated: true)", () => {
    expect(result.kind).toBe("VALIDATED");
  });

  // Narrow once; the inner Assessment is identical on both branches, so this
  // is safe even if the first test happens to fail — the remaining assertions
  // will still make sense.
  const assessment = result.assessment;

  it("classifies Chest as the biggest opportunity", () => {
    expect(assessment.biggestOpportunity).not.toBeNull();
    expect(axisLabel(assessment.biggestOpportunity!)).toBe("VOLUME:chest");
  });

  it("classifies Recovery as the single attention area", () => {
    expect(assessment.attentionAreas).toHaveLength(1);
    expect(axisLabel(assessment.attentionAreas[0]!)).toBe("RECOVERY_COST");
  });

  it("classifies Back as the single strength", () => {
    expect(assessment.strengths).toHaveLength(1);
    expect(axisLabel(assessment.strengths[0]!)).toBe("VOLUME:back");
  });

  it("does not surface Quads in any of strengths/attention/biggestOpportunity", () => {
    const surfaced = [
      ...assessment.strengths.map(axisLabel),
      ...assessment.attentionAreas.map(axisLabel),
      assessment.biggestOpportunity ? axisLabel(assessment.biggestOpportunity) : "",
    ];
    expect(surfaced).not.toContain("VOLUME:quads");
  });

  it("still records Quads in allAssessedAxes (roll-up saw it; narrative chose not to surface it)", () => {
    const quads = assessment.allAssessedAxes.find((a) => a.scopeKey === "quads");
    expect(quads).toBeDefined();
    expect(quads!.severity).toBe("MINOR");
    expect(quads!.weight).toBe("MEDIUM");
    expect(quads!.leverage).toBe("LOW");
  });

  it("sets thresholdsValidated: true (fixture config is validated)", () => {
    expect(assessment.thresholdsValidated).toBe(true);
  });

  it("carries the source Analysis.computedAt verbatim", () => {
    expect(assessment.computedAt).toBe(workedExampleAnalysis.computedAt);
  });

  it("produces exactly two actions, one per surfaced non-good axis", () => {
    // Chest -> volume:add-chest (VOLUME Low template)
    // Recovery -> recoveryCost:reduce-intensity (RECOVERY_COST Excessive template)
    // Quads is not surfaced, so no action for it.
    const keys = assessment.actions.map((a) => a.rootCauseKey).sort();
    expect(keys).toEqual(["recoveryCost:reduce-intensity", "volume:add-chest"].sort());
  });
});