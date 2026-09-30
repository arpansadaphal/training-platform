# Phase 4 — Program Builder, Live Analyze & Commit

## Objective
Build the user-facing Builder: creating/editing `ProgramDraft` structures (WorkoutDays, ExercisePrescriptions), live Analyze display using Phase 2/3's engine, and the Commit action that produces the system's first real, immutable `ProgramVersion`. This is the "fast BUILD↔ANALYZE loop" working end to end for manual edits — no Simulation, no AI yet.

## Scope
Draft CRUD, live analysis preview, Commit, first `Revision` record, first persisted `AssessmentSnapshot`.

## Prerequisites
Phases 1–3 complete.

## Exact deliverables
- `packages/api/src/routers/draft.ts`: create (from scratch or from a base version), update structure, discard, list a Program's Drafts (plural, per `07-versioning-and-simulation.md`'s design).
- `packages/api/src/routers/analysis.ts`: `previewAnalyze(draftId)` — live compute via `packages/domain`, not persisted.
- `packages/api/src/routers/programVersion.ts`: `commitFromDraft(draftId)` — implements `commitFromMutation` with `origin: MANUAL_COMMIT`, exactly as specified in `07-versioning-and-simulation.md`; writes the `ProgramVersion` (snapshot + normalized rows in one transaction), the first `Revision`, and the first `AssessmentSnapshot` (`reason: COMMIT`).
- `apps/web/app/programs/[id]/build/`: the Builder UI — structure editor, multiple Drafts shown/comparable side by side, the Metric → Assessment → Action screen in the Final Freeze's fixed order (Overall → Strengths → Attention → Biggest Opportunity → Actions).
- `packages/db/src/repositories/draftRepository.ts`, extension of `programVersionRepository.ts` for the commit transaction.

## Files/modules expected to be created
All of the above, plus `packages/api/src/services/programVersionService.ts` (the home of `commitFromMutation` — the module Phase 5's AI-apply path will later call into as its *second* call site, per `07-versioning-and-simulation.md`).

## Database changes
None beyond what Phase 1 already created — this phase is the first to actually *write* `ProgramVersion`, `WorkoutDay`, `ExercisePrescription`, `Revision`, and `AssessmentSnapshot` rows.

## API changes
`draft.*`, `analysis.previewAnalyze`, `programVersion.commitFromDraft`, `programVersion.get`, `programVersion.listForProgram`.

## Domain changes
None new — this phase is the first consumer of Phases 2–3's engine through the API.

## UI changes
The Builder (structure editing + live Analyze), the Assessment display component (reused by Review in Phase 7 and by the Coach in Phase 8 — build it once, generically, here).

## Tests
- API: commit produces a structurally valid `ProgramVersion` whose persisted `structureSnapshot` matches the Draft's structure at commit time exactly.
- API: `versionNumber` increments correctly per Program; two concurrent commits on the same Program never collide (test with a uniqueness-constraint-violation scenario).
- API: committing sets `Program.activeVersionId` by default (per the "commit + activate as one action at MVP" decision).
- UI E2E: build a program with a deliberate imbalance (e.g., no chest work), verify the Assessment screen surfaces it as Biggest Opportunity, in the correct screen order.
- UI E2E: create two Drafts on the same Program, verify both are independently editable and analyzable without interfering with each other.

## Acceptance criteria
- A user can build a program from scratch, see it analyzed live as they edit, and commit it to become a real, immutable `ProgramVersion` — in production.
- The committed version never changes after creation (assert no `updateProgramVersion` function exists anywhere in the codebase).
- The Assessment screen matches the Final Freeze §9's fixed structure exactly.

## Explicitly NOT included
Simulation, Gain/Cost/Net, the AI Coach, any Training/logging UI, Review. "Compare two Drafts side by side" in this phase means both are independently viewable/analyzable — a dedicated comparison UI (explicit diff-highlighting between two Drafts) is a nice-to-have refinement, not a blocking acceptance criterion for this phase.

## Risks
This is the first phase where the "commit" transaction's atomicity actually matters (version + revision + snapshot + active-pointer update, as one unit) — get the transaction boundary right here, since every later phase depends on it never producing a partially-committed state.

## Handoff information to the next phase
Update `PROJECT_STATE.md`: confirm the commit transaction is atomic (tested under a simulated failure mid-transaction, if feasible), record the exact shape of `commitFromMutation`'s signature for Phase 5 to extend with the `AI_APPLIED_SIMULATION` origin path, and note the Assessment display component's location for reuse in Phases 7 and 8.
