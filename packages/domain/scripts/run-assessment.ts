// packages/domain/scripts/run-assessment.ts
//
// Developer-only QA harness. Prints the full Assessment for two inputs:
//
//   1. A real Analysis (via computeAnalysis) paired with the shipped
//      HYPERTROPHY config. Expect UNVALIDATED — all bands and weights are
//      null in the shipped profile.
//   2. The worked-example fixture's hand-built Analysis paired with its
//      validated fixture config. Expect VALIDATED, with classification and
//      a Fit Score band.
//
// No web route, no tRPC procedure — same pattern as run-analysis.ts.
//
// Run with: pnpm --filter @training/domain exec tsx scripts/run-assessment.ts
// Requires `tsx` as a devDependency (already present from Phase 2).

import type { AssessedAxis } from "../src/assessment/types";
import { computeAnalysis } from "../src/analysis/computeAnalysis";
import { testReferenceData } from "../src/analysis/__fixtures__/exerciseReferenceData";
import { devScriptProgram } from "../src/analysis/__fixtures__/programStructures";
import { computeAssessment } from "../src/assessment/computeAssessment";
import { computeFitScore } from "../src/assessment/computeFitScore";
import { workedExampleAnalysis, workedExampleConfig, WORKED_EXAMPLE_GOAL_ID } from "../src/assessment/__fixtures__/workedExample";
import { HYPERTROPHY_CONFIG } from "../src/goal-profiles/hypertrophy";
import type { AssessmentResult } from "../src/assessment/types";

function axisLabel(a: AssessedAxis): string {
  const scope = a.scopeKey ? `${a.axisType}:${a.scopeKey}` : a.axisType;
  return `${scope} [sev=${a.severity} w=${a.weight} lev=${a.leverage}]`;
}

function printAssessment(label: string, result: AssessmentResult): void {
  console.log(`=== ${label} ===`);
  console.log(`kind: ${result.kind}`);
  if (result.kind === "UNVALIDATED") {
    console.log(`reason: ${result.reason}`);
  }
  const a = result.assessment;
  console.log(`goalId: ${a.goalId}`);
  console.log(`computedAt: ${a.computedAt}`);
  console.log(`thresholdsValidated: ${a.thresholdsValidated}`);
  console.log(`overallSummary: ${a.overallSummary}`);
  console.log(`allAssessedAxes (${a.allAssessedAxes.length}):`);
  for (const axis of a.allAssessedAxes) {
    console.log(`  - ${axisLabel(axis)}`);
  }
  console.log(`strengths (${a.strengths.length}):`);
  for (const axis of a.strengths) console.log(`  - ${axisLabel(axis)}`);
  console.log(`attentionAreas (${a.attentionAreas.length}):`);
  for (const axis of a.attentionAreas) console.log(`  - ${axisLabel(axis)}`);
  console.log(
    `biggestOpportunity: ${
      a.biggestOpportunity ? axisLabel(a.biggestOpportunity) : "(none)"
    }`,
  );
  console.log(`actions (${a.actions.length}):`);
  for (const action of a.actions) {
    console.log(`  - [${action.rootCauseKey}] ${action.description}`);
  }
  const fit = computeFitScore(result);
  console.log(
    `fitScore: ${
      fit.kind === "VALIDATED"
        ? `${fit.fitScore.band} (derived ${fit.fitScore.derivedFromAssessmentComputedAt})`
        : `UNVALIDATED (${fit.reason})`
    }`,
  );
  console.log();
}

// ---------------------------------------------------------------------------
// Case 1 — real Analysis via computeAnalysis, shipped HYPERTROPHY config.
// ---------------------------------------------------------------------------

const analysis = computeAnalysis(
  devScriptProgram,
  testReferenceData,
  HYPERTROPHY_CONFIG,
  { programVersionId: "DEV-SCRIPT" },
);
const shippedResult = computeAssessment(analysis, HYPERTROPHY_CONFIG, {
  goalId: "DEV-SCRIPT-GOAL",
});
printAssessment(
  "Shipped HYPERTROPHY config on devScriptProgram (expect UNVALIDATED)",
  shippedResult,
);

// ---------------------------------------------------------------------------
// Case 2 — worked-example fixture Analysis, worked-example validated config.
// ---------------------------------------------------------------------------

const workedResult = computeAssessment(workedExampleAnalysis, workedExampleConfig, {
  goalId: WORKED_EXAMPLE_GOAL_ID,
});
printAssessment(
  "Worked-example fixture (expect VALIDATED, band NEEDS_WORK)",
  workedResult,
);