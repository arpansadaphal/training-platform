## Current phase

## Current phase
**Phase 8 (AI Coach) is next.** Phase 7 (Review, Revision Loop & History) is complete. See `docs/phases/phase-08-*.md` and construct the handoff packet with `docs/HANDOFF_TEMPLATE.md`.

**Note on the Coach panel:** Phase 8 will render beside the Review screen and can consume the same `review.get` payload that Phase 7's ReviewClient reads. Reuse the shape; do not re-implement the aggregation.
## Completed phases — append to the end of the existing list

- **Phase 7 — Review, Revision Loop & History.** Read-only aggregation over Phase 6 execution data plus the persisted COMMIT-time AssessmentSnapshot. `packages/api/src/services/reviewService.ts` ships `getReview()` (default view — reads the COMMIT snapshot per ARCH-015) and `recomputeAssessment()` (opt-in live engine pass, persists nothing, never the default). `packages/api/src/services/identityService.ts` ships `getMyIdentitySummary()` — the `/app` landing page's single aggregation read (primary program, active version, current block, current session read-only via `session.getCurrentSession`, three lifetime stats: `sessionsCompleted`, `totalSetsLogged`, `versionsCommitted`). `packages/api/src/services/programVersionService.ts` gains `diffVersions()` — structural diff between two versions of the same Program, reusing `diffStructures` from `packages/domain` (ARCH-037; read-only, computed on demand). New tRPC procedures: `review.get`, `review.recomputeAssessment`, `program.getIdentitySummary`, `session.getCurrentSession`, `programVersion.diff`. New db-layer repository functions: `countCompletedSessionsForProgram` (session.ts), `countPerformanceRecordsForProgram` (performanceRecord.ts). **Bug fix carried in Phase 7**: `sessionService.getSessionContext` now resolves exercise display names via `listExercises` instead of leaking the exercise cuid as `exerciseName`; regression test in `sessionService.test.ts` asserts this. **UI**: `/app` landing redesigned as the Identity/Progress surface (primary program hero + current-session CTA + three stats + block strip with Review link); `/app/review/[blockId]` Review screen with AssessmentDisplay reused verbatim for both the default COMMIT snapshot and the opt-in recompute, visibly separated by a divider; `/app/programs/[id]/history` version history with on-demand structural diffs per version pair. **BLOCK_END snapshots are deferred to Phase 9+ per ARCH-041** — no new migration in Phase 7.
## Current architecture — replace the Phase-6 additions paragraph

Phase 6 additions now in effect: ARCH-039 (commit-triggered `TrainingBlock` lifecycle; all three lifecycle triggers — `activateVersion`, `commitFromMutation`, `archiveMyProgram` — apply the same `COMPLETED` / `ABANDONED` resolution rule, and every trigger runs its reads inside the transaction that performs its writes); ARCH-040 (Phase 6 error-code semantics — ownership/existence failures are `NOT_FOUND`; state failures on authorized, present entities are `PRECONDITION_FAILED`).

