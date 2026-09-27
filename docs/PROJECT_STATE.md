cd /Users/arpan/Documents/code/training-platform

cat > docs/PROJECT_STATE.md << 'PROJECT_STATE_EOF'
## Current phase

**Phase 9 (Validated thresholds & BLOCK_END snapshots) is next.** Phase 8 (AI Coach L0/L1) is complete. See `docs/phases/phase-09-*.md` and construct the handoff packet with `docs/HANDOFF_TEMPLATE.md`.

**Note on the Coach panel:** the panel renders beside Review at `/app/review/[blockId]` and on the dedicated `/app/coach` route. Both surfaces consume the same `packages/ai` orchestrator; the panel itself is a single component at `apps/web/src/components/coach/CoachPanel.tsx`. The `coach.openConversationForBlock` procedure resolves the Review page's block id to a scoped conversation server-side, so no flicker on first paint.

## Completed phases

- **Phase 7 — Review, Revision Loop & History.** Read-only aggregation over Phase 6 execution data plus the persisted COMMIT-time AssessmentSnapshot. `packages/api/src/services/reviewService.ts` ships `getReview()` (default view — reads the COMMIT snapshot per ARCH-015) and `recomputeAssessment()` (opt-in live engine pass, persists nothing, never the default). `packages/api/src/services/identityService.ts` ships `getMyIdentitySummary()` — the `/app` landing page's single aggregation read (primary program, active version, current block, current session read-only via `session.getCurrentSession`, three lifetime stats: `sessionsCompleted`, `totalSetsLogged`, `versionsCommitted`). `packages/api/src/services/programVersionService.ts` gains `diffVersions()` — structural diff between two versions of the same Program, reusing `diffStructures` from `packages/domain` (ARCH-037; read-only, computed on demand). New tRPC procedures: `review.get`, `review.recomputeAssessment`, `program.getIdentitySummary`, `session.getCurrentSession`, `programVersion.diff`. New db-layer repository functions: `countCompletedSessionsForProgram` (session.ts), `countPerformanceRecordsForProgram` (performanceRecord.ts). **Bug fix carried in Phase 7**: `sessionService.getSessionContext` now resolves exercise display names via `listExercises` instead of leaking the exercise cuid as `exerciseName`; regression test in `sessionService.test.ts` asserts this. **UI**: `/app` landing redesigned as the Identity/Progress surface (primary program hero + current-session CTA + three stats + block strip with Review link); `/app/review/[blockId]` Review screen with AssessmentDisplay reused verbatim for both the default COMMIT snapshot and the opt-in recompute, visibly separated by a divider; `/app/programs/[id]/history` version history with on-demand structural diffs per version pair. **BLOCK_END snapshots are deferred to Phase 9+ per ARCH-041** — no new migration in Phase 7.

- **Phase 8 — AI Coach L0/L1.** `packages/ai` ships in full: `ModelProvider` interface with `AnthropicProvider` and `MockProvider`; the six-tool system (`lookup_exercises`, `simulate_program_change`, `prepare_apply_confirmation`, `note_constraint`, `note_temporary_constraint`, `query_training_history`) with `query_training_history` implemented but gated behind `L2_ENABLED = false`; the bounded context builder (`buildCoachContext`); the request loop (`runCoachTurn`) with structured-output validation, grounding check, and the shared one-retry budget (`MAX_ATTEMPTS = 2`); the system prompt with embedded JSON Schema. `packages/api` adds `routers/coach.ts` (procedures `postMessage` as a subscription, `listConversations`, `getConversation`, `openConversation`, `openConversationForBlock`), `routers/constraint.ts` (`list`, `get`, `create`, `update`, `delete`), `services/coachConversationService.ts`, `services/constraintService.ts`, and a Coach adapter block appended to `services/simulationService.ts` (`simulateAndPersistForCoach`, `loadOwnedSimulationForCoach`). `packages/db` adds `repositories/aiConversation.ts` and `repositories/constraint.ts`. `packages/config` adds `L2_ENABLED = false` as a build-time constant and re-exports `env.ts`. UI: `apps/web/src/components/coach/CoachPanel.tsx` (with the six-segment renderer and the Apply button that fires `programVersion.commitFromSimulation` on click only), the dedicated `/app/coach` route with a conversation sidebar, the `/app/constraints` CRUD route, and an embedded Coach panel on the Review screen (two-column layout at ≥64rem, stacked below). `apps/web/src/lib/trpc.tsx` adds `httpSubscriptionLink` for the `coach.postMessage` subscription. **The confirmation boundary holds structurally**: `packages/ai` has no import path to `@training/api` (boundary test enforced, and every source-file comment referencing the API package was rephrased to keep the substring scan clean); `CoachToolDeps` has exactly six methods and none is commit-shaped; the phase-file's network-inspection Playwright spec asserts zero `commitFromSimulation` requests before the Apply click and exactly one after.

