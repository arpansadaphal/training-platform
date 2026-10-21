# ARCH-054 — Evidence-graded thresholds

**Date:** 2026-10-21
**Status:** Accepted
**Supersedes:** ARCH-046's banner wording only ("Thresholds are provisional — this assessment is not yet scientifically validated"). Everything else in ARCH-046 stands: the launch gate, `LAUNCH_OVERRIDE_TOKEN`, the banner being non-dismissable and mounted only in `AssessmentDisplay`, and the CI check.
**Superseded by:** none

## Context

The Phase A walkthrough found that the product's central promise, "rate the split", produced no rating. `computeFitScore` returns `UNVALIDATED` for any profile with `validated: false`, and `AssessmentDisplay` rendered a Fit band only for `VALIDATED`, so no user had ever seen one. The banner told users the assessment was "not yet scientifically validated", which reads as "not based on science". In fact every threshold in `hypertrophy.ts` carries an evidence tier (1–4) and citations from the Phase 10.2 research audit, written as code comments that no user could see.

`validated: false` was being used for two different jobs:

1. Saying that no human expert has signed off the profile end to end. This is true, and it matters for production.
2. Hiding output. This stopped users seeing a band that the engine computes consistently from the same roll-up as the narrative they already see.

## Decision

Keep job 1 and stop job 2.

1. **The Fit band is shown, labelled provisional.** New `provisionalFitBand(result)` (`packages/domain/src/assessment/provisionalFit.ts`) returns `projectFitBand(assessment)` for an `UNVALIDATED` result whose classification ran, and `null` for a `VALIDATED` result or a blocked roll-up. It is the same projection over the same `allAssessedAxes`, so invariant 8 holds by construction. It reads only the Assessment, so Review shows it from the persisted COMMIT snapshot without recomputing (ARCH-015). The UI renders it as "Provisional fit: DECENT — based on evidence-graded thresholds. See evidence".
2. **`computeFitScore` is unchanged.** It still returns `UNVALIDATED`. Persisted `FitScoreResult`s, the Coach context, `diffAssessments` and simulation (`CANNOT_COMPUTE`) are untouched.
3. **The evidence becomes data.** `GoalProfileConfig` gains an optional `evidence: GoalProfileEvidence`: a per-axis `thresholdTier`, plus `claims` (each with a tier range and sources), plus the same for the Fit projection. `HYPERTROPHY_EVIDENCE` restates the tier comments in `hypertrophy.ts` (and the Epley note in `progressionSoundness.ts`) exactly. Nothing is regraded. No engine code reads the field.
4. **Tier vocabulary** lives in `goal-profiles/evidence.ts`. For each tier it gives a meaning and a "what it is not": Tier 2 means the direction is well-supported but the exact boundary is our judgment, and Tier 4 is a product decision, not a measurement.
5. **The banner copy changes** to: "Thresholds are evidence-graded, not human-validated. Tier 1 rests on meta-analyses and trials; Tier 4 is engine-derived. These thresholds range from Tier 2 to Tier 4. See evidence". The tier span is computed from the config, and it shows that no hypertrophy threshold is Tier 1.
6. **An evidence panel** (`EvidencePanel.tsx`), opened from the banner or the Fit line, shows for each axis: the tier, the primary sources, what the tier means and is not, and the underlying claims.

## Guardrails

- `validated: false` is unchanged, and so is the launch gate's behaviour.
- The copy never says "validated" in the positive. `evidence.test.ts` asserts that the evidence block does not contain the word.
- `evidence.test.ts` pins the threshold tiers: VOLUME 2–3, FREQUENCY 4, EXERCISE_SELECTION_BALANCE 3–4, PROGRESSION_SOUNDNESS 3–4, RECOVERY_COST 4, Fit 4. Changing a tier is a regrade and needs its own decision entry, not a test edit.
- No threshold value changed. `ASSESSMENT_ENGINE_VERSION` is not bumped, because no output of `computeAnalysis`, `computeAssessment` or `computeFitScore` changed.

## Consequences

- Every assessment surface (Builder, Review, Block Report, recompute preview) shows a provisional band, because each one goes through `AssessmentDisplay`.
- A blocked roll-up still shows `UnvalidatedState` and no band (ARCH-028).
- When a profile ships with `validated: true`, `computeFitScore` returns `VALIDATED`, the UI shows "Fit:" without "Provisional", and the banner disappears through `useProvisionalBanner`, as ARCH-046 intended.
- Known limit, carried over from Phase 10.2: "classification ran" is detected as "at least one strength, finding, opportunity or action". A program whose roll-up succeeded but surfaced nothing would show no band. It has not occurred.

## Related

- ARCH-015 (Review reads the snapshot), ARCH-028 (no fabricated bands), ARCH-030 (Fit derivation), ARCH-046 (launch gate and banner), ARCH-051 and ARCH-052 (the candidate config and axis rebuild whose comments this entry restates).
- ARCH-053 (breadth-aware Fit, E11) defines the band this entry makes visible. It was backfilled in the same PR, because Phase 10.4 shipped without a decision entry.
