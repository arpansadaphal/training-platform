# Phase 3 — Assessment Engine & Fit Score

## Objective
Implement the GoalProfile registry, the first real profile (Hypertrophy), `computeAssessment()`, the leverage roll-up, Strengths/Attention/Opportunity/Actions generation, and `computeFitScore()` — exactly as specified in `06-assessment-engine.md`, with the Final Freeze's own worked example as a literal test case.

## Scope
Pure computation only, building directly on Phase 2's `Analysis` output.

## Prerequisites
Phase 2 complete.

## Exact deliverables
- `packages/domain/src/goal-profiles/registry.ts`: the `GoalProfileRegistry` class described in `05-analysis-engine.md`.
- `packages/domain/src/goal-profiles/hypertrophy.ts`: the first concrete `GoalProfileDefinition`, registering itself, with `axisWeights` and the severity-mapping table structurally complete but numerically unresolved (`validated: false`, `sourceNote: "UNRESOLVED — SCIENTIFIC INPUT REQUIRED"`).
- `packages/domain/src/assessment/computeAssessment.ts`: the full leverage roll-up algorithm from `06-assessment-engine.md` (Severity × Weight → Leverage lookup, Biggest Opportunity selection, Strengths/Attention classification, materiality threshold, Action generation with root-cause deduplication).
- `packages/domain/src/assessment/actionTemplates.ts`: deterministic, template-based Action descriptions keyed by `(axisType, status, goalProfileKey)` — not AI-authored.
- `packages/domain/src/assessment/computeFitScore.ts`: takes only an `Assessment` as input, per the structural guarantee in `06-assessment-engine.md`.

## Files/modules expected to be created
Everything listed above, plus `packages/domain/src/assessment/__tests__/worked-example.test.ts` (the Final Freeze's Chest/Back/Quads/Recovery fixture, verbatim).

## Database changes
None in this phase (the `GoalProfileDefinition` *row* was seeded in Phase 1; this phase adds the *code-level* profile module that reads/validates against it).

## API changes
None required yet — Assessment becomes reachable through the API in Phase 4, alongside the Builder.

## Domain changes
This phase *is* the domain change.

## UI changes
None.

## Tests
- **The worked example, verbatim:** Chest (Low/Major/High weight) → Biggest Opportunity; Back (Adequate) → Strength; Quads (High status/Medium weight) → Low leverage, not surfaced as an issue; Recovery (Excessive/Moderate weight) → Attention area. Assert the `Assessment` object matches this classification exactly.
- Deduplication: a fixture where two axes share a root cause (e.g., a missing chest day depressing both Chest Volume and Chest Frequency) produces one Action, not two.
- Fit Score structural guarantee: assert by type signature and by test that `computeFitScore` cannot access anything except the `Assessment` object passed to it.
- Determinism property test, same pattern as Phase 2.
- CI launch-gate check (introduced this phase, reused through Phase 9): fail a `production`-flagged build if any registered `GoalProfileConfig` has `validated: false`.

## Acceptance criteria
- The worked-example test passes exactly as specified in the Final Freeze.
- No screen-shaped output exists yet (that's Phase 4), but the `Assessment` object's shape is final and matches `06-assessment-engine.md` precisely.
- `computeFitScore`'s only parameter is `Assessment` (enforced by the function's type signature, not just a test).

## Explicitly NOT included
Any UI. Any persistence of `AssessmentSnapshot` rows (that begins in Phase 4, at Commit time). A second Goal profile (Strength) — Phase 10 at the earliest, and only if pursued.

## Risks
The severity-mapping table (Status → Severity, per axis) and the Severity×Weight → Leverage lookup table's *cell contents* remain unresolved alongside the numeric thresholds — this phase implements the table's *shape* correctly (so the worked example passes using illustrative-but-consistent internal values) without presenting those specific cell values as scientifically validated. Flag this distinction clearly in code comments so a future contributor doesn't mistake "the test passes" for "the values are validated."

## Handoff information to the next phase
Update `PROJECT_STATE.md`: confirm the worked-example test passes, list the registry's registered profiles (just `HYPERTROPHY`), and note explicitly that Fit Score bands are generic placeholders (`NEEDS_WORK`/`DECENT`/`STRONG`) pending the Final Freeze Appendix C item 5 (whether named bands exist in the unavailable source text).