## Current architecture

Phase 6 additions now in effect: ARCH-039 (commit-triggered `TrainingBlock` lifecycle; all three lifecycle triggers — `activateVersion`, `commitFromMutation`, `archiveMyProgram` — apply the same `COMPLETED` / `ABANDONED` resolution rule, and every trigger runs its reads inside the transaction that performs its writes); ARCH-040 (Phase 6 error-code semantics — ownership/existence failures are `NOT_FOUND`; state failures on authorized, present entities are `PRECONDITION_FAILED`).

Phase 7 additions now in effect: ARCH-041 (BLOCK_END snapshot writing deferred to Phase 9+; Review's default view reads the COMMIT snapshot only). The `commitFromMutation` two-call-site invariant (invariant 2) is unchanged — Phase 7 added zero new write paths. The `packages/ai` boundary (ARCH-011) is unchanged — Phase 7 did not touch that package. `packages/domain` still has zero Prisma/HTTP/UI imports (verified by grep) — Phase 7's only domain-adjacent addition is `diffVersions` in `packages/api`, which reuses the existing pure `diffStructures`. The `errorFormatter` allow-list is unchanged — Phase 7 added no application-level error classes.

Phase 8 additions now in effect: ARCH-042 (grounding failures → bounded regeneration then structured partial with `grounding_warning`); ARCH-043 (`AIMessageSegment` is a discriminated union; the model's output schema is a strict subset); ARCH-044 (two Coach procedures beyond the phase file's list). The `packages/ai` boundary (ARCH-011) holds structurally: the package has no import of `@training/api`, no reference to the `commitFrom` substring in any source file, and `CoachToolDeps` has exactly six methods, none of which can commit. `commitFromMutation`'s two call sites are unchanged — Phase 8 added zero new write paths to program structure. The `errorFormatter` allow-list is unchanged — Phase 8 added no application-level error classes (grounding failures are handled conversationally per ARCH-042, never thrown to the client).

## Project conventions

- **Review's default view reads the COMMIT snapshot, never a live recompute** (ARCH-015). `reviewService.getReview` filters defensively on `snapshot.reason === "COMMIT"`; if a future phase writes a non-COMMIT snapshot that becomes the latest for a version, the service throws `PRECONDITION_FAILED` with a clear message rather than silently rendering the wrong snapshot. Fix the read (add a `reason` argument to `findLatestAssessmentSnapshotForVersion`) before changing the default.
- **`findLatestAssessmentSnapshotForVersion` takes one argument today** (no `reason` filter). Its docstring says a future variant can take one. When Phase 9 wires BLOCK_END snapshots, that argument is the first thing to add.
- **`session.getCurrentSession` is read-only; `session.getOrCreateNext` is the mutating path.** The landing screen calls the former via `getIdentitySummary`; `/train`'s server action calls the latter. Do not conflate the names in a new call site.
- **`program.getIdentitySummary` is a single aggregation read** so the landing page renders in one round trip. It is a thin forwarder on `programService`; the logic lives in `identityService.ts`. If a future phase needs additional landing-screen data, extend `identityService`, not a new fan-out of procedures.
- **`programVersion.diff` is computed on demand; never stored.** It reuses `diffStructures` from `packages/domain`. Same-Program check → `BAD_REQUEST`; ownership → `NOT_FOUND` per ARCH-040.
- **Playwright `webServer` config is unchanged.** The two Phase 7 E2E specs (`landing-dashboard.spec.ts`, `review.spec.ts`) follow `training.spec.ts`'s pattern.
- **Client-side types for review data**: the RSC converts all `Date` fields to ISO strings and passes JSON-typed `unknown` for `AssessmentResult` / `FitScoreResult` (which are cast inside `ReviewClient` for `AssessmentDisplay`). Same `Client*` discipline as `ClientDraft` / `ClientSessionContext`.
- **The Coach's apply path is client-only.** `packages/ai` has no import path to the program-commit function; the router wires `simulateAndPersistForCoach` (a thin adapter in `simulationService.ts`) into `CoachToolDeps`, and the apply is a client-side call to `programVersion.commitFromSimulation` fired by a click on the Apply button in `CoachPanel.tsx`. Any future PR that gives `packages/ai` a new import toward a mutating function requires explicit documented justification and a new `docs/decisions/` entry — not a routine code review approval.
- **`CoachToolDeps` has exactly six methods and the coach-boundary test asserts the list.** Adding a seventh is a deliberate change that must update `packages/ai/src/__tests__/confirmation-boundary.test.ts`'s key-set assertion. If a seventh method can mutate program structure, that is the ARCH-011 violation the assertion exists to catch.
- **The `boundary.test.ts` substring scan is coarse on purpose.** It matches `commitFrom` in any source file under `packages/ai/src/**`, including comments. A comment that names the forbidden substring must be rephrased — never weaken the scan. An AST-based replacement is deferred (flagged at close-out); the substring check has caught every real violation so far.
- **`L2_ENABLED` is a build-time constant in `packages/config`, threaded as an argument into `packages/ai`.** Never import it from `packages/ai` directly. Flipping it requires a code change and a fresh deploy — that friction is deliberate.
- **The Coach panel wraps itself in `TRPCProvider`.** Two providers per page (`ReviewClient`'s and `CoachPanel`'s) share the module-level `browserQueryClient` singleton in `trpc.tsx`, so the react-query cache is not duplicated. Each has its own tRPC client link chain. `splitLink` routes `op.type === 'subscription'` through `httpSubscriptionLink` and everything else through `httpBatchLink`.
- **`coach.postMessage` is a subscription; the orchestrator emits `segment` chunks then exactly one terminal `final` or `error` chunk.** No `delta` chunks — the final turn's text is JSON, and streaming it token-by-token has no client-side use. The `delta` variant of `CoachStreamChunk` is reserved for a future where the final turn can be meaningfully streamed.
- **`ClientCoachMessage` / `ClientAIMessageSegment` are hand-mirrored in `apps/web/src/types/coach.ts`.** Do not import from `@training/ai` in a client component — it pulls `@anthropic-ai/sdk`, `@training/db`, and zod into the client bundle graph. The mirror is the `Client*` convention (learning 18); drift surfaces at build time in the exhaustive `SegmentRenderer`.
- **Temporary constraints are conversation-scoped and read-only in the panel.** The `CoachPanel` renders a strip above the input from `coach.getConversation`'s `temporaryConstraints`; there is no edit or delete UI in Phase 8. The escape hatch is starting a new conversation.

## Repository structure

`packages/api` contains: `context.ts`, `trpc.ts`, `errors.ts` (four error classes, unchanged through Phase 8), `router.ts` (extended with `coach` and `constraint`), `index.ts`, `routers/` (`user.ts`, `program.ts`, `draft.ts`, `analysis.ts`, `programVersion.ts`, `exercise.ts`, `muscleGroup.ts`, `simulation.ts`, `training.ts`, `session.ts`, `performance.ts`, `observation.ts`, `review.ts`, `coach.ts` (Phase 8), `constraint.ts` (Phase 8), plus `tests/`), `schemas/` (`programStructure.ts`, `mutation.ts`), `services/` (`programService.ts`, `draftService.ts`, `programVersionService.ts`, `simulationService.ts` — extended Phase 8 with `simulateAndPersistForCoach` and `loadOwnedSimulationForCoach`, `referenceDataService.ts`, `loadOwnedProgram.ts`, `loadOwnedExecution.ts`, `trainingService.ts`, `sessionService.ts`, `performanceService.ts`, `observationService.ts`, `reviewService.ts`, `identityService.ts`, `coachConversationService.ts` (Phase 8), `constraintService.ts` (Phase 8), plus test files).

`packages/ai` (Phase 8):
packages/ai/
src/
provider/ # ModelProvider interface, AnthropicProvider, MockProvider
tools/ # six tool definitions + CoachToolDeps
context-builder.ts # buildCoachContext
orchestrator.ts # runCoachTurn — the request loop
schema.ts # modelOutputSchema (subset), aiMessageSegmentSchema, MODEL_OUTPUT_SCHEMA_JSON, parseModelOutput
grounding.ts # checkGrounding, dropOffendingAndAddWarning
system-prompt.ts # buildSystemPrompt
types.ts # AIMessageSegment, CoachStreamChunk, isWellFormedSegment
tests/ # boundary + 7 Phase-8 test files
index.ts # public barrel

text

`packages/db` (Phase 8 additions):
packages/db/src/repositories/
aiConversation.ts # Phase 8: AIConversation + AIMessage persistence
constraint.ts # Phase 8: Constraint + TemporaryConstraint persistence

text

`apps/web` (Phase 8 additions, on top of Phase 7):
apps/web/src/components/coach/ # Phase 8: CoachPanel + CSS module
apps/web/src/types/coach.ts # Phase 8: ClientAIMessageSegment mirror
apps/web/app/app/coach/ # Phase 8: dedicated Coach route
apps/web/app/app/constraints/ # Phase 8: constraints CRUD route
apps/web/e2e/coach.spec.ts # Phase 8: network-inspection boundary test + panel smoke tests

text

`apps/web/src/lib/trpc.tsx` now includes `splitLink` + `httpSubscriptionLink` for the Coach subscription.

## API version

tRPC 11, mounted at `/api/trpc/[trpc]` via `fetchRequestHandler`. Routers and procedures:

- `user.getSelf`
- `program.{create, listMine, get, rename, archive, getIdentitySummary}`
- `draft.{create, get, listForProgram, updateStructure, discard}`
- `analysis.previewAnalyze`
- `programVersion.{commitFromDraft, commitFromSimulation, get, listForProgram, diff}`
- `exercise.listAll`
- `muscleGroup.listAll`
- `simulation.simulate`
- `training.{activateVersion, getCurrentBlock}`
- `session.{getOrCreateNext, getContext, getCurrentSession, markStarted, markCompleted, markSkipped}`
- `performance.{logSet, logBatch, listForSession}`
- `observation.{create, listForBlock, listForSession}`
- `review.{get, recomputeAssessment}`
- `constraint.{list, get, create, update, delete}` — added Phase 8
- `coach.{postMessage, listConversations, getConversation, openConversation, openConversationForBlock}` — added Phase 8 (`postMessage` is a subscription; the other four are query/mutation)

## Implemented product capabilities

**Phase 7 — Review, History & Landing:** `/app` is now the Identity/Progress surface — the user's primary program (the non-archived one with an ACTIVE TrainingBlock, else the most recently created non-archived one) with its active version, a primary CTA (Continue/Start session → Start next session → Open Builder → Commit a version, in that priority order), three lifetime stats, and a block strip with a Review link. `/app/review/[blockId]` renders the persisted COMMIT-time AssessmentSnapshot via `AssessmentDisplay` (the assessment the user actually saw), the adherence summary (planned vs. completed, systematic deviations grouped by (exercise, kind) and formatted server-side), observations in chronological order, and — below an explicit visual divider — an opt-in "recompute with current thresholds" section that runs a live engine pass on click, never on mount, and warns visibly that it is not what the user trained against. `/app/programs/[id]/history` lists every committed version newest-first with its trigger (Manual commit / AI-applied) and an expandable structural diff from the previous version, computed on demand via `programVersion.diff`. No AI narrative appears on any Phase 7 surface (Final Freeze §19).

**Phase 8 — AI Coach L0/L1:** the Coach is live on two surfaces — beside the Review screen at `/app/review/[blockId]` (two-column layout at ≥64rem, stacked below) and on the dedicated `/app/coach` route (conversation sidebar + panel). The Coach explains the current analysis/assessment in plain language (L0) and proposes mutations via simulation (L1), showing Gain/Cost/Net or narrating `CANNOT_COMPUTE` honestly under the shipped unvalidated config. Every claim carries an evidence tag (`PLANNED` / `EXECUTED` / `OBSERVED` / `INTERPRETED`), rendered as a chip. The panel's Apply button is the only path from the Coach UI to a program commit; it fires `programVersion.commitFromSimulation` on click and only on click. `prepare_apply_confirmation` returns a render payload and cannot mutate. `note_constraint` and `note_temporary_constraint` writes are visible — persistent constraints on `/app/constraints` (full CRUD), temporary constraints as a read-only strip above the Coach input. `query_training_history` is implemented but excluded from the model's tool array while `L2_ENABLED = false`. No medical diagnosis (redirects to a professional), no outcome-guarantee language, no cross-user data access.

**Not implemented:** L2 (Historian) — the tool is implemented but gated. L3 (Correlator) — reserved interface name only, no code. `/app/constraints` has no TemporaryConstraint CRUD (conversation-scoped; delete by starting a new conversation).

## Unresolved decisions

Phase-1 through Phase-7 items are preserved from the previous state of this file. **Phase-8-specific items:**

- **The `packages/ai` boundary test is substring-based.** `packages/ai/src/__tests__/boundary.test.ts` scans for the literal string `commitFrom`, which is coarse — comments describing the boundary trip it. The correct long-term fix is an AST-based scan using the TypeScript compiler API that inspects actual import statements and call expressions. Deferred; the substring check has caught every real violation so far and errs toward over-blocking.
- **`simulate_program_change`'s mutation shape is validated only by the engine.** The Zod schema declares `mutation: z.unknown()` — deliberate, so the deterministic engine remains the sole authority on `MutationSpec` validity (invariant 1). If `INVALID_MUTATION` proves common in practice, tighten the schema in a bounded change.
- **The E2E network-inspection test is gated on `ANTHROPIC_API_KEY`.** It cannot run in CI without a real key. A network-mocked variant that intercepts the tRPC SSE stream would make it CI-runnable; the blocker is that tRPC v11's exact SSE frame format is version-specific, and a mock that does not match the wire shape would produce a vacuous pass. Not built in Phase 8.
- **The `stripComments` helper in `packages/api/src/services/coach-boundary.test.ts` is intentionally simple.** It handles line and block comments but not template literals containing `//` or regex literals containing `/*`. The scan target (`routers/coach.ts`) contains neither today. If a future router does, upgrade to a proper tokenizer or an AST scan.
- **`loadScopedProgramVersion` reads the COMMIT snapshot's `assessment` and `fitScore`, but recomputes nothing.** The snapshot persists the assessment, not the analysis — the `metrics` column carries the analysis that was current at commit time. GOAL-DRIFT: if the Program's `currentGoalId` has changed since the block was opened, the snapshot's assessment reflects the *old* goal while `activeGoal` in the returned context reflects the current one. Correct per ARCH-015 (the Coach explains what was shown), but a future change to goal switching should consider whether the Coach needs to narrate the difference.
- **`coach.listConversations` returns only `{ id, programId, programVersionId, createdAtISO }`.** No title — the schema has no `title` column on AIConversation. The `/app/coach` sidebar labels conversations by creation timestamp. If a later phase adds titles or derives them from the first user message, replace `formatConversationLabel` in `CoachClient.tsx`.
- **`rawToolCalls` on AIMessage is defined in the schema and written by `createAIMessage` only when the caller supplies it.** The orchestrator does not supply it in Phase 8. If the column has no DB default and a future write omits the field, that is a runtime null-constraint error; use `Prisma.JsonNull` rather than the omit-key pattern in that case.
- **The `packages/config/package.json` cleanup is outstanding.** The file currently declares a self-dependency (`@training/config` on itself) and three upward deps (`@training/ai`, `@training/db`, `@training/domain`) that are wrong layering. The correct `dependencies` block is `{ "zod": "^3.23.8" }` if `env.ts` uses zod, `{}` otherwise. Not blocking any Phase 8 functionality; worth fixing when next in the file.
- **No test covers `createdByConversationId` threading on `simulateAndPersist`.** The optional fourth arg distinguishes Coach-originated simulations from UI-originated ones. A one-test addition to `packages/api/src/services/simulation.test.ts` would close the gap.

## Test status

- **Vitest** (all passing locally and in CI):
  - `packages/config` — 1 file, 3 tests
  - `packages/ai` — **8 files, 61 tests** (Phase 8 created the package's real suite: `boundary.test.ts` — 2, `confirmation-boundary.test.ts` — 5, `failure-degradation.test.ts` — 5, `grounding.test.ts` — 14, `simulation-consistency.test.ts` — 5, `structured-output.test.ts` — 20, `tool-authorization.test.ts` — 9, plus the pre-existing `index.test.ts` — 1)
  - `packages/db` — 4 files, 9 tests (unchanged by Phase 8; the two new repositories are exercised indirectly)
  - `packages/api` — **12 files, 67 tests** (Phase 8 added `services/coach-boundary.test.ts` — 3 tests)
  - `packages/domain` — 24 files, 179 tests (unchanged)
  - **Total Vitest**: **49 files, 319 tests**
- **Playwright** (all passing where runnable):
  - `e2e/landing.spec.ts` — Phase 0
  - `e2e/builder.spec.ts` — Phase 4
  - `e2e/builder-simulate.spec.ts` — Phase 5
  - `e2e/training.spec.ts` — Phase 6
  - `e2e/landing-dashboard.spec.ts` — Phase 7
  - `e2e/review.spec.ts` — Phase 7
  - **`e2e/coach.spec.ts` — Phase 8** (two smoke tests, both passing; one network-inspection test gated on `ANTHROPIC_API_KEY`, skipped in CI without a key)
- `pnpm turbo run lint typecheck` → clean
- `pnpm turbo run test` → all packages pass

## Next phase

Phase 9 — Validated thresholds & BLOCK_END snapshots. See `docs/phases/phase-09-*.md`.

**Cross-references for Phase 9:**
- **BLOCK_END snapshots are the deferred work from ARCH-041.** The schema change (`AssessmentSnapshot.trainingBlockId String?`) and the write at block close are the two pieces. The read side (`findLatestAssessmentSnapshotForVersion`) currently takes one argument; adding a `reason` filter for the BLOCK_END variant is the first thing to change (flagged in Phase 7's conventions).
- **The Coach's context builder reads the COMMIT snapshot only.** If Phase 9 ships validated thresholds, consider whether the Coach should offer a live recompute alongside the snapshot assessment, mirroring `review.recomputeAssessment`'s opt-in pattern. Not a Phase 9 requirement; a Phase 9+ candidate.
- **`reviewService.recomputeAssessment` uses the current config.** At MVP that means an unvalidated assessment. A future phase that ships validated thresholds may want to auto-fetch or cache the live pass rather than only offering it as opt-in.
- **The `loadGoalProfileConfigForGoal` three-hop pattern is inlined in four places** (programVersionService, analysis, simulationService, reviewService). Extracting a shared helper and migrating all four sites remains an outstanding cleanup candidate.
- **The `packages/config/package.json` cleanup is outstanding** (see Unresolved decisions).
- **The AST-based boundary test upgrade is deferred** (see Unresolved decisions).
PROJECT_STATE_EOF

echo "PROJECT_STATE.md rewritten. Lines:"
wc -l docs/PROJECT_STATE.md