cd /Users/arpan/Documents/code/training-platform

cat > docs/PROJECT_STATE.md << 'PROJECT_STATE_EOF'
## Current phase

**Phase 10 is complete.** 10b (Block Report) and 10c (anticipation cues) shipped; 10a (single-recipient sharing) was explicitly deferred as not cheap. The MVP was launch-ready per Phase 9; Phase 10 added two SHOULD-SHIP-IF-CHEAP extensions and nothing load-bearing.

**There is no Phase 11.** Per `17-roadmap-overview.md`, further work (AI L2, a second Goal profile, public sharing, a second sport, trainer tooling) unlocks on evidence — North-star metric, retained users completing ≥1 TrainingBlock, unprompted share-initiation — not on a calendar. This roadmap deliberately stops here.

**Cross-references for whatever comes next:**
- **ARCH-041 addendum** attached (BLOCK_END still deferred; new target is a future phase that actually requires it).
- **ARCH-017 addendum** attached (10a deferred; `ProgramShare` unbuilt).
- **Invariant 11 stands unqualified** — Phase 10 did not widen any read path.
- **`commitFromMutation`'s two call sites** (`commitFromDraft`, `commitFromSimulation`) are still the complete write-path surface. Phase 10 added no third.
- **The `packages/ai` boundary test** continues to enforce ARCH-011.
- **Register:** 50 entries, next free ID is **ARCH-051**. Phase 10 added no new entry.

## Completed phases

