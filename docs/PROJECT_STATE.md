## Current phase

**Phase A ("make it read as finished") is done on branch `phase-a-honest-surface`, awaiting review and merge.** It follows Phase 10.4 (E11, breadth-aware Fit) and Phase 10.5 (scopeKey uses `MuscleGroup.name`; hyphen-tolerant exercise search), both merged to `main` (PRs #20, #21, #22). Phase A came out of the founder walkthrough on 2026-10-21; Phase B (session/follow-along items) is explicitly **not started**.

Phase A shipped, in order:
1. **Provisional Fit band visible** on every assessment surface: "Provisional fit: DECENT — based on evidence-graded thresholds. See evidence". It is read through `provisionalFitBand()` (domain), the same projection as `computeFitScore` over the same roll-up. `computeFitScore` still returns `UNVALIDATED`. See ARCH-054.
2. **Evidence panel**: per axis it shows the tier, primary sources, what the tier means and is not, and the underlying claims. The data is `GoalProfileConfig.evidence` (new optional field), restated from the tier comments in `hypertrophy.ts`. Nothing is regraded, and `validated: false` and the launch gate are unchanged.
3. **Drafts start from the active version**: the "Start from" choice defaults to the active version, the label defaults to "Edit of vN", Enter submits, and a note says committing creates vN+1 and closes the current block (ARCH-039).
4. **Readable assessment**: labels like "Weekly volume · Chest", metrics with units ("6 hard sets / week"), a one-line "what this means" read from the config's band bounds, and Weight/Severity/Leverage behind "Details". The root-cause key is no longer shown. The banner copy is now "evidence-graded, not human-validated", with the tier span (ARCH-054).
5. **Effort (RIR) input in the Builder**, which sets `targetRpe`. New exercises default to a visible 2 RIR, in the simulate panel too. Before this, no Builder input produced effort, so every Builder-made program failed EFFORT_DEFINED.
6. **Units everywhere**: "kg per dumbbell" for dumbbell exercises (`apps/web/src/lib/loadLabels.ts`), planned weight shown in the session plan line and as the Weight placeholder, units on logged sets and on Review deviation text. Logged weights are read in the plan's unit (lb if the plan says lb, else kg); only the number is stored.
7. **Copy**: the landing page no longer says "Phase 0 shell", and the commit message no longer says "versioning UI arrives in a later phase".

**Cross-references for what comes next:**
- **Phase B is the next candidate** (founder report, 2026-10-21): day picker on `/train`, exercise swap mid-session (`PerformanceRecord.performedExerciseId`), per-exercise cues, per-exercise "tried something different" notes. The walkthrough report recommends showing the app to ~5 lifters before choosing B or C (faster building).
- **Mid-block correction semantics are deferred** (see Unresolved decisions).
- **Register:** ARCH-053 (breadth-aware Fit, E11) was backfilled in the Phase A PR; Phase 10.4 had shipped without it. Next free ID is **ARCH-055**.
- **FREQUENCY `minExposureSets` = 2.0** is a tuning question, not a bug.
- **Recovery bands** were not recalibrated after E9's weight change. Builder-made programs now state effort (2 RIR default), so they no longer sit in the "unstated, about 20% lower" regime.
- **`commitFromMutation`'s two call sites** are still the complete write-path surface. Phase A added no write path; `draft.create` already accepted `baseVersionId`.
- **Fixed in the Phase A PR:** the Sign-out button rendered as an empty box (white text on a transparent background); now `color: var(--fg)`.
- **Not fixed, seen in the walkthrough:** there is no top nav inside Programs/Builder; the Coach and Constraints pages aren't in the nav; favicon 404; Review's adherence reads "0 planned so far".
- **Exercise library:** `packages/db/prisma/seed.ts` grew from 43 to 110 exercises. It is committed as its own commit on the Phase A branch, with the content unchanged.

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

- **Phase 10.3 — Axis rebuild (E5–E9).** Rebuilt the five axis calculators so each measures what its name implies. **E8:** PROGRESSION_SOUNDNESS rule set replaced — four computable checks replace the single %1RM-without-a-1-rep rule. Program G (broken progression) now correctly reads `Issue found` instead of `Sound`. **E5:** new `hardSetCredit.ts` helper — sets earn 1/0.5/0 credit by RIR (≤3 full, 4 half, ≥5 zero, undefined assumed 2). Applied to volume, frequency, progression; recovery uses it only to read effort. **E6:** FREQUENCY reframed as distribution — metric is `exposures / required` where required = `ceil(weeklySets / 10)`, exposure requires ≥2.0 fractional sets per session; root-cause key is now `frequency:split-<scope>`. **E7:** SELECTION pattern list from config; CARRY and ISOLATION dropped from requirement. **E9:** recovery calculator injectable via `ComputeAnalysisOptions.recoveryCostCalculator`; weight is `RPE/10` else 0.8; the 0.75-vs-75 percent unit ambiguity is eliminated. **No migration. No schema change. No packages/ai change. No commitFromMutation call-site change.** Fit is unchanged on all 10 calibration programs by design — every new finding lands at LOW leverage or below. `ASSESSMENT_ENGINE_VERSION` bumped 0.2.0 → 0.3.0.

**Phase 10.3 additions now in effect:** `hardSetCredit.ts` is the single place effort-to-credit is computed. `computeAnalysis` accepts a `recoveryCostCalculator` option. `GoalProfileConfig` gained four optional fields (`requiredMovementPatterns`, `hardSetCredit`, `frequencyDistribution`, `progressionRules`) — absent means code defaults apply, so no fixture churn. The FREQUENCY axis root-cause key is `frequency:split-<scope>`, no longer sharing with `volume:add-<scope>` — the dedup loop no longer collapses them. `commitFromMutation`'s two call sites are unchanged. The `packages/ai` boundary holds. The `errorFormatter` allow-list is unchanged.

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

- **`hardSetCredit.ts` is the single source of truth for effort-to-credit.** Do not reimplement RIR logic in an axis calculator. Undefined effort is assumed RIR 2 (full credit); PROGRESSION_SOUNDNESS flags the missing effort separately.
- **`GoalProfileConfig`'s four new optional fields default to code constants.** Absent means the constant in the axis file applies. Do not add them to every test fixture; only add where the test exercises a non-default.
- **FREQUENCY's `minExposureSets = 2.0` is a tuning boundary, not a scientific threshold.** It changes indirect-work classification: 1.0 hard-set equivalents per session reads Low, not Adequate. Logged as carry-forward; not a bug.
- **Recovery bands (40/90/130) assume effort-weighted cost.** Programs without stated effort read ~20% lower than before Phase 10.3. If a future calibration shows a systematic shift at the band edges, recalibration is a config change, not an engine change.
- **E8's rep-max-at-percentage uses the Epley equation** as an interim. Nuzzo 2023 is the intended source. Epley over-rejects above ~10 reps — the `percent1RmRepTolerance` may need widening once real programs surface false positives.


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

- **Mid-block correction semantics deferred.** Phase A ships with a warning under the Edit flow ('committing will end your current block'). The question of whether a correction commit should keep the block open is deferred until real usage shows whether users make corrections mid-block often enough to warrant a separate flow. If it matters, ARCH-039 gets an addendum. Not a Phase B blocker.

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

**Phase-10.3-specific items:**

- **Fit band does not reflect new material findings.** A program with 5 attention areas can read STRONG. E11 (breadth-aware Fit) is the deferred lever. Until E11 lands, do not promise users that the Fit band summarizes the axis output.
- **FREQUENCY low for zero-dose muscles uses "give X a session" copy; for under-distributed muscles uses "split X across more days".** Both fire from the same axis; the template distinguishes them. If a future phase adds a third distinct case (e.g. excessive sessions per week), extend `actionTemplates.ts`'s FREQUENCY branch.
- **E8's four checks are not weighted — any single failure is `Issue found`.** A program failing only PERCENT_1RM_FEASIBILITY reads the same as one failing all four. This is deliberate (issue count 0 or ≥1) but worth knowing if PROGRESSION_SOUNDNESS severity moves from MINOR to MODERATE.
- **`percent1RmRepTolerance = 1` is Claude's interim judgment.** If real programs surface false positives on sound %1RM prescriptions, widen it. Not pre-emptive.

**Phase 9 pre-work items (deferred candidates, not Phase 9 scope):**

- **Production `GEMINI_MODEL` default when Anthropic billing is enabled.** Currently `gemini-3.8-flash`. When Anthropic billing is turned on and `MODEL_PROVIDER=anthropic` becomes the production default, decide whether Gemini remains a fallback or is retired. Config-only change.
- **Coach phrasing of CANNOT_COMPUTE.** Model says "temporarily unavailable," which implies a transient failure. The state is structural — unvalidated thresholds. System-prompt refinement only; moot once validated thresholds ship.

## Test status

-- **Vitest** (all passing locally and in CI):
  - `packages/config` — 1 file, 3 tests
  - `packages/ai` — 8 files, 61 tests
  - `packages/db` — 4 files, 9 tests
  - `packages/api` — **16 files, 142 tests**
  - `packages/domain` — **30 files, 302 tests** (Phase A added `assessment/__tests__/provisional-fit.test.ts` (5) and `goal-profiles/__tests__/evidence.test.ts` (10), which pins the evidence tiers)
  - **Total Vitest**: **59 files, 517 tests**
- **Playwright** (all passing where runnable):
  - `e2e/landing.spec.ts`, `e2e/builder.spec.ts`, `e2e/builder-simulate.spec.ts`, `e2e/training.spec.ts`, `e2e/landing-dashboard.spec.ts`, `e2e/review.spec.ts`, `e2e/coach.spec.ts`
- `pnpm turbo run typecheck` → clean; `pnpm lint` → 0 errors (1 pre-existing warning in `invariant.test.ts`); `check:provisional-banner` → PASS
- Playwright (Phase A): all 12 specs pass (1 skipped as designed) when run against a dev server with CI's `MODEL_PROVIDER=mock MOCK_SCENARIO=coach-regression`. Spec changes: the draft-label selector moved from `getByPlaceholder("Option B")` to `getByLabel("New draft label")` (9 call sites; the placeholder is now the default label); `review.spec` `commitV2` targets the new day's picker (drafts now start from v1); `regression.spec` asserts the ARCH-054 banner copy. With the local `.env.local` (`MODEL_PROVIDER=gemini`), the Coach regression step fails because a live model does not reliably propose a change; that step is CI-mock-only by design.
- `pnpm turbo run test` → all packages pass
- `calibration.test.ts` → 20/20; Program G band flip (`Sound` → `Issue found`) confirms E8; `G-pct(0.75) = G-pct(75) = 67.2` confirms E9
- `web#build` → clean; route table unchanged

**No Phase 11.** Further work unlocks on evidence (`17-roadmap-overview.md`).

**Candidate next work, in order of user-facing impact:**

1. **Show to ~5 lifters** now that Phase A makes the app read as finished. Their answer picks Phase B (train the day you're in) or Phase C (build a split in two minutes).
2. **Phase B** (if chosen): day picker, exercise swap, cues, per-exercise notes. Needs 2–3 migrations plus cue content.
3. **Phase 9 operational items** (`docs/LAUNCH_CHECKLIST.md`): Sentry alert rules, Upstash verification, Neon backups.
4. **Deferred:** E4 (band-level severity), E10 (UI-enforced classification gate).

**Register:** ARCH-001 through ARCH-054; next free ID is **ARCH-055**.