Phase 7 additions now in effect: ARCH-041 (BLOCK_END snapshot writing deferred to Phase 9+; Review's default view reads the COMMIT snapshot only). The `commitFromMutation` two-call-site invariant (invariant 2) is unchanged — Phase 7 added zero new write paths. The `packages/ai` boundary (ARCH-011) is unchanged — Phase 7 did not touch that package. `packages/domain` still has zero Prisma/HTTP/UI imports (verified by grep) — Phase 7's only domain-adjacent addition is `diffVersions` in `packages/api`, which reuses the existing pure `diffStructures`. The `errorFormatter` allow-list is unchanged — Phase 7 added no application-level error classes.
## Project conventions — append to the end of the list

- **Review's default view reads the COMMIT snapshot, never a live recompute** (ARCH-015). `reviewService.getReview` filters defensively on `snapshot.reason === "COMMIT"`; if a future phase writes a non-COMMIT snapshot that becomes the latest for a version, the service throws `PRECONDITION_FAILED` with a clear message rather than silently rendering the wrong snapshot. Fix the read (add a `reason` argument to `findLatestAssessmentSnapshotForVersion`) before changing the default.
- **`findLatestAssessmentSnapshotForVersion` takes one argument today** (no `reason` filter). Its docstring says a future variant can take one. When Phase 9 wires BLOCK_END snapshots, that argument is the first thing to add.
- **`session.getCurrentSession` is read-only; `session.getOrCreateNext` is the mutating path.** The landing screen calls the former via `getIdentitySummary`; `/train`'s server action calls the latter. Do not conflate the names in a new call site.
- **`program.getIdentitySummary` is a single aggregation read** so the landing page renders in one round trip. It is a thin forwarder on `programService`; the logic lives in `identityService.ts`. If a future phase needs additional landing-screen data, extend `identityService`, not a new fan-out of procedures.
- **`programVersion.diff` is computed on demand; never stored.** It reuses `diffStructures` from `packages/domain`. Same-Program check → `BAD_REQUEST`; ownership → `NOT_FOUND` per ARCH-040.
- **Playwright `webServer` config is unchanged.** The two Phase 7 E2E specs (`landing-dashboard.spec.ts`, `review.spec.ts`) follow `training.spec.ts`'s pattern.
- **Client-side types for review data**: the RSC converts all `Date` fields to ISO strings and passes JSON-typed `unknown` for `AssessmentResult` / `FitScoreResult` (which are cast inside `ReviewClient` for `AssessmentDisplay`). Same `Client*` discipline as `ClientDraft` / `ClientSessionContext`.
## Repository structure — append to the packages/api and apps/web blocks

`packages/api` contains: `context.ts`, `trpc.ts`, `errors.ts` (four error classes, unchanged through Phase 7), `router.ts` (extended with `review`), `index.ts`, `routers/` (`user.ts`, `program.ts` — extended Phase 7 with `getIdentitySummary`, `draft.ts`, `analysis.ts`, `programVersion.ts` — extended Phase 7 with `diff`, `exercise.ts`, `muscleGroup.ts`, `simulation.ts`, `training.ts`, `session.ts` — extended Phase 7 with `getCurrentSession`, `performance.ts`, `observation.ts`, **Phase 7:** `review.ts`, plus `tests/`), `schemas/` (`programStructure.ts`, `mutation.ts`), `services/` (`programService.ts` — extended Phase 7 with `getMyIdentitySummaryForUser`, `draftService.ts`, `programVersionService.ts` — extended Phase 7 with `diffVersions`, `simulationService.ts`, `referenceDataService.ts`, `loadOwnedProgram.ts`, `loadOwnedExecution.ts`, `trainingService.ts`, `sessionService.ts` — extended Phase 7 with `getCurrentSession` + `exerciseName` resolution, `performanceService.ts`, `observationService.ts`, **Phase 7:** `reviewService.ts`, `identityService.ts`, plus test files).
Append to the apps/web block, after e2e/:


      app/app/page.tsx                # Phase 7: Identity/Progress landing (replaced Phase 0 placeholder)
      app/app/dashboard.module.css    # Phase 7
      app/app/review/[blockId]/       # Phase 7: Review screen (page + ReviewClient + CSS module)
      app/app/programs/[id]/history/  # Phase 7: version history (page + HistoryClient + CSS module)
## API version — replace the full router list

tRPC 11, mounted at `/api/trpc/[trpc]` via `fetchRequestHandler`. Routers and procedures:

- `user.getSelf`
- `program.{create, listMine, get, rename, archive, getIdentitySummary}` — `getIdentitySummary` added Phase 7 (the landing screen's single aggregation read)
- `draft.{create, get, listForProgram, updateStructure, discard}`
- `analysis.previewAnalyze`
- `programVersion.{commitFromDraft, commitFromSimulation, get, listForProgram, diff}` — `diff` added Phase 7 (structural diff, computed on demand via `diffStructures`)
- `exercise.listAll`
- `muscleGroup.listAll`
- `simulation.simulate`
- `training.{activateVersion, getCurrentBlock}`
- `session.{getOrCreateNext, getContext, getCurrentSession, markStarted, markCompleted, markSkipped}` — `getCurrentSession` added Phase 7 (read-only sibling; never creates)
- `performance.{logSet, logBatch, listForSession}`
- `observation.{create, listForBlock, listForSession}`
- `review.{get, recomputeAssessment}` — added Phase 7 (`get` = default COMMIT snapshot view per ARCH-015; `recomputeAssessment` = opt-in live pass, persists nothing, never the default)
## Implemented product capabilities — append

**Phase 7 — Review, History & Landing:** `/app` is now the Identity/Progress surface — the user's primary program (the non-archived one with an ACTIVE TrainingBlock, else the most recently created non-archived one) with its active version, a primary CTA (Continue/Start session → Start next session → Open Builder → Commit a version, in that priority order), three lifetime stats, and a block strip with a Review link. `/app/review/[blockId]` renders the persisted COMMIT-time AssessmentSnapshot via `AssessmentDisplay` (the assessment the user actually saw), the adherence summary (planned vs. completed, systematic deviations grouped by (exercise, kind) and formatted server-side), observations in chronological order, and — below an explicit visual divider — an opt-in "recompute with current thresholds" section that runs a live engine pass on click, never on mount, and warns visibly that it is not what the user trained against. `/app/programs/[id]/history` lists every committed version newest-first with its trigger (Manual commit / AI-applied) and an expandable structural diff from the previous version, computed on demand via `programVersion.diff`. No AI narrative appears on any Phase 7 surface (Final Freeze §19).

**Not implemented:** AI Coach (Phase 8). The full `Simulation` flow is present from Phase 5; `Simulation.createdByConversationId` remains `null` until Phase 8.
## Unresolved decisions — replace the **Phase-4-specific items block with a merged list
Keep the existing Phase-3, Phase-4 (minus the two-message-old note), Phase-5, Phase-6, and Phase-1 items. Add:


**Phase-7-specific items:**
- **`plannedSessions` uses a linear-expectation formula** (`floor((daysElapsed / 7) * workoutDaysPerWeek)`), which is provisional. How "expected so far" is measured is a product decision not signed off. Logged for product review.
- **`SYSTEMATIC_DEVIATION_THRESHOLD = 2`** (a deviation must occur at least twice to be reported as systematic) is provisional. Same product-review category.
- **BLOCK_END snapshot writing is deferred to Phase 9** (ARCH-041). At MVP the config is UNVALIDATED so a BLOCK_END snapshot would duplicate COMMIT. Resumes when Phase 9 ships validated thresholds, along with the schema change (`AssessmentSnapshot.trainingBlockId String?`).
- **`exerciseName` resolution for the Review's deviations and for `sessionService.getSessionContext`** loads the entire `listExercises` set per call. At current reference-data scale (~40 rows) this is a couple of milliseconds; if either surface is ever called at much higher frequency, a memoized lookup is a bounded change.
- **The `loadGoalProfileConfigForGoal` three-hop pattern is inlined in four places** (programVersionService, analysis, simulationService, and now reviewService). Extracting a shared helper and migrating all four sites is a Phase-8+ cleanup candidate; it was deliberately not done in Phase 7.
- **`reviewService.recomputeAssessment` calls `computeAssessment` with the CURRENT config**, which at MVP means an unvalidated assessment. The UI renders it as a preview; a future phase that ships validated thresholds may want to auto-fetch or cache it, not just offer it as opt-in.
## Test status — replace

- **Vitest** (all passing locally and in CI):
  - `packages/config` — 1 file, 3 tests
  - `packages/ai` — 2 files, 3 tests
  - `packages/db` — 4 files, 9 tests (Phase 7 added no db-layer tests; the two new count helpers are exercised indirectly via `trainingService.test.ts` and the identity-summary read path)
  - `packages/api` — **11 files, 64 tests** (Phase 7 added 1 test: `sessionService.test.ts` gains `getSessionContext returns exercise display names, not cuids`)
  - `packages/domain` — 24 files, 179 tests (unchanged by Phase 7)
  - **Total Vitest**: **42 files, 258 tests**
- **Playwright** (all passing):
  - `e2e/landing.spec.ts` — Phase 0, unchanged
  - `e2e/builder.spec.ts` — Phase 4
  - `e2e/builder-simulate.spec.ts` — Phase 5
  - `e2e/training.spec.ts` — Phase 6
  - **`e2e/landing-dashboard.spec.ts` — Phase 7** (returning user with an active program and a completed session sees their current status as the primary content, not a feature grid)
  - **`e2e/review.spec.ts` — Phase 7** (ACTIVE-block `isPartial: true` case + completed-block case)
- `pnpm turbo run lint typecheck` → clean
- `pnpm turbo run test` → all packages pass
## Next phase
markdown
## Next phase
Phase 8 — AI Coach. See `docs/phases/phase-08-*.md`.

**Cross-references for Phase 8:**
- **Review is already assembled.** `packages/api/src/services/reviewService.getReview` returns `ReviewData` — the Coach panel should consume the same shape, not re-aggregate execution data.
- **The Coach panel renders beside Review.** Both surfaces are in `/app/review/[blockId]`; the Coach is a sibling panel, not a replacement.
- **`packages/ai` still has no import path to `commitFromMutation`.** The permanent boundary test at `packages/ai/src/__tests__/boundary.test.ts` enforces this (ARCH-011). Phase 8's Coach calls `simulate()` and read-domain functions only; the apply path is `programVersion.commitFromSimulation` called from client code on an explicit user click (ARCH-018).
- **`Simulation.createdByConversationId` is the column Phase 8 populates.** It remains `null` through Phase 7.
- **The `L2_ENABLED` feature flag is a Phase 8 decision.** Phase 7 did not touch `packages/config`.
- **BLOCK_END snapshots are still deferred** (ARCH-041). The Coach's context builder reads the same COMMIT snapshot via `findLatestAssessmentSnapshotForVersion(versionId)`; no Phase 9 work is a prerequisite for Phase 8.