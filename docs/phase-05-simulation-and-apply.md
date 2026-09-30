# Phase 5 — Simulation, Mutation Invariant & Apply

## Objective
Implement `applyMutation()`, the `MutationSpec` type, `simulate()`, Gain/Cost/Net + "What Changed," `Simulation` persistence, staleness detection, and a real (if minimal) Apply flow — proving the single highest-priority invariant in the whole system end to end, before AI complexity is layered on top of it in Phase 8.

## Scope
The full mutation/simulation domain logic, plus a minimal manual UI for testing a specific hypothetical change (not the AI Coach — that's Phase 8, reusing everything built here).

## Prerequisites
Phase 4 complete (Draft/Commit path working, `commitFromMutation`'s first call site exists).

## Exact deliverables
- `packages/domain/src/mutation/applyMutation.ts`: every `MutationSpec` op type from `07-versioning-and-simulation.md`, with validation and typed errors for invalid references.
- `packages/domain/src/mutation/simulate.ts`: the pure composition function.
- `packages/domain/src/mutation/diffAssessments.ts`: Gain/Cost/Net classification (leverage-aware, not count-based) and the "What Changed" meaningful-change logic.
- `packages/api/src/routers/simulation.ts`: `simulate(programId | draftId, mutation, goalId)` → persists a `Simulation` row, returns the full `SimulationResult`.
- Extend `programVersionService.ts`'s `commitFromMutation` to accept `origin: { via: 'AI_APPLIED_SIMULATION'; simulationId }`, including the staleness check against the Simulation's `baseVersionId`.
- `packages/api/src/routers/programVersion.ts`: `commitFromSimulation(simulationId)` — the **second and last** call site of `commitFromMutation`.
- A minimal UI affordance in the Builder (e.g., "try a specific change" panel) that lets a user manually construct one atomic `MutationSpec`, simulate it, see Gain/Cost/Net, and apply it — proving the full stack works before Phase 8 adds a model in front of it.

## Files/modules expected to be created
All of the above, plus `packages/domain/src/mutation/__tests__/invariant.test.ts` — the specific test described below.

## Database changes
`Simulation` table writes begin in this phase (table already existed from Phase 1's migration).

## API changes
`simulation.simulate`, `programVersion.commitFromSimulation`.

## Domain changes
This phase is the domain change.

## UI changes
Minimal "simulate a specific change" panel in the Builder; a Gain/Cost/Net display component (reused by the Coach in Phase 8).

## Tests
- **The invariant test, exactly as specified in `13-testing-strategy.md`:** simulate a mutation, then commit it via `commitFromSimulation`; independently recompute Analysis+Assessment on the resulting persisted version; assert structural identity with the simulation's stored `resultAnalysis`/`resultAssessment`.
- Stale-state test: commit a manual edit (Phase 4's path) after simulating, then attempt `commitFromSimulation` with the now-stale `Simulation`; assert `STALE_SIMULATION`, not a silent apply.
- `applyMutation` validation tests: every op type, plus invalid-reference cases.
- "What Changed" tests: a mutation producing no meaningful change asserts `meaningful: false`; a mutation producing a genuine trade-off is classified correctly, not just as a net-positive or net-negative.

## Acceptance criteria
- A user can propose one specific structural change, see exactly what it would gain and cost before committing, and apply it — producing a new immutable `ProgramVersion` through the identical code path Phase 4's manual Commit uses.
- The invariant test passes and is wired into CI as a required check for every future PR touching `packages/domain/mutation` or `packages/api/services/programVersionService.ts`.
- Attempting to apply a stale simulation is rejected, not silently resolved.

## Explicitly NOT included
The AI Coach itself (Phase 8) — this phase proves the mechanism the Coach will later drive, using a manual UI trigger instead of a model.

## Risks
This phase is the one place in the roadmap where getting the abstraction *slightly* wrong (e.g., a subtle difference between how `simulate()` and `commitFromMutation()` load the base structure) would silently violate the core invariant while all other tests still pass. The invariant test above is deliberately independent-recomputation-based, not just "assert the two functions were called" — treat any weakening of that test as a regression, not a simplification.

## Handoff information to the next phase
Update `PROJECT_STATE.md`: confirm the invariant test is in CI as a required check, record `commitFromMutation`'s final two-call-site signature precisely (Phase 8's tool handler will call `simulation.simulate`'s underlying service function directly, and the client will call `commitFromSimulation` directly — neither the Coach nor any future code should need a third path).
