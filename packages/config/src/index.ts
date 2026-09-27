/**
 * packages/config — the barrel for build-time constants, feature flags, and
 * environment loaders.
 *
 * The env loaders live in ./env.ts and are re-exported wholesale — do not
 * duplicate their names here, or a rename in env.ts will silently break
 * consumers. Only NEW top-level constants and flags belong in this file.
 */

export * from './env';

/**
 * L2 (Historian) feature flag.
 *
 * A BUILD-TIME CONSTANT, not a runtime env read. Flipping L2 on requires a
 * code change and a fresh deploy. That friction is deliberate — L2 is a
 * phase boundary, not a per-request switch.
 *
 * Phase 8 ships this `false`.
 *
 * When `true`:
 *   - packages/ai's buildModelFacingTools includes query_training_history in
 *     the model-facing tool array.
 *   - packages/ai's buildCoachContext populates context.recentHistorySummary.
 *
 * The value is threaded into packages/ai as an argument (via
 * OrchestratorDeps.l2Enabled and BuildCoachContextOptions.l2Enabled) rather
 * than imported by packages/ai, so packages/ai has no runtime dependency on
 * this package for a flag it does not own.
 */
export const L2_ENABLED = false as const;