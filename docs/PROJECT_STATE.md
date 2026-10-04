# PROJECT_STATE.md

**This file must be updated at the end of every phase, by the AI session that implemented that phase, before that session ends.** A new AI conversation should be able to understand the current implementation state entirely from this file plus `DECISIONS.md` and the relevant `phases/phase-NN-*.md` file — without reading any previous conversation.

---

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
- **Phase 10 — Optional Extensions (10b + 10c).** Two of the three SHOULD-SHIP-IF-CHEAP sub-phases shipped; 10a (single-recipient sharing) deferred. **10b — Block Report:** `packages/api/src/services/blockReportService.ts` (read-only synthesis over COMMIT AssessmentSnapshot + PerformanceRecord + Observation; `BlockReportResult` discriminated union `ACTIVE | REPORT`; `buildNarrative` templated, no AI); `routers/blockReport.ts` (`get`, owner-scoped, `NOT_FOUND` for non-owners per ARCH-040); route `/app/blocks/[blockId]/report` (RSC + `BlockReportClient` + CSS module + in-progress fallback page); "See the Block Report" link from Review, gated on `!isPartial`. **10c — anticipation cues:** `packages/api/src/services/anticipationCue.ts` (`buildAnticipationCue`; null `plannedLengthWeeks` → fact-only, non-null → projection, ≤0 remaining → "last session"; no streaks, login counts, or loss-aversion framing); `IdentitySummaryCurrentBlock.anticipationCue` threaded through `identityService`; rendered on `/app`'s `BlockStrip` and on the `/train` card for the Program with the ACTIVE block. **No migration. No new schema. No new write path.** One word added to `reviewService.ts` (`export` on `computeAdherence`). No new `packages/ai` import. No new `commitFromMutation` call site.

## Current architecture

Phase 6 additions now in effect: ARCH-039 (commit-triggered `TrainingBlock` lifecycle; all three lifecycle triggers — `activateVersion`, `commitFromMutation`, `archiveMyProgram` — apply the same `COMPLETED` / `ABANDONED` resolution rule, and every trigger runs its reads inside the transaction that performs its writes); ARCH-040 (Phase 6 error-code semantics — ownership/existence failures are `NOT_FOUND`; state failures on authorized, present entities are `PRECONDITION_FAILED`).

