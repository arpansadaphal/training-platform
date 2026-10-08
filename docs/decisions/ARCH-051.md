# ARCH-051 — HYPERTROPHY candidate configuration, reference-data scoping, and seed convention

**Date:** 2026-10-08
**Status:** Accepted
**Supersedes:** none

## Context

The `HYPERTROPHY` goal profile shipped with all band bounds null, all axis weights null, and `validated: false`. The roll-up blocked on null weights and every assessment surfaced as UNVALIDATED with a "provisional thresholds" banner. The domain engine was complete; what was missing was the numeric configuration it reads.

A scientific audit reconciled the config against the real `GoalProfileConfig` type, produced candidate values with per-parameter evidence tiers, and ran the candidate config against ten test programs under a Python port of the real algorithms. Two blockers emerged:

1. **Seed scale mismatch.** The seed's `ExerciseMuscleInvolvement.involvementFactor` used continuous values (0.2–0.9, never 1.0). The volume bands are anchored to the evidence convention (primary mover 1.0, synergist 0.5, stabilizer 0) from Pelland et al., Sports Med 2026. Under the continuous scale, compounds were systematically under-credited, misclassifying programs in both directions at band edges.

2. **Non-goal muscle groups judged by default.** The Analysis engine iterates every `muscleGroup` in `ExerciseReferenceData`. With 18 seeded groups, non-goal groups (forearms, abs, obliques, lower back, traps, adductors) read Low under almost any program and — because `VOLUME` carries axis-level weight `HIGH` — drove a bogus `NEEDS_WORK` via the worst-single-leverage Fit projection. Every test program, including a balanced one, read NEEDS_WORK.

## Decision

Land the following as one coherent change.

### 3.1 — Reseed involvement factors to the evidence convention

All 133 `ExerciseMuscleInvolvement` rows are rewritten: 1.0 for primary movers, 0.5 for synergists, dropped entirely for stabilizers. After reseed, 95 rows remain. The seed script gains a `deleteMany` pass so that muscles dropped from the mapping are removed from the DB (the upsert cannot remove rows on its own).

Three adjustments to Claude's draft mapping were accepted:
- Hip Thrust hamstrings 0.5 (not 0) — meaningful hip-extension contribution even when shortened.
- Rows' upper back 0.5 (not 1.0) — lats are the unambiguous primary; upper back is a strong synergist.
- D1 unchanged (glutes 0.5 in squat patterns).

The mapping is a Tier 3 judgment call and needs expert review. Per-exercise comments in the seed script document the reasoning.

Consequence to note: after this change, no seeded exercise credits `lower back`. It isn't a goal group for hypertrophy, but the library gap is real and matters if a future phase adds lumbar-specific loading.

### 3.2 — Scope reference data to the goal's relevant muscle groups

`GoalProfileDefinition` gains `relevantMuscleGroups: readonly string[]`. The HYPERTROPHY list is 11 names: chest, lats, upper back, side delts, rear delts, biceps, triceps, quads, hamstrings, glutes, calves.

`loadExerciseReferenceData` becomes `loadExerciseReferenceData({ goalProfileKey })` — the argument is **required**, not optional, so TypeScript surfaces every call site and none can silently skip the filter. Behind it, a pure function `scopeReferenceDataToGoal` in `packages/domain/src/reference/` filters `muscleGroups` by name (not by id — `MuscleGroup.id` is a cuid, unstable across environments; `name` is `@unique` and stable). The function throws if any requested name is missing, if the scope comes out empty, or if the requested names list is empty.

Exercises and involvements pass through unchanged. The engine's per-muscle axes iterate `muscleGroups`, so non-scoped groups never get visited.

**Interim cost:** loading-time scoping removes non-goal metrics from the persisted `Analysis` entirely — abs and forearms vanish from any UI that reads it. Accepted for the interim. The full fix (scoped `N/A` bands that keep the metric visible without judging it) is a later change.

### 3.3 — Populate the candidate config

`packages/domain/src/goal-profiles/hypertrophy.ts` is populated with:

- **VOLUME bands:** Low <6, Adequate 6–20, High 20–30, Excessive ≥30 (fractional hard sets per muscle per week). Tier 2/3.
- **FREQUENCY bands:** Low <1, Adequate 1–6, High ≥6 (distinct training days per week). Tier 1–2 direction, Tier 4 cutpoints.
- **EXERCISE_SELECTION_BALANCE bands:** Gaps present <0.75, Balanced ≥0.75. Tier 3/4.
- **PROGRESSION_SOUNDNESS bands:** Sound <1, Issue found ≥1. Tier 4, unchanged.
- **RECOVERY_COST bands:** Low <40, Moderate 40–90, High 90–130, Excessive ≥130. Tier 4.
- **Severity map:** VOLUME High → NONE (was MINOR); FREQUENCY Low → MODERATE (was MAJOR), High → NONE (was MINOR); ESB Gaps present → MINOR (was MODERATE); PS Issue found → MINOR (was MODERATE); RECOVERY Moderate → NONE (was MINOR).
- **Axis weights:** VOLUME HIGH; PROGRESSION_SOUNDNESS MEDIUM; RECOVERY_COST MEDIUM; FREQUENCY LOW; EXERCISE_SELECTION_BALANCE LOW.
- **strengthEligibleAxes:** VOLUME, EXERCISE_SELECTION_BALANCE, PROGRESSION_SOUNDNESS (E2 fix, landed earlier in this branch).
- **validated: false.** Not flipped. Flipping is a human sign-off decision.
- **sourceNote:** "provisional thresholds — bands populated from candidate config, pending expert review".

