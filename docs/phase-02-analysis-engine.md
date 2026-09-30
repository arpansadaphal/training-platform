# Phase 2 — Deterministic Analysis Engine

## Objective
Implement `computeAnalysis()` and its five axis calculators as pure, framework-free functions in `packages/domain`, exactly as specified in `05-analysis-engine.md`, with extensive fixture-based unit tests. No UI or API exposure required beyond a minimal internal test/QA harness.

## Scope
Pure computation only. Volume, Frequency, Exercise Selection Balance, Progression Scheme Soundness, Recovery Cost (provisional formula, clearly marked).

## Prerequisites
Phase 1 complete (domain types + seeded reference data available).

## Exact deliverables
- `packages/domain/src/analysis/computeAnalysis.ts` and one module per axis calculator (`volume.ts`, `frequency.ts`, `exerciseSelectionBalance.ts`, `progressionSoundness.ts`, `recoveryCost.ts`).
- `GoalProfileConfig` and `AxisBandDefinition` types exactly as in `05-analysis-engine.md`, with the `HYPERTROPHY` config's status bands left `null`/`validated: false` — this phase does **not** invent thresholds.
- `computeRecoveryCost` implemented behind a swappable interface with the structural-only placeholder formula described in `05-analysis-engine.md`, explicitly commented as provisional pending sports-science input on both the formula and its thresholds.
- A minimal internal QA route or script (not a real product feature) that runs `computeAnalysis` against a Program a developer builds by hand, for manual sanity-checking during this phase — removed or hidden before Phase 9 launch hardening if it was ever web-exposed.

## Files/modules expected to be created
`packages/domain/src/analysis/*.ts`, `packages/domain/src/analysis/__tests__/*.test.ts`, `packages/domain/src/goal-profiles/types.ts` (the `GoalProfileDefinition`/`GoalProfileConfig` interfaces, registry stub — full registry implementation lands in Phase 3 alongside the first real profile).

## Database changes
None.

## API changes
None required; optional internal-only QA endpoint may be added and must be removed or auth-gated before Phase 9.

## Domain changes
This phase *is* the domain change — see deliverables above.

## UI changes
None.

## Tests
- Per-axis fixture tests covering: a clean in-range case, a below-range case, an above-range case, and an edge case (zero relevant prescriptions) for Volume and Frequency, per muscle group.
- Exercise Selection Balance: a fixture with full movement-pattern coverage (Balanced) and one with a clear gap (Gaps present).
- Progression Scheme Soundness: a fixture with an internally consistent scheme (Sound) and one with a detectable inconsistency (e.g., `PERCENT_1RM` load scheme with no path to establish a 1RM) (Issue found).
- Recovery Cost: fixtures demonstrating the provisional formula's monotonic behavior (more volume/intensity → higher band), explicitly not asserting any specific numeric cutoff as "correct" science.
- Determinism property test: run `computeAnalysis` twice on the same input, assert deep equality.

## Acceptance criteria
- Every axis type produces a structurally correct `AnalysisAxisResult` for a range of hand-built fixture programs.
- No test or source file in this phase contains a plausible-looking numeric threshold presented as validated — CI includes a check (simple grep/lint rule) for `validated: false` on every `GoalProfileConfig` referenced by a test.
- `computeAnalysis` has zero imports from `packages/db`, any HTTP library, or any UI framework (grep-checkable).

## Explicitly NOT included
Assessment (leverage roll-up, Strengths/Attention/Opportunity) — that's Phase 3. Any goal-specific interpretation of these axis results. Any UI display of Analysis output.

## Risks
Recovery Cost's formula is the one genuinely open item in this phase (see `05-analysis-engine.md`'s flagged gap) — its inputs may need to expand beyond `ProgramStructure` (training age, bodyweight) in a future revision. This phase should implement the structural-only placeholder and explicitly document the gap in a code comment and in `PROJECT_STATE.md`'s "known unresolved decisions," not attempt to resolve it by inventing missing inputs.

## Handoff information to the next phase
Update `PROJECT_STATE.md`: list every axis calculator implemented, confirm the determinism/purity tests pass, and flag the Recovery Cost formula's open status explicitly for Phase 3 (which needs a `severity` mapping for Recovery Cost's bands regardless of whether the formula itself is finalized).
