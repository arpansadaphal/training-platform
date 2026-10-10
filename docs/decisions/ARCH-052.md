# ARCH-052 — Axis rebuild (E5–E9)

**Date:** 2026-10-09
**Status:** Accepted
**Supersedes:** none
**Superseded by:** none

## Context

The Phase 10.2 calibration confirmed two blockers were fixed (seed scale, muscle scope) and produced the first real classification. But the audit's Section 22 named five axis gaps — E5 through E9 — where the calculators measured something narrower than their names implied:

- PROGRESSION_SOUNDNESS had one rule (%1RM without a 1-rep set) that could not see effort, overload mechanism, rep ranges, or increments. Program G (a genuinely broken progression scheme) read `Sound`.
- VOLUME counted every set equally regardless of proximity to failure.
- FREQUENCY counted distinct days with any involvement > 0, ignoring dose and distribution.
- EXERCISE_SELECTION_BALANCE required CARRY and ISOLATION — patterns with no hypertrophy evidence.
- RECOVERY_COST read `LoadScheme.percent` as entered, so `0.75` and `75` produced results differing 100-fold.

## Decision

Rebuild all five axis calculators per the audit's recommendations.

**E5 — effort-aware hard-set counting.** New shared helper `packages/domain/src/analysis/hardSetCredit.ts`. Sets earn:
- full credit (1) at RIR ≤3 (RPE ≥7)
- half credit (0.5) at RIR 4 (and fractional RIR strictly between 3 and 5)
- zero credit at RIR ≥5
- assumed RIR 2 when effort is undefined

Applied to VOLUME (per-muscle hard sets), FREQUENCY (weekly dose and exposure threshold), PROGRESSION_SOUNDNESS (effort-defined check). RECOVERY_COST uses the helper only to read effort, not to scale cost — a set at RPE 5 still costs 0.5, but does not vanish from the total.

**E6 — FREQUENCY reframed as distribution.** Metric is `exposures / required` where:
- `required = max(1, ceil(weeklyFractionalSets / perSessionSetCap))`
- an exposure is a session with ≥`minExposureSets` (2.0) fractional hard sets for the muscle
- `perSessionSetCap` defaults to 10

Bands: Low <1, Adequate 1 to <4, High ≥4 (severity NONE, informational). Root-cause key is now `frequency:split-<scope>`, no longer sharing with `volume:add-<scope>`. The dedup loop no longer collapses them.

**E7 — SELECTION pattern list from config.** New `GoalProfileConfig.requiredMovementPatterns: readonly MovementPattern[]`. Hypertrophy default drops CARRY and ISOLATION, keeping SQUAT, HINGE, HORIZONTAL_PUSH, VERTICAL_PUSH, HORIZONTAL_PULL, VERTICAL_PULL. Typed as `MovementPattern[]` not `string[]` so typos fail at compile time.

**E8 — PROGRESSION_SOUNDNESS rule set.** Replaced the single %1RM rule with four computable checks:
- EFFORT_DEFINED — ≥80% of prescriptions state an effort
- FAR_FROM_FAILURE — ≤25% of sets at RIR ≥5
- REP_RANGE — ≥80% of sets wholly inside 5–30 reps
- PERCENT_1RM_FEASIBILITY — no %1RM prescription exceeds the percentage's rep-max

`metricValue` is the count of failed checks (0–4). Bands unchanged (Sound <1, Issue found ≥1). Severity stays MINOR.

**INTERIM:** the rep-max-at-percentage check uses the Epley equation. Nuzzo 2023 is the intended source and was not retrieved. Epley over-rejects above ~10 reps; `percent1RmRepTolerance` (default 1) may need widening.

**E9 — Recovery calculator injectable.** New optional `ComputeAnalysisOptions.recoveryCostCalculator`. The provisional calculator computes `sum(targetSets × intensityWeight)` where `intensityWeight = RPE / 10` (from `targetRpe`, else the RPE_BASED load scheme's rpe, else 0.8). `LoadScheme.percent` is no longer read at all — the 0.75-vs-75 ambiguity is eliminated. `RecoveryCostCalculator.compute` gained an optional third `config` parameter.

## Consequences

**What changes.**
- Axis outputs change for the same input. `ASSESSMENT_ENGINE_VERSION` bumped 0.2.0 → 0.3.0.
- Program G now correctly reads `PROGRESSION_SOUNDNESS = Issue found`. This was the single largest gap.
- Program D now surfaces `FREQUENCY:chest` as its biggest opportunity (13 sets on chest in one session).
- Program C surfaces six frequency problems from its 26–36-set sessions.
- `G-pct(0.75)` and `G-pct(75)` now produce identical recovery output. Unit ambiguity eliminated.

**What stays the same.**
- `validated` remains `false`.
- Fit is unchanged on all 10 calibration programs. Every new finding lands at LOW leverage or below; LOW → STRONG in the fit projection.
- No schema change. No migration. No `packages/ai` change. No `commitFromMutation` call-site change.
- Severity weights, `severityWeightTable`, `fitScoreProjection`, `materialitySeverityThreshold`, `strengthEligibleAxes`, `relevantMuscleGroups` — all unchanged.

**Carry-forward.**
- **FREQUENCY `minExposureSets` = 2.0.** Indirect work below that threshold per session now reads Low, not Adequate. Program A's biceps flip from Adequate → Low. Arguably correct (1.0 hard-set equivalents is light) but a tuning question.
- **Recovery bands not recalibrated after the weight change.** Programs without stated effort read ~20% lower. No calibration program is in the affected range.
- **E8's `percent1RmRepTolerance` may need widening** once real programs surface false positives on sound %1RM prescriptions.
- **E11 (breadth-aware Fit) is still the deferred lever** that makes the Fit band reflect the axis output. Not this entry.

**Test count delta.** `@training/domain` 178 → 185 (+7 net). `@training/api` 138 → 140 (calibration 18 → 20). Total 52/371 → 59/398.

## Related

- ARCH-051 — config, scope, seed convention, E9 guard
- `00-product-freeze-reference.md` — invariant 2 (simulate and apply share one mutation function), invariant 8 (Fit derives from the same roll-up as the Assessment)
- The audit's Section 22 (Engine Change Recommendations, E5–E12)