Phase 7 additions now in effect: ARCH-041 (BLOCK_END snapshot writing deferred past Phase 9; Review's default view reads the COMMIT snapshot only). The `commitFromMutation` two-call-site invariant (invariant 2) is unchanged — Phase 7 added zero new write paths. The `packages/ai` boundary (ARCH-011) is unchanged — Phase 7 did not touch that package. `packages/domain` still has zero Prisma/HTTP/UI imports (verified by grep) — Phase 7's only domain-adjacent addition is `diffVersions` in `packages/api`, which reuses the existing pure `diffStructures`. The `errorFormatter` allow-list is unchanged — Phase 7 added no application-level error classes.

Phase 8 additions now in effect: ARCH-042 (grounding failures → bounded regeneration then structured partial with `grounding_warning`); ARCH-043 (`AIMessageSegment` is a discriminated union; the model's output schema is a strict subset); ARCH-044 (two Coach procedures beyond the phase file's list). The `packages/ai` boundary (ARCH-011) holds structurally: the package has no import of `@training/api`, no reference to the `commitFrom` substring in any source file, and `CoachToolDeps` has exactly six methods, none of which can commit. `commitFromMutation`'s two call sites are unchanged — Phase 8 added zero new write paths to program structure. The `errorFormatter` allow-list is unchanged — Phase 8 added no application-level error classes (grounding failures are handled conversationally per ARCH-042, never thrown to the client).

Phase 9 additions now in effect: ARCH-045 (GeminiProvider as a second `ModelProvider` via `@google/genai`, selected by `MODEL_PROVIDER`; `thoughtSignature` as an optional field on the generic interface); ARCH-046 (launch override + provisional banner); ARCH-047 (Coach auto-scoping); ARCH-048 (Upstash rate limiting); ARCH-049 (authorization audit); ARCH-050 (E2E in CI). Client-side `coach.module.css` gained a `color: var(--fg, #111)` override on `.conversationItem` to counteract `globals.css`'s `button { color: #fff }` cascade. `apps/web/middleware.ts` runs the rate limiter.

Phase 10 additions now in effect: the Block Report reads the COMMIT snapshot only, with the same defensive `reason === "COMMIT"` post-filter as `reviewService.getReview` — no `reason` argument was added to `findLatestAssessmentSnapshotForVersion` (that is a repository-layer change for whatever phase actually wires BLOCK_END). The prior-block comparison unwraps the `AssessmentResult` discriminated union and treats any non-`VALIDATED` branch as "could not be compared" — at MVP every snapshot is `UNVALIDATED` (ARCH-032), so that branch is always taken today; it becomes meaningful only when validated thresholds ship. `computeAdherence` is now exported from `reviewService` (one word) so the Block Report shares the exact systematic-deviation analysis as Review — two divergent implementations of the same aggregation would be a drift bug. `IdentitySummaryCurrentBlock` carries a new `anticipationCue` field, derived in `identityService` from `TrainingBlock.plannedLengthWeeks`, the active version's `workoutDays.length`, and `countCompletedSessionsInBlock`. `commitFromMutation`'s two call sites are unchanged; `packages/ai`'s import surface is unchanged; the `errorFormatter` allow-list is unchanged. No migration. No new schema.

## Project conventions

- **Review's default view reads the COMMIT snapshot, never a live recompute** (ARCH-015). `reviewService.getReview` filters defensively on `snapshot.reason === "COMMIT"`; if a future phase writes a non-COMMIT snapshot that becomes the latest for a version, the service throws `PRECONDITION_FAILED` with a clear message rather than silently rendering the wrong snapshot. Fix the read (add a `reason` argument to `findLatestAssessmentSnapshotForVersion`) before changing the default.
- **`findLatestAssessmentSnapshotForVersion` takes one argument today** (no `reason` filter). Its docstring says a future variant can take one. When a future phase wires BLOCK_END snapshots, that argument is the first thing to add.
- **`session.getCurrentSession` is read-only; `session.getOrCreateNext` is the mutating path.** The landing screen calls the former via `getIdentitySummary`; `/train`'s server action calls the latter. Do not conflate the names in a new call site.
- **`program.getIdentitySummary` is a single aggregation read** so the landing page renders in one round trip. It is a thin forwarder on `programService`; the logic lives in `identityService.ts`. If a future phase needs additional landing-screen data, extend `identityService`, not a new fan-out of procedures.
- **`programVersion.diff` is computed on demand; never stored.** It reuses `diffStructures` from `packages/domain`. Same-Program check → `BAD_REQUEST`; ownership → `NOT_FOUND` per ARCH-040.
- **Client-side types for review data**: the RSC converts all `Date` fields to ISO strings and passes JSON-typed `unknown` for `AssessmentResult` / `FitScoreResult` (which are cast inside `ReviewClient` for `AssessmentDisplay`). Same `Client*` discipline as `ClientDraft` / `ClientSessionContext`.
- **The Coach's apply path is client-only.** `packages/ai` has no import path to the program-commit function; the router wires `simulateAndPersistForCoach` (a thin adapter in `simulationService.ts`) into `CoachToolDeps`, and the apply is a client-side call to `programVersion.commitFromSimulation` fired by a click on the Apply button in `CoachPanel.tsx`. Any future PR that gives `packages/ai` a new import toward a mutating function requires explicit documented justification and a new `docs/decisions/` entry — not a routine code review approval.
- **`CoachToolDeps` has exactly six methods and the coach-boundary test asserts the list.** Adding a seventh is a deliberate change that must update `packages/ai/src/__tests__/confirmation-boundary.test.ts`'s key-set assertion. If a seventh method can mutate program structure, that is the ARCH-011 violation the assertion exists to catch.
- **The `boundary.test.ts` substring scan is coarse on purpose.** It matches `commitFrom` in any source file under `packages/ai/src/**`, including comments. A comment that names the forbidden substring must be rephrased — never weaken the scan. An AST-based replacement is deferred; the substring check has caught every real violation so far.
- **`L2_ENABLED` is a build-time constant in `packages/config`, threaded as an argument into `packages/ai`.** Never import it from `packages/ai` directly. Flipping it requires a code change and a fresh deploy — that friction is deliberate.
- **The Coach panel wraps itself in `TRPCProvider`.** Two providers per page (`ReviewClient`'s and `CoachPanel`'s) share the module-level `browserQueryClient` singleton in `trpc.tsx`, so the react-query cache is not duplicated. Each has its own tRPC client link chain. `splitLink` routes `op.type === 'subscription'` through `httpSubscriptionLink` and everything else through `httpBatchLink`.
- **`coach.postMessage` is a subscription; the orchestrator emits `segment` chunks then exactly one terminal `final` or `error` chunk.** No `delta` chunks — the final turn's text is JSON, and streaming it token-by-token has no client-side use. The `delta` variant of `CoachStreamChunk` is reserved for a future where the final turn can be meaningfully streamed.
- **`ClientCoachMessage` / `ClientAIMessageSegment` are hand-mirrored in `apps/web/src/types/coach.ts`.** Do not import from `@training/ai` in a client component — it pulls `@anthropic-ai/sdk`, `@training/db`, and zod into the client bundle graph. The mirror is the `Client*` convention; drift surfaces at build time in the exhaustive `SegmentRenderer`.
- **Temporary constraints are conversation-scoped and read-only in the panel.** The `CoachPanel` renders a strip above the input from `coach.getConversation`'s `temporaryConstraints`; there is no edit or delete UI. The escape hatch is starting a new conversation.
- **Node version resolution in zsh.** `nvm use 20` must be followed by `hash -r` in zsh. zsh caches the resolved path for `pnpm` (and other binaries); after `nvm use 20`, `which pnpm` may still return the v24 path from the hash table. `hash -r` clears it. If pnpm still resolves wrong, reinstall under v20: `"$(dirname "$(which node)")/npm" install -g pnpm@latest`. Symptom: `.nvmrc` says 20, `node -v` says 20, but `which pnpm` shows a v24 path — and Vitest worker crashes follow. Discovered Phase 8 → Phase 9 handoff.
- **File-overwrite pattern in AI-generated edits.** When an AI session emits "here is the updated file," verify with `git diff` before committing. Two incidents in Phase 8 (invariant.test.ts replaced with a copy of identityService.ts; coach.ts received a duplicate import block) — both from ambiguous "replace this block" instructions. Prefer "here is the complete file" over patches, and always `git diff` the file after applying.
- **Signature-optional fields on provider abstractions.** Provider-specific protocol fields (e.g. Gemini's `thoughtSignature`, Anthropic's cache breakpoints) go on the generic `ModelProvider` interface as **optional** fields, not as provider-specific types. `ToolCall.thoughtSignature?: string` and `ModelContentBlock['tool_use'].thoughtSignature?: string` are the correct home — Anthropic and Mock simply ignore them. A future provider with its own protocol quirk follows the same pattern: add the field as optional, thread it through the orchestrator's spread, and let each provider populate or ignore. Do not special-case a provider in the orchestrator.
- **`AssessmentDisplay` is a client component.** It mounts `useProvisionalBanner()` (a hook), so any server component importing it goes through a client boundary. All current consumers are client components. If a future phase needs a server-rendered assessment (PDF export, email render, static preview), migrate the hook to a plain `isProvisionalBannerEnabled()` function reading `HYPERTROPHY_CONFIG.validated` — a bounded change.
- **`apps/web` has no Vitest setup.** Playwright-only. Two pure functions in the rate-limiting middleware — `classifyRequest` and `getClientIp` — are unit-testable if `apps/web` ever gains web-layer logic worth testing. Not justified at Phase 9: the load-test script exercises the middleware end-to-end, which is stronger evidence than isolated unit tests.
- **The Block Report's prior-block comparison currently prints developer-shaped identifiers** (`VOLUME:chest`, `<axisType>:<scopeKey>`). This is acceptable at MVP because the comparison branch never executes while every snapshot is `UNVALIDATED` (ARCH-032). A future phase that ships `VALIDATED` snapshots should add a friendly display-name lookup — likely in `goal-profiles` or a small table in `blockReportService` — before the comparison becomes visible to users.
- **`computeAdherence` is exported from `reviewService` for the Block Report's use.** Do not fork it. If the adherence aggregation changes, both Review and Block Report change together; that is the point.
- **`countCompletedSessionsInBlock(blockId)` is the canonical COMPLETED-only session count.** Same semantics as the TrainingBlock lifecycle resolution rule (SKIPPED and IN_PROGRESS do not count). `countCompletedSessionsForProgram(programId)` is the lifetime-scope equivalent.
- **No `blockReport` describe in `authorization.test.ts` should be added without also adding it to `blockReport.test.ts`.** Both exist; the local one exercises the closed-block path, the shared one exercises the cross-user case.

## Repository structure

`packages/api` contains: `context.ts`, `trpc.ts`, `errors.ts` (four error classes, unchanged through Phase 10), `router.ts` (extended with `coach`, `constraint`, `blockReport`), `index.ts`, `routers/` (`user.ts`, `program.ts`, `draft.ts`, `analysis.ts`, `programVersion.ts`, `exercise.ts`, `muscleGroup.ts`, `simulation.ts`, `training.ts`, `session.ts`, `performance.ts`, `observation.ts`, `review.ts`, `coach.ts`, `constraint.ts`, `blockReport.ts` (Phase 10), plus `tests/`), `schemas/` (`programStructure.ts`, `mutation.ts`), `services/` (`programService.ts`, `draftService.ts`, `programVersionService.ts`, `simulationService.ts`, `referenceDataService.ts`, `loadOwnedProgram.ts`, `loadOwnedExecution.ts`, `trainingService.ts`, `sessionService.ts`, `performanceService.ts`, `observationService.ts`, `reviewService.ts` (with `export` on `computeAdherence`), `identityService.ts` (with `anticipationCue`), `coachConversationService.ts`, `constraintService.ts`, `blockReportService.ts` (Phase 10), `anticipationCue.ts` (Phase 10), plus test files).

`packages/ai` (Phase 8):
```text
packages/ai/
  src/
    provider/       # ModelProvider interface, AnthropicProvider, GeminiProvider, MockProvider, createProvider factory
    tools/          # six tool definitions + CoachToolDeps
    context-builder.ts
    orchestrator.ts
    schema.ts
    grounding.ts
    system-prompt.ts
    types.ts
    __tests__/      # boundary + 7 test files
    index.ts
packages/db (Phase 8 additions):

text
packages/db/src/repositories/
  aiConversation.ts
  constraint.ts
apps/web (Phase 8 additions):

text
apps/web/src/components/coach/          # Phase 8: CoachPanel + CSS module
apps/web/src/types/coach.ts             # Phase 8: ClientAIMessageSegment mirror
apps/web/app/app/coach/                 # Phase 8: dedicated Coach route
apps/web/app/app/constraints/           # Phase 8: constraints CRUD route
apps/web/e2e/coach.spec.ts              # Phase 8: network-inspection boundary test
packages/api Phase 10 additions:

text
packages/api/src/
  services/blockReportService.ts
  services/anticipationCue.ts
  routers/blockReport.ts
  services/blockReport.test.ts
  services/anticipationCue.test.ts
apps/web Phase 10 additions:

text
apps/web/app/app/blocks/[blockId]/report/
  page.tsx
  BlockReportClient.tsx
  blockReport.module.css
## API version
tRPC 11, mounted at /api/trpc/[trpc] via fetchRequestHandler. Routers and procedures:

user.getSelf

program.{create, listMine, get, rename, archive, getIdentitySummary}

draft.{create, get, listForProgram, updateStructure, discard}

analysis.previewAnalyze

programVersion.{commitFromDraft, commitFromSimulation, get, listForProgram, diff}

exercise.listAll

muscleGroup.listAll

simulation.simulate

training.{activateVersion, getCurrentBlock}

session.{getOrCreateNext, getContext, getCurrentSession, markStarted, markCompleted, markSkipped}

performance.{logSet, logBatch, listForSession}

observation.{create, listForBlock, listForSession}

review.{get, recomputeAssessment}

constraint.{list, get, create, update, delete}

coach.{postMessage, listConversations, getConversation, openConversation, openConversationForBlock}

blockReport.get — Phase 10b

## Implemented product capabilities
Program CRUD, Builder with live Analyze, immutable versioning, deterministic Analysis + Assessment, Simulation, Training execution & logging, Review + version history + Identity/Progress landing, AI Coach L0/L1 with structural confirmation boundary, Block Report (Phase 10b), anticipation cues (Phase 10c).

Not implemented: single-recipient sharing (10a) — deferred. ProgramShare table, sharing router, and shared-scoped authorization all remain unbuilt. Invariant 11 stands unqualified. AI L2 (Historian) — query_training_history is implemented but gated behind L2_ENABLED = false. AI L3 — reserved interface name only.

## Unresolved decisions
Carried from docs/00-product-freeze-reference.md — not to be resolved by any implementation phase, only by explicit product/sports-science input:

Numeric thresholds for Volume/Frequency/Recovery Cost bands, per goal profile.

Goal weights per axis, per goal profile (all null in HYPERTROPHY_CONFIG.axisWeights today).

North-star metric measurement window.

Whether Fit Score has previously-named bands to preserve.

Recovery Cost's underlying formula.

Whether Review should default to showing the Commit-time snapshot vs. a live recompute (ARCH-015, pending product sign-off).

Phase-10-specific items:

Block Report's prior-block comparison uses raw ${axisType}:${scopeKey} identifiers. Latent, not user-visible at MVP.

readSnapshotAssessment tolerates an older payload shape this codebase has never written. Deliberately permissive, not a contract.

/app and /train anticipation cues share identity.primaryProgram.currentBlock.anticipationCue. The /train page fetches getIdentitySummary even when it only needs the program list, purely for the cue. Consider moving to a dedicated read if /train grows.

BlockStrip's plannedLengthWeeks prop and the cue both express block length. Keep them consistent in tone.

The seed does not set plannedLengthWeeks on commit, so NO_PLANNED_LENGTH is the default branch in every fixture. REMAINING and LAST_SESSION are exercised only by unit tests.

Phase-9 operational items (user-executed, no code):

Sentry alert rules (docs/LAUNCH_CHECKLIST.md §5).

Upstash Redis provisioning (§4).

Vercel staging env + Neon staging branch (§2b/§3a).

Launch-gate rehearsal (manual workflow dispatch).

Rate-limit load test.

Neon PITR decision (§10).

Evidence-table fills.

## Test status
Vitest (all passing):

packages/config — 1 file, 3 tests

packages/ai — 8 files, 61 tests

packages/db — 4 files, 9 tests

packages/api — 15 files, 120 tests

packages/domain — 24 files, 179 tests

Total Vitest: 52 files, 372 tests

Playwright (7 specs):

e2e/landing.spec.ts, builder.spec.ts, builder-simulate.spec.ts, training.spec.ts, landing-dashboard.spec.ts, review.spec.ts, coach.spec.ts (network-inspection test gated on ANTHROPIC_API_KEY)

pnpm turbo run typecheck lint test build → 20/20 successful

## Deployment status
Deployed to Vercel.

Production URL: https://training-platform-web-alpha.vercel.app

Production branch: main (auto-deploys)

Preview: automatic per PR (Vercel) with isolated Neon branch per PR

Database (production): Neon primary branch — 0002_domain_model applied; no migrations since

Database (dev): local Postgres; remote vercel-dev Neon branch in packages/db/.env.neon-dev (gitignored)

CI database: ephemeral postgres:16 container on GitHub Actions runner

Sentry: receiving events; source maps uploaded on build

Rate limiting: Upstash Redis (edge middleware)

## Next phase
There is no Phase 11. Phase 10 was the last phase in the roadmap. Per 17-roadmap-overview.md, anything beyond it — a second Goal profile, AI L2, public sharing, a second sport, trainer tooling — unlocks on evidence from real usage, not on a calendar: the North-star metric, retained users completing ≥1 TrainingBlock, unprompted share-initiation.

When that evidence exists, the next phase is proposed fresh, not picked from a backlog. The HANDOFF_TEMPLATE.md structure applies: a new phase file is written against the current PROJECT_STATE.md, and its scope is justified by the evidence, not by prior roadmap intent.

Register: 50 entries; next free ID is ARCH-051.

## Prohibited scope (standing, not phase-specific)
Do not build, in any phase, without an explicit new phase spec authorizing it: social feed, clans, likes, rankings, trainer marketplace, native steps tracking, native nutrition database, a second sport, population-level AI (L3), AI L2 before Phase 8's L2_ENABLED flag is deliberately flipped, ProgramShare/sharing logic until the deferral in ARCH-017 is lifted, any numeric scientific threshold presented as validated without a cited source, any Jev/DecisionProvider wiring into packages/ai's live orchestration path before Phase 11's trigger condition is met per 19-jev-integration-review.md — see ARCH-019.

Template note for the implementing AI: when you finish a phase, replace the relevant sections above with the real, current state — don't just append. This file describes "now," not a changelog; DECISIONS.md is where the history/rationale lives.
