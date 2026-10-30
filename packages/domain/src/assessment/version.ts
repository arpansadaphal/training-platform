// packages/domain/src/assessment/version.ts
//
// Bump on any change that can change an Assessment or Fit result for the same input.
//   0.3.0  E5-E9: effort-aware hard sets, distribution-based FREQUENCY, six required movement patterns,
//          four-check PROGRESSION_SOUNDNESS, injectable RECOVERY_COST.
//   0.4.0  E11: breadth-aware Fit projection (fitScoreProjection.breadth). The worst-leverage band is
//          unchanged; breadth floors can only worsen it.
//   0.5.0  ARCH-063 Session B: (B1) the headline is ranked by deficit, not by axis order; (B2) Low findings are
//          grouped by body region and by missing pattern group, a FREQUENCY "no exposure" axis is dropped when the
//          same muscle has a VOLUME Low, and a whole missing pattern group raises the Exercise selection severity
//          to MODERATE; (B3) PROGRESSION_SOUNDNESS gains a fifth check, NEAR_FAILURE. biggestOpportunity,
//          attentionAreas, actions and overallSummary change for the same input; Assessment gains an optional
//          `findings`. No band, threshold or weight changed, and no Fit band moved on the calibration programs.
//   0.5.1  ARCH-063 Session C1: AnalysisContext.daysPerWeek is read by VOLUME and FREQUENCY (analysis/runsPerWeek.ts):
//          a structure run more or fewer times than once a week is a repeating cycle. A structural read, not a
//          threshold. The output for the same input is identical whenever no context is supplied or daysPerWeek equals
//          the listed days, so no calibration program (none supplies context) changes.
// packages/api/src/services/commit.test.ts compares a snapshot's engineVersion with this constant, not a literal.
export const ASSESSMENT_ENGINE_VERSION = "0.5.1" as const;