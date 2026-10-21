// packages/domain/src/assessment/provisionalFit.ts
//
// ARCH-054: the Fit band of a provisional (unvalidated-profile) assessment, for display.
//
// computeFitScore deliberately returns UNVALIDATED for an unvalidated profile, and that stays true: the
// persisted FitScoreResult, the launch gate and every consumer that narrows on `kind` are unchanged. This
// function is the one sanctioned way to read the band anyway, and its result is always labelled
// provisional by the caller.
//
// It runs the SAME projection (projectFitBand) over the SAME leverage roll-up the narrative came from, so
// invariant 8 holds: the provisional band cannot disagree with the strengths and attention areas shown
// beside it. It reads only the Assessment, so it also works on a persisted COMMIT snapshot without
// recomputing anything (ARCH-015).
//
// It returns null when there is no honest band to show:
//   - VALIDATED: the caller should show the real FitScoreResult instead.
//   - The roll-up was BLOCKED: allAssessedAxes is partial, so a band would be fabricated (ARCH-028).
//     computeAssessment leaves all four classification fields empty in exactly that case. A program whose
//     roll-up succeeded always surfaces something, so "nothing classified" is the blocked signal; it is
//     the same discriminator AssessmentDisplay has used since Phase 10.2.

import type { FitBandProjection } from "./computeFitScore";
import { projectFitBand } from "./computeFitScore";
import type { Assessment, AssessmentResult } from "./types";

/** True when classification ran, i.e. the leverage roll-up resolved every axis. */
export function isClassified(assessment: Assessment): boolean {
  return (
    assessment.strengths.length > 0 ||
    assessment.attentionAreas.length > 0 ||
    assessment.biggestOpportunity !== null ||
    assessment.actions.length > 0
  );
}

export function provisionalFitBand(result: AssessmentResult): FitBandProjection | null {
  if (result.kind === "VALIDATED") return null;
  const { assessment } = result;
  if (!isClassified(assessment) || assessment.allAssessedAxes.length === 0) return null;
  return projectFitBand(assessment);
}