- **Phase 0 — Foundation.** Monorepo (`pnpm@9.12.0` + Turborepo), five `packages/*` stubs, `apps/web` on Next.js (App Router), Auth.js v5 Credentials + JWT (no adapter), `user.getSelf`, landing + signup + login + empty authenticated dashboard, CI (GitHub Actions), Sentry (client/server/edge), ESLint + Prettier, 5 Vitest tests + 1 Playwright E2E, deployed to Vercel production + PR previews.
- **Phase 1 — Domain Model & Database.** Full schema applied as migration `0002_domain_model` (all models from `04-database-schema.md` except `ProgramShare`, per ARCH-017; `User` reconciled with Phase 0 per ARCH-024). Canonical seed: 18 `MuscleGroup` rows, 43 `Exercise` rows covering every `MovementPattern`, one `GoalProfileDefinition` (`HYPERTROPHY`, `validated: false`, `thresholds: {}`). Five repositories (`program`, `programVersion`, `draft`, `exercise`, `goal`). Program CRUD UI under `/app/programs/`. Migration applied to production post-merge.
- **Phase 2 — Deterministic Analysis Engine.** `packages/domain/src/analysis/` ships `computeAnalysis()` plus five axis calculators (`volume`, `frequency`, `exerciseSelectionBalance`, `progressionSoundness`, `recoveryCost`), a discriminated `AxisStatus` (`BAND` | `UNVALIDATED`) per ARCH-028. Goal-profile registry surface with a `HYPERTROPHY` config (all bounds `null`, `validated: false`). Zero Prisma/HTTP/UI imports in `packages/domain`.
- **Phase 3 — Assessment Engine & Fit Score.** `computeAssessment()` (leverage roll-up → classification → actions), `computeFitScore()` (rule-based ordinal projection, no numeric intermediate, per ARCH-030). `GoalProfileConfig` extended with `severityMap`, `severityWeightTable`, `materialitySeverityThreshold`, `fitScoreProjection` (ARCH-029, ARCH-031). `assertNoUnvalidatedProfilesInProduction` launch-gate pure function implemented with tests. `AssessmentResult` / `FitScoreResult` discriminated unions.
- **Phase 4 — Builder, Live Analyze & Commit.** `MutationSpec` (7-op discriminated union) + `applyMutation()` — the single mutation function (invariant 2). `commitFromMutation` — the only function that writes a `ProgramVersion`, with exactly two call sites (`commitFromDraft`, `commitFromSimulation` in Phase 5). Builder UI at `/app/programs/[id]/build`. `AssessmentDisplay` component. `errorFormatter` allow-list extended (ARCH-033).
- **Phase 5 — Simulation, Mutation Invariant & Apply.** `simulate()` + `SimulationResult` discriminated union (`COMPUTED` | `CANNOT_COMPUTE` | `INVALID_MUTATION`, ARCH-036). `diffAssessments()` + `diffStructures()` (ARCH-037). `simulation.simulate` (persists a `Simulation` row); `programVersion.commitFromSimulation` (the second and last call site of `commitFromMutation`). `SimulateChangePanel` + `GainCostNetDisplay`.
- **Phase 6 — Training Execution & Logging.** TrainingBlock lifecycle (ARCH-039: commit-triggered close + open; all three triggers — `activateVersion`, `commitFromMutation`, `archiveMyProgram` — apply the same COMPLETED/ABANDONED resolution and read inside their transaction). Session lazy generation, PerformanceRecord logging (deviation honesty enforced by NOT validating), Observation capture. Four repositories (`trainingBlock`, `session`, `performanceRecord`, `observation`) plus their services. `/train` UI. ARCH-040 error-code semantics.
- **Phase 7 — Review, Revision Loop & History.** Read-only aggregation over Phase 6 execution data plus the persisted COMMIT-time AssessmentSnapshot (ARCH-015). `reviewService.getReview()` (default view — COMMIT snapshot) and `recomputeAssessment()` (opt-in, persists nothing). `identityService.getMyIdentitySummary()` — the `/app` landing's single aggregation read. `programVersion.diff()` — structural diff via `diffStructures` (ARCH-037). New tRPC procedures: `review.{get, recomputeAssessment}`, `program.getIdentitySummary`, `session.getCurrentSession`, `programVersion.diff`. **Bug fix:** `sessionService.getSessionContext` resolves exercise display names via `listExercises` instead of leaking cuids; regression test in `sessionService.test.ts`. UI: `/app` redesigned as Identity/Progress surface; `/app/review/[blockId]` with `AssessmentDisplay` reused for both the COMMIT snapshot and the opt-in recompute; `/app/programs/[id]/history` version history with on-demand diffs. **BLOCK_END snapshots deferred past Phase 9 per ARCH-041.** No migration.
- **Phase 8 — AI Coach L0/L1.** `packages/ai` ships in full: `ModelProvider` interface + `AnthropicProvider` + `MockProvider`; six tools (`lookup_exercises`, `simulate_program_change`, `prepare_apply_confirmation`, `note_constraint`, `note_temporary_constraint`, `query_training_history` — the last gated behind `L2_ENABLED = false`); bounded `buildCoachContext`; `runCoachTurn` with structured-output validation, grounding check, and a shared one-retry budget (ARCH-042); a system prompt with embedded JSON Schema; `AIMessageSegment` as a six-variant discriminated union (ARCH-043). `packages/api` adds `routers/coach.ts` (`postMessage` subscription + four other procedures including `openConversation`, `openConversationForBlock` per ARCH-044), `routers/constraint.ts`, `services/coachConversationService.ts`, `services/constraintService.ts`. `packages/db` adds `repositories/aiConversation.ts` and `repositories/constraint.ts`. UI: `CoachPanel.tsx` (six-segment renderer; Apply button fires `commitFromSimulation` on click only), `/app/coach` (conversation sidebar), `/app/constraints` (CRUD), embedded Coach on Review. `trpc.tsx` adds `httpSubscriptionLink`. **Confirmation boundary holds structurally:** no `packages/ai` import of `@training/api`; `CoachToolDeps` has exactly six methods, none commit-shaped; the network-inspection Playwright spec asserts zero `commitFromSimulation` calls before the Apply click.
- **Phase 9 — Production Hardening & Launch Readiness.** See `PROJECT_STATE.md`'s "Phase 9 close-out" and `docs/LAUNCH_CHECKLIST.md`. Ships: edge rate limiting via Upstash Redis (ARCH-048) with route-aware policy (coach 10/min, other tRPC 120/min, `/api/auth/*` 20/min; fail-open when unconfigured); authorization audit across every owner-scoped procedure (ARCH-049 — found and fixed one gap in `coach.openConversation`); launch gate `apps/web/scripts/launch-gate.ts` chained into `apps/web`'s build script **and** a standalone CI step, with `LAUNCH_OVERRIDE_TOKEN` bypass (constant-time compare, structural validation, whitespace-trimmed) and a manual rehearsal workflow (`.github/workflows/launch-gate-rehearsal.yml`); `ProvisionalBanner.tsx` mounted inside `AssessmentDisplay.tsx` (ARCH-046) plus a CI grep (`check-provisional-banner.sh`) allow-listing the two component files; full Playwright regression suite (`apps/web/e2e/regression.spec.ts` — continuous signup→commit→train→review→simulate→apply flow) running in CI with `MODEL_PROVIDER=mock` (ARCH-050); a11y pass via `@axe-core/playwright` on Builder / Session / Review (two contrast violations fixed); `docs/LAUNCH_CHECKLIST.md` (Vercel/Neon/Upstash/Sentry setup, token rotation, launch rehearsal, rate-limit verification, backups, a11y manual checklist, pre-launch product decisions). Also delivered as **Phase 9 pre-work:** GeminiProvider (ARCH-045) — second `ModelProvider` via `@google/genai`, selected by `MODEL_PROVIDER`; `thoughtSignature` threaded as an optional field on the generic interface; Coach auto-scoping fix (ARCH-047 — `coach.openConversation` auto-scopes to primary Program; `forceNew` bypasses get-or-create). **Bugs fixed during Phase 9:** `.gitignore` bare `build/` had silently excluded `apps/web/app/app/programs/[id]/build/` from every commit since Phase 4 (fixed to `/build/`); Playwright cold-compile contention fixed by `webServer.command: "pnpm build && pnpm start"`; `LAUNCH_OVERRIDE_TOKEN` trailing-whitespace bug fixed by trimming before validation. **No new product surface. No migration.** `docs/DECISIONS_FULL.md` deleted (was a duplicate register).
## Current architecture

