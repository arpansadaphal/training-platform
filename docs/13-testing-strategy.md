# 13 — Testing Strategy (PART J, part 1 of 3)

## Levels

### Domain tests (Vitest, `packages/domain`)
Pure-function, fixture-based, no database, no network — the fastest and most-run suite.
- `computeAnalysis`: hand-built `ProgramStructure` fixtures per axis type, including edge cases (zero prescriptions, a muscle group touched by no exercise, an exercise touching multiple muscle groups).
- `computeAssessment`: the Final Freeze's own worked example (Chest/Back/Quads/Recovery) as a literal fixture, plus deduplication-of-root-causes cases.
- `computeFitScore`: property test — for any valid `Assessment`, the resulting `FitScore.band` must be derivable *only* from that `Assessment` object (no other input possible by the function's own type signature, but this is also asserted at the test level).
- `applyMutation`: every `MutationSpec` op type, plus invalid-reference cases (removing a non-existent prescription) asserting the typed error.
- `simulate`: composition correctness — `simulate(base, mutation, goal, refData)`'s `mutatedAssessment` must equal `computeAssessment(computeAnalysis(applyMutation(base, mutation), refData), goal)` computed independently in the test, i.e. the composition isn't secretly doing something different from its parts.

### API tests (Vitest + a test database, `packages/api`)
- **Authorization:** every owner-scoped procedure, called with a non-owner session, returns `UNAUTHORIZED` and leaks no data in the error payload.
- **Validation:** malformed input rejected with `VALIDATION_ERROR` before any service code runs (assert via a spy that the service was never called).
- **Consistency — the single most important test in the whole suite:** simulate a mutation via `simulation.simulate`, then commit it via `programVersion.commitFromSimulation`; independently recompute Analysis+Assessment on the persisted new version; assert the simulation's `resultAnalysis`/`resultAssessment` and the independently-recomputed values are structurally identical. This is the literal test of the Final Freeze §36's named highest-priority invariant.
- **Concurrency/stale state:** commit a manual edit to a Program, then attempt `commitFromSimulation` using a `Simulation` whose `baseVersionId` predates that edit; assert `STALE_SIMULATION`, not a silently-applied diff.

### UI tests (Playwright, `apps/web`)
Full flows, not component snapshots: sign up → build a program → see Analysis/Assessment render in the specified order (Overall → Strengths → Attention → Biggest Opportunity → Actions) → commit → log a full workout Session → open Review → revise into a new Draft. A second flow: simulate a change via the Coach → confirm the Apply button is rendered → click it → assert a new `ProgramVersion` exists and the conversation itself never triggered the commit (assert via network inspection that `commitFromSimulation` fired only after the click, not during the streaming response).

### AI tests (Vitest, `packages/ai`, using `MockProvider`)
- **Tool invocation:** scripted tool-call sequences resolve to the correct domain calls with correctly-injected `userId`.
- **Grounding:** a scripted model response containing a number *not* present in the turn's context/tool-results fails the post-processing validation check (see `10-ai-coach-architecture.md`).
- **Simulation consistency:** `simulate_program_change`'s tool handler and the `simulation.simulate` tRPC procedure, given identical inputs, produce identical output — asserting they truly are the same call, not two implementations that happen to agree today.
- **Permission boundaries:** a scripted attempt to reference another user's data (via a manipulated tool argument) is rejected, because the handler ignores any user-identifying argument from the model and uses only the server-injected session `userId`.
- **Structured output:** every `claim`-type segment has a non-null `evidenceTag`; malformed segments are rejected before persistence.
- **Failure cases:** a tool-level `applyMutation` validation error surfaces as a graceful conversational message, asserted via a snapshot of the persisted `AIMessage`, never as an unhandled exception.

## Critical invariants (must never break — CI-enforced where feasible)

1. Committed `ProgramVersion` rows are never updated after creation (enforced at the Prisma repository layer: `saveNewProgramVersion` only ever inserts; no `updateProgramVersion` function exists in `packages/db` at all — its absence is the enforcement).
2. `simulate()` and `commitFromMutation()` call the identical `applyMutation` function (enforced by the API consistency test above, re-run on every CI build).
3. `computeAnalysis`/`computeAssessment` are deterministic — same input, same output, always (property-tested: run twice, assert deep equality).
4. Server-side authority — no client code path computes Analysis/Assessment for anything other than optimistic UI preview; the persisted `AssessmentSnapshot` always comes from a server call.
5. Historical reproducibility — an `AssessmentSnapshot`'s `engineVersion`/`thresholdsVersion` fields are always populated and never overwritten.
6. Unauthorized users cannot access private data (authorization test suite above, run for every owner-scoped router).
7. The AI cannot bypass user confirmation to mutate program structure (enforced structurally — see `10-ai-coach-architecture.md` — and asserted by the AI test suite's network-level check above).

Testing infrastructure setup (test database provisioning, CI wiring) is defined in `phases/phase-00-foundation.md`; each subsequent phase adds to this suite incrementally rather than treating testing as a final-phase activity.
