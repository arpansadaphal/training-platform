// packages/domain/src/assessment/version.ts
//
// Bump on any change that can change an Assessment or Fit result for the same input.
//   0.3.0  E5-E9: effort-aware hard sets, distribution-based FREQUENCY, six required movement patterns,
//          four-check PROGRESSION_SOUNDNESS, injectable RECOVERY_COST.
//   0.4.0  E11: breadth-aware Fit projection (fitScoreProjection.breadth). The worst-leverage band is
//          unchanged; breadth floors can only worsen it.
// Tests that assert the literal: packages/api/src/services/commit.test.ts (toBe("0.4.0")).
export const ASSESSMENT_ENGINE_VERSION = "0.4.0" as const;