Every non-obvious value carries a comment with its evidence tier. Every cutpoint is an engine boundary, not a biological threshold.

### 3.4 — Engine fixes E1 and E2

- **E1:** `classifyAxes` initialised the Biggest Opportunity rank to `LEVERAGE_RANK["NONE"]` (0), not `-1`. An axis with NONE leverage can no longer be surfaced as the headline opportunity.
- **E2:** Strengths filtered by `config.strengthEligibleAxes`. FREQUENCY and RECOVERY_COST are excluded — "once weekly is fine" and "low recovery cost" are not accomplishments for hypertrophy.

### 3.5 — Version bump and test rewrites

`ASSESSMENT_ENGINE_VERSION` bumps 0.1.0 → 0.2.0. Persisted AssessmentSnapshot outputs change for the same input.

Two existing tests asserted the pre-config state:
- `cannot-compute.test.ts` asserted every axis weight is null. Rewritten to assert `validated === false` and `simulate(...).kind === "CANNOT_COMPUTE"`.
- `shipped-config-unvalidated.test.ts` asserted the shipped config surfaces no classification. Rewritten to assert the union kind, `thresholdsValidated`, and the reason string.
- `commit.test.ts` now asserts against the imported `ASSESSMENT_ENGINE_VERSION` constant instead of a hardcoded string.

## Consequences

### What this enables

The engine produces real assessments with the candidate config loaded. Downstream surfaces (Review, Block Report, Coach) continue to render UNVALIDATED because the union kind says so, but the underlying data is available for testing and for a future E10.

### What this does not change

- `validated` remains `false`. The banner, the launch-gate bypass, and the UNVALIDATED reason string are unchanged.
- `commitFromMutation` still has exactly two call sites.
- `packages/ai`'s boundary is untouched.
- Invariant 11 stands: no cross-user data access.
- `AssessmentSnapshot` schema is unchanged. Historical snapshots keep their original `thresholdsVersion`.

### Known limitations carried forward

- **E3 interim:** non-goal metrics removed from the persisted Analysis, not just from judgment. Real scoped `N/A` bands are the eventual fix.
- **E4:** one severity per band name; no graded severity. A 5.4-set muscle and a 0-set muscle both read Low → MAJOR.
- **E5:** all `targetSets × involvementFactor` count equally; `targetRpe` is ignored.
- **E6:** FREQUENCY counts distinct days with any `involvementFactor > 0`; a 0.2 synergist credit registers as a full exposure.
- **E8:** the progression axis has one rule (%1RM without a 1-rep set) that cannot see Program G's flaws and false-positives on sound %1RM-based programs.
- **E9:** `LoadScheme.percent` unit is undefined; the recovery sum breaks if `percent` is entered as `75` rather than `0.75`.
- **E10:** user-facing classification is gated by convention (UI checks `kind`), not by the domain layer. The inner Assessment carries populated classification fields on the UNVALIDATED branch.
- **E14:** `MuscleGroup.id` is a cuid, so scoped weights keyed by id cannot be committed. Interim: axis-level weights only.
- **E15:** the config now exists in two places — `HYPERTROPHY_CONFIG` in code and the seeded `GoalProfileDefinition` row. The seed upserts with `update: {}` and will not refresh the row. Decide which is authoritative before the first validation flip.

### What an expert reviewer should review

Per Claude's Section 24: the specific cutpoints (6 / 20 / 30 for volume, 1 / 6 for frequency, 0.75 for ESB, 40 / 90 / 130 for recovery); the severity map as a whole; the curated involvement factors for RDL glutes, squat glutes, and rows upper back; whether "Excessive" volume should carry MODERATE severity. The evidence tiers and sources per value are in the config file comments and the audit document.

## References

- Claude scientific audit, Part 2 (Sections 19–24) and Part 3 (seed reconciliation).
- `packages/domain/src/goal-profiles/hypertrophy.ts` — the config.
- `packages/domain/src/reference/scopeReferenceData.ts` — the pure scoping function.
- `packages/api/src/services/referenceDataService.ts` — the required-argument loader.
- `packages/db/prisma/seed.ts` — the reseed and the `deleteMany`.