Phase 6 additions now in effect: ARCH-039 (commit-triggered `TrainingBlock` lifecycle; all three lifecycle triggers — `activateVersion`, `commitFromMutation`, `archiveMyProgram` — apply the same `COMPLETED` / `ABANDONED` resolution rule, and every trigger runs its reads inside the transaction that performs its writes); ARCH-040 (Phase 6 error-code semantics — ownership/existence failures are `NOT_FOUND`; state failures on authorized, present entities are `PRECONDITION_FAILED`).

Phase 7 additions now in effect: ARCH-041 (BLOCK_END snapshot writing deferred to Phase 9+; Review's default view reads the COMMIT snapshot only). The `commitFromMutation` two-call-site invariant (invariant 2) is unchanged — Phase 7 added zero new write paths. The `packages/ai` boundary (ARCH-011) is unchanged — Phase 7 did not touch that package. `packages/domain` still has zero Prisma/HTTP/UI imports (verified by grep) — Phase 7's only domain-adjacent addition is `diffVersions` in `packages/api`, which reuses the existing pure `diffStructures`. The `errorFormatter` allow-list is unchanged — Phase 7 added no application-level error classes.

Phase 8 additions now in effect: ARCH-042 (grounding failures → bounded regeneration then structured partial with `grounding_warning`); ARCH-043 (`AIMessageSegment` is a discriminated union; the model's output schema is a strict subset); ARCH-044 (two Coach procedures beyond the phase file's list). The `packages/ai` boundary (ARCH-011) holds structurally: the package has no import of `@training/api`, no reference to the `commitFrom` substring in any source file, and `CoachToolDeps` has exactly six methods, none of which can commit. `commitFromMutation`'s two call sites are unchanged — Phase 8 added zero new write paths to program structure. The `errorFormatter` allow-list is unchanged — Phase 8 added no application-level error classes (grounding failures are handled conversationally per ARCH-042, never thrown to the client).

**Phase 9 pre-work (GeminiProvider + Coach auto-scoping):** ARCH-045 (second ModelProvider via `@google/genai`, selected by `MODEL_PROVIDER`, with Gemini 3.x `functionCall.id` and `thoughtSignature` echoes threaded through the generic `ModelProvider` interface as optional fields), ARCH-047 (`coach.openConversation` auto-scopes to the user's primary Program; `forceNew` bypasses get-or-create). The `packages/ai` boundary (ARCH-011) still holds — no new commit-shaped path. `commitFromMutation`'s two call sites are unchanged. The `errorFormatter` allow-list is unchanged. Client-side `coach.module.css` gained a `color: var(--fg, #111)` override on `.conversationItem` to counteract `globals.css`'s `button { color: #fff }` cascade.

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
provider/ # ModelProvider interface, AnthropicProvider, GeminiProvider, MockProvider, createProvider factory
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
apps/web/app/app/coach/coach.module.css # Phase 8: Coach route styles (conversation sidebar etc.)
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

**Phase 9 pre-work items (deferred candidates, not Phase 9 scope):**

- **Production `GEMINI_MODEL` default when Anthropic billing is enabled.** Currently `gemini-3.8-flash`. When Anthropic billing is turned on and `MODEL_PROVIDER=anthropic` becomes the production default, decide whether Gemini remains a fallback or is retired. Config-only change.
- **Coach phrasing of CANNOT_COMPUTE.** Model says "temporarily unavailable," which implies a transient failure. The state is structural — unvalidated thresholds. System-prompt refinement only; moot once validated thresholds ship.

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

**There is no Phase 11.** Phase 10 was the last phase in the roadmap. Per `17-roadmap-overview.md`, anything beyond it — a second Goal profile, AI L2, public sharing, a second sport, trainer tooling — unlocks on evidence from real usage, not on a calendar: the North-star metric, retained users completing ≥1 TrainingBlock, unprompted share-initiation.

**When that evidence exists, the next phase is proposed fresh**, not picked from a backlog. The `HANDOFF_TEMPLATE.md` structure applies: a new phase file is written against the current `PROJECT_STATE.md`, and its scope is justified by the evidence, not by prior roadmap intent.

**Register:** 50 entries; next free ID is **ARCH-051**.


echo "PROJECT_STATE.md rewritten. Lines:"
wc -l docs/PROJECT_STATE.md