# PROJECT_STATE.md

**This file must be updated at the end of every phase, by the AI session that implemented that phase, before that session ends.** A new AI conversation should be able to understand the current implementation state entirely from this file plus `DECISIONS.md` and the relevant `phases/phase-NN-*.md` file — without reading any previous conversation.

---

## Current phase
**Phase 7 (Review) is next.** Phase 6 (Training Execution & Logging) is complete. See `docs/phases/phase-07-*.md` and construct the handoff packet with `docs/HANDOFF_TEMPLATE.md`.

## Completed phases
- **Phase 0 — Foundation.** Monorepo (`pnpm@9.12.0` + Turborepo 2.11.3), five `packages/*` stubs, `apps/web` on Next.js 15.5.18 (App Router), Auth.js v5 Credentials + JWT (no adapter), one real tRPC procedure (`user.getSelf`), landing + signup + login + empty authenticated dashboard, CI (GitHub Actions), Sentry wired for client/server/edge with verified delivery, ESLint 9 flat config + Prettier, 5 Vitest tests + 1 Playwright E2E, deployed to Vercel production + PR previews.
- **Phase 1 — Domain Model & Database.** Full Phase 1 Prisma schema applied as migration `0002_domain_model` (all models from `04-database-schema.md` except `ProgramShare`, per ARCH-017; `User` reconciled with Phase 0 per ARCH-024). Canonical seed: 18 `MuscleGroup` rows, 43 `Exercise` rows covering every `MovementPattern`, `ExerciseMuscleInvolvement` factors, one `GoalProfileDefinition` (`HYPERTROPHY`, `validated: false`, `thresholds: {}`, `sourceNote: "UNRESOLVED — SCIENTIFIC INPUT REQUIRED"`). `packages/domain` exposes `ProgramStructure` and friends as pure types. `packages/db` gains `programRepository`, `programVersionRepository`, `draftRepository`, `exerciseRepository`, `goalRepository`. `packages/api` gains `program` router with `create`/`listMine`/`get`/`rename`/`archive`, plus `programService` for ownership enforcement. Minimal Program list/create/rename/archive UI under `apps/web/app/app/programs/`. Migration applied to production Neon branch post-merge.
- **Phase 2 — Deterministic Analysis Engine.** `packages/domain/src/analysis/` ships `computeAnalysis()` plus five axis calculators (`volume`, `frequency`, `exerciseSelectionBalance`, `progressionSoundness`, `recoveryCost`), a discriminated `AxisStatus` (`BAND` | `UNVALIDATED`), and a band-resolution helper. `packages/domain/src/goal-profiles/` ships the registry interface, a registry stub, and a `HYPERTROPHY` config with all bounds `null` and `validated: false`. Recovery Cost ships behind a swappable `RecoveryCostCalculator` interface with a structural-only placeholder formula. Zero Prisma/HTTP/UI imports in `packages/domain` (verified). A dev-only QA script (`packages/domain/scripts/run-analysis.ts`) replaces the "internal QA route" option.
- **Phase 3 — Assessment Engine & Fit Score.** `packages/domain/src/assessment/` ships `computeAssessment()`, `computeFitScore()`, the deterministic action-template registry, and the launch-gate function. `GoalProfileConfig` gains `severityMap`, `severityWeightTable`, `materialitySeverityThreshold`, `fitScoreProjection` (all values provisional). `HYPERTROPHY_CONFIG` is now structurally complete: every band bound still `null`, every axis weight still `null`. The Final Freeze worked-example test passes verbatim. `Assessment` and `FitScore` are wrapped in discriminated unions so no consumer can read an unvalidated assessment as validated.
- **Phase 4 — Builder, Live Analyze & Commit.** `packages/domain/src/mutation/` ships `applyMutation()` and the `MutationSpec` discriminated union — the single mutation function simulate and commit share (invariant 2). `packages/domain/src/assessment/version.ts` exports `ASSESSMENT_ENGINE_VERSION = "0.1.0"`. `packages/db` gains tx-aware write functions, a shared `TRANSACTION_OPTIONS`, and two new reads. `packages/api` gains `programVersionService.ts` (the home of `commitFromMutation`), `draftService.ts`, `referenceDataService.ts`, an extended `programService.ts`, and five new routers. `packages/ai/src/__tests__/boundary.test.ts` enforces ARCH-011 mechanically. `apps/web` gains its first client-side tRPC wiring (`src/lib/trpc.tsx`), a generic `AssessmentDisplay` component tree, and the Builder route at `/app/programs/[id]/build`. No new migration.
- **Phase 5 — Simulation, Mutation Invariant & Apply.** `packages/domain/src/mutation/` ships `simulate()`, `diffAssessments()`, and `diffStructures()`. `SimulationResult` is a discriminated union (`COMPUTED` | `CANNOT_COMPUTE` | `INVALID_MUTATION`) — `CANNOT_COMPUTE` carries both analyses and both assessments (ARCH-036 addendum). `packages/db` gains the Simulation repository (`createSimulation`, `findSimulationById`, `findAppliedRevisionForSimulation` — applied-ness is derived, no column; see ARCH-038). `packages/api/src/services/simulationService.ts` hosts `simulateAndPersist`; `commitFromSimulation` is added next to `commitFromDraft` — the second-and-last call site of `commitFromMutation`. `StaleSimulationError` and `SimulationAlreadyAppliedError` project onto the wire via the allow-listed `errorFormatter`. New tRPC procedures: `simulation.simulate`, `programVersion.commitFromSimulation`. Builder gains a minimal `SimulateChangePanel` and a `GainCostNetDisplay` component. No new migration.
- **Phase 6 — Training Execution & Logging.** Four new repository files in `packages/db/src/repositories/` — `trainingBlock.ts`, `session.ts`, `performanceRecord.ts`, `observation.ts` — plus `archiveProgramInTx` on the Program repository and a large `packages/db/src/index.ts` extension. **Decimal convention established**: `PerformanceRecordRecord.actualLoad` / `actualRpe` are `number | null`, not `Prisma.Decimal`; the repository converts at the `packages/db` boundary (`Number(decimal)` on read, `new Prisma.Decimal(number)` on write). This is the codebase's first Decimal on the wire. Four new services in `packages/api/src/services/`: `loadOwnedExecution.ts` (session + block ownership helpers, non-disclosure), `trainingService.ts` (`activateVersion` — the ARCH-016 lifecycle entry point, plus `getCurrentBlock`), `sessionService.ts` (`getOrCreateNext` — lazy rotation; `getSessionContext`; `markStarted` / `markCompleted` / `markSkipped` with an `ALLOWED_TRANSITIONS` table), `performanceService.ts` (`logSet` / `logBatch` / `listMyRecordsForSession`; deviation honesty enforced by *not* validating deviation — only prescription-membership is checked), `observationService.ts` (`createMyObservation`, `listMyObservationsForBlock`, `listMyObservationsForSession`). **Commit-triggered lifecycle (ARCH-039)**: `commitFromMutation` now closes the prior `TrainingBlock` and opens a new one inside its existing transaction; `archiveMyProgram` closes the open block inside its transaction (ARCH-039 / kickoff fix A6). **Archive close-status rule**: `COMPLETED` iff ≥1 `Session` with status `COMPLETED`, else `ABANDONED` — applied identically by `activateVersion`, `commitFromMutation`, and `archiveMyProgram`. Four new routers (`training`, `session`, `performance`, `observation`). New UI: `/train` (program picker + server-action → session redirect), `/train/session/[id]` (RSC wrapper + `SessionClient` logging UI), an "Activate this version" button on the program detail page (server action `activateVersionAction`). **No new migration** — all four tables existed since Phase 1. **No new application-level error classes** — every Phase 6 failure projects through existing `NOT_FOUND` / `PRECONDITION_FAILED` / `BAD_REQUEST` codes; see ARCH-040 for the semantics.

## Current architecture
As specified in `docs/01-architecture-recommendation.md` and `docs/02-system-architecture.md`. **As-built matches spec.** Phase 6 additions are contained to the persistence, orchestration, and web layers. No layer boundary was crossed. `packages/domain` still has zero Prisma/HTTP/UI imports (verified by grep) — Phase 6 added nothing to `packages/domain`, per the phase file's explicit "Domain changes: None."

**`commitFromMutation` still has exactly two call sites** — `commitFromDraft` (Builder's manual Commit) and `commitFromSimulation` (the "Apply this change" button after a simulation). Phase 6 did **not** add a third. `activateVersion` is not a commit: it points `Program.activeVersionId` at an existing committed `ProgramVersion`. It does not create a `ProgramVersion` and does not route through `commitFromMutation`. Any future phase adding a third `commitFromMutation` call site is a violation of invariant 2 and must be stopped, not negotiated.

**`commitFromMutation` did change** — Phase 6 (ARCH-039) extends its transaction with the same `TrainingBlock` close + open sequence that `activateVersion` uses. This is additive: the pointer-flip still happens, no new call site, no second mutation path. The domain-level invariant test and the full-stack invariant test still pass.

Phase 4/5 guarantees still in effect: `applyMutation` shared by both simulate and commit (invariant 2); the two `commitFromMutation` call sites; `CommitOrigin` widened with `draftId` (ARCH-033); the `AssessmentSnapshot` written at commit time; the errorFormatter allow-list. `SimulationResult` as a discriminated union (ARCH-036); `WhatChangedResult` + `StructureDiffEntry` (ARCH-037); applied-ness of a Simulation derived from `Revision.sourceSimulationId` (ARCH-038); `createdVia`/`trigger` read from `origin.via`.

Phase 3 additions still in effect: ARCH-029 (severity per axis-status; leverage table is 2-D), ARCH-030 (assessment result shapes; `allAssessedAxes`; rule-based Fit Score), ARCH-031 (categorical `AxisWeight.weight`; axis-level fallback keys; `materialitySeverityThreshold`).

Phase 6 additions now in effect: ARCH-039 (commit-triggered `TrainingBlock` lifecycle; all three lifecycle triggers — `activateVersion`, `commitFromMutation`, `archiveMyProgram` — apply the same `COMPLETED` / `ABANDONED` resolution rule, and every trigger runs its reads inside the transaction that performs its writes); ARCH-040 (Phase 6 error-code semantics — ownership/existence failures are `NOT_FOUND`; state failures on authorized, present entities are `PRECONDITION_FAILED`).

## Current stack
- **Runtime**: Node 20.x (pinned via `.nvmrc`)
- **Package manager**: pnpm 9.12.0 (via `packageManager` field; Vercel uses 9.15.9 internally)
- **Monorepo**: Turborepo 2.11.3
- **Web**: Next.js 15.5.18 (App Router), React 19.0.0 stable, React DOM 19.0.0
- **Client data**: `@trpc/react-query` + `@tanstack/react-query`
- **API**: tRPC 11.19.0 + Zod 3.25.76
- **Database**: PostgreSQL (Neon in production; local Postgres in dev) via Prisma 5.22.0 — all models from Phase 1, no changes in Phases 2–6
- **Auth**: Auth.js (NextAuth v5) 5.0.0-beta.25 — Credentials provider, JWT session strategy, **no database adapter**, `bcryptjs` for password hashing (ARCH-020)
- **Testing**: Vitest 2.1.9 (unit), Playwright 1.63.0 (E2E)
- **Error monitoring**: `@sentry/nextjs` 8.55.2 — client, server, edge
- **Linting**: ESLint 9.39.5 (flat config), Prettier 3.9.9
- **Hosting**: Vercel (production + PR previews), Neon (Postgres), Sentry

*(Deviations from `01-architecture-recommendation.md`: none. Version numbers reflect what was actually installed; recommendation left exact versions open. Phase 6 introduced no new runtime dependency.)*

## Project conventions (learned during Phases 0–6)
- **Node version**: pinned to 20 via `.nvmrc`. Node 22+ causes Vitest worker crashes ("Worker exited unexpectedly"). Run `nvm use 20` in a fresh shell before any `pnpm` command. A shell that still has Node 24 active will pass typecheck but fail Vitest — the ELIFECYCLE trailer prints the actual node path, so check it if a test run is unexpectedly broken.
- **Turbo env vars**: declared via `globalEnv` in `turbo.json`. Turbo 2.x strips undeclared env vars from task subprocesses and excludes them from cache keys. Any new env var the app reads at runtime or build time must be added to `globalEnv`.
- **`turbo.json` `typecheck`** depends on `["^build", "build"]` — deliberate, prevents a race where `tsc` reads a half-regenerated `apps/web/.next/types/` directory when Turbo runs `build` and `typecheck` in parallel. Consequence: if `web#build` fails, `web#typecheck` is skipped entirely — a build error hides type errors until the build is fixed.
- **Relative imports in `packages/*`**: extensionless (`from "./router"`, not `"./router.js"`). Next.js webpack does not rewrite `.js` → `.ts` in `transpilePackages`.
- **Env files**: three locations — root `.env.local`, `apps/web/.env.local`, `packages/db/.env`. Next.js reads `apps/web/`; Prisma CLI reads `packages/db/`. **All three must point at the same `DATABASE_URL`/`DIRECT_URL` at all times.** Symptom of drift: Prisma CLI operations run fast against the intended DB, while Next.js requests take 5–30 s and eventually fail with a Prisma connection-pool timeout. See ARCH-034.
- **Prisma on Vercel**: `packages/db/prisma/schema.prisma` declares `binaryTargets = ["native", "rhel-openssl-3.0.x"]` and `apps/web/next.config.js` uses `@prisma/nextjs-monorepo-workaround-plugin`. Both required together (ARCH-022).
- **Prisma `$transaction`**: passes explicit `{ timeout: 20000, maxWait: 10000 }` via `TRANSACTION_OPTIONS` in `packages/db/src/repositories/programVersion.ts` (ARCH-026). Reuse it for any new transaction.
- **Prisma on Json columns**: raw `null` is NOT assignable to Prisma's `InputJsonValue`. For an optional Json column, either omit the key (writes SQL NULL) or pass `Prisma.DbNull` (SQL NULL) / `Prisma.JsonNull` (JSON literal `null`). Phase 6 established the omission pattern; see `observation.ts`'s `structuredFields` handling.
- **Prisma on Decimal columns**: the repository converts `Prisma.Decimal → number` at the `packages/db` boundary (`Number(decimal)` on read, `new Prisma.Decimal(number)` on write). No `Prisma.Decimal` reaches `packages/api` or the wire. Phase 6 established this convention; see `performanceRecord.ts`. A future Decimal column should follow the same pattern.
- **`as Prisma.InputJsonValue` casts** in repository files are intentional boundary enforcement (ARCH-010). Do not replace with input-signature typing that would leak Prisma types into a repository's public API.
- **Branch convention**: each phase on its own branch named `phase-NN-<short-name>`, merged to `main` via PR.
- **Production migrations** are a gated explicit step, not auto-run on deploy — per `15-deployment.md`.
- **After editing any `package.json`, run `pnpm install` and commit `pnpm-lock.yaml`.** CI and Vercel use `--frozen-lockfile`; an out-of-date lockfile fails both.
- **`noUncheckedIndexedAccess: true` is on** in `packages/domain`. Indexed access (`arr[0]`) types as `T | undefined`. Do not silence with `as T` or `!` — either seed loops from a defined element, or add an explicit `if (x === undefined) throw` guard.
- **Test-file paths are load-bearing.** Imports resolve relative to the test file's location.
- **Action templates are keyed by `goalProfileKey`.** A test fixture that wants to exercise the action path must use `goalProfileKey: "HYPERTROPHY"`. A synthetic key with no matching templates yields zero actions by design.
- **Client state holding tRPC-mutated rows must not use the `@training/db` record type.** Over the wire, Dates arrive as strings (no superjson transformer configured) and Json columns arrive as optional. Define a per-surface `Client*` type (see `ClientDraft` in `BuilderClient.tsx` and the `Client*` types in `SessionClient.tsx`).
- **`simulate()` returns `INVALID_MUTATION`, it does not throw.** `applyMutation` throws a typed `MutationError`; `simulate` catches it and returns it as a first-class union branch.
- **`CANNOT_COMPUTE` carries both analyses, not just both assessments.** ARCH-036 addendum.
- **Simulation "applied" is derived, never stored.** `findAppliedRevisionForSimulation(simulationId)` returns the Revision whose `sourceSimulationId` matches. See ARCH-038.
- **`createdVia` / `trigger` read from `origin.via`.** `commitFromMutation` does not hardcode `"MANUAL_COMMIT"`. See ARCH-033.
- **In a server action, `redirect()` must sit OUTSIDE any try/catch.** It throws `NEXT_REDIRECT` as a sentinel error; a generic catch swallows it silently, and the redirect never fires. See `apps/web/app/train/actions.ts` (`startTrainingAction`) and `apps/web/app/app/programs/[id]/activate-action.ts` (`activateVersionAction`). Phase 7 (Review) and Phase 8 (Coach) will have server actions that redirect; this trap is easy to reintroduce.
- **Phase 6 error-code semantics (ARCH-040)**: ownership/existence failures are `NOT_FOUND`; state failures on authorized, present entities are `PRECONDITION_FAILED`; shape/membership violations are `BAD_REQUEST`. Phase 6's kickoff discussion proposed `NOT_FOUND` for the archived-Program case and `BAD_REQUEST` for the no-workout-days case; both were unified to `PRECONDITION_FAILED` because the entity is present and authorized, and because the same `/train` fix-it UX handles both.
- **`TrainingBlock` lifecycle reads MUST run inside the same transaction that writes.** `TrainingBlock` has no unique constraint that would catch two ACTIVE blocks for the same Program (a partial unique index `WHERE status = 'ACTIVE'` cannot be expressed in Prisma's schema DSL without raw SQL). See ARCH-039 and the `InTx` read variants in `trainingBlock.ts`.
- **`getOrCreateNext` is a mutation, not a query.** It creates a Session on the first call per block; making it a query would be non-idempotent under React Query retries.
- **PerformanceRecord deviation honesty is enforced by *not* validating.** `performanceService.logSet` / `logBatch` check only that the `exercisePrescriptionId` belongs to the session's workout day. They do not reconcile reps/load/RPE against the plan, do not clamp, do not reject a deviation. That is deliberate; the gap between plan and actual is what Phase 7's Review exists to surface.
- **Playwright `expect.timeout` is 15_000**, not Playwright's 5s default. The long-term fix is `webServer.command: "pnpm build && pnpm start"` — deferred.
- **Playwright strict-mode label collisions** in `SimulateChangePanel`: anchor every locator in that panel (`/^Workout day/`, `/^Prescription/`, `getByRole("spinbutton", { name: /^Target sets/ })`). See PROJECT_STATE's Phase-5-specific items.
- **Playwright test filter syntax via pnpm**: `pnpm --filter web test:e2e training.spec.ts` (no `--`). With `--`, pnpm forwards it as a passthrough arg and Playwright runs the full suite instead of filtering.
- **E2E assumes a seeded dev DB.** `pnpm --filter @training/db db:seed` is idempotent; run it after any local Postgres reset.
- **E2E leaves its test users and Programs in the dev DB.** Phase 4/5/6's specs each create one user and one program per run and do not clean up. Acceptable at MVP because local dev uses a per-developer DB; before CI runs E2E against a shared database, this needs explicit cleanup.

## Repository structure
Created exactly per `docs/16-repository-structure.md`. `apps/mobile` intentionally absent (Phase 12+).

`packages/domain` contains:
- `src/types.ts` — `ProgramStructure` family
- `src/analysis/` — Phase-2 analysis engine + fixtures + tests
- `src/assessment/` — Phase-3 assessment engine + fixtures + tests; `version.ts`
- `src/goal-profiles/` — registry, HYPERTROPHY config
- `src/mutation/` — Phase-4/5 mutation surface
- `scripts/run-analysis.ts`, `scripts/run-assessment.ts` — dev QA scripts

`packages/db` contains: `prisma/` (schema + `migrations/0001_init`, `migrations/0002_domain_model`), `src/repositories/` (`user.ts`, `program.ts`, `programVersion.ts`, `draft.ts`, `simulation.ts`, `exercise.ts`, `goal.ts`, **Phase 6:** `trainingBlock.ts`, `session.ts`, `performanceRecord.ts`, `observation.ts`), `src/repositories/tests/` (`helpers.ts`, per-repository tests), `src/__tests__/immutability.test.ts`.

`packages/api` contains: `context.ts`, `trpc.ts`, `errors.ts` (four error classes, unchanged from Phase 5 — no Phase 6 additions), `router.ts` (extended with four new routers), `index.ts`, `routers/` (`user.ts`, `program.ts`, `draft.ts`, `analysis.ts`, `programVersion.ts`, `exercise.ts`, `muscleGroup.ts`, `simulation.ts`, **Phase 6:** `training.ts`, `session.ts`, `performance.ts`, `observation.ts`, plus `tests/`), `schemas/` (`programStructure.ts`, `mutation.ts`), `services/` (`programService.ts` — extended Phase 6, `draftService.ts`, `programVersionService.ts` — extended Phase 6, `simulationService.ts`, `referenceDataService.ts`, `loadOwnedProgram.ts`, **Phase 6:** `loadOwnedExecution.ts`, `trainingService.ts`, `sessionService.ts`, `performanceService.ts`, `observationService.ts`, plus test files).

`packages/ai` contains: `src/index.ts` (unchanged stub), `src/index.test.ts`, `src/__tests__/boundary.test.ts` (ARCH-011 enforcement).

`apps/web` contains: `app/` (`(auth)/`, `api/auth/[...nextauth]/`, `api/trpc/[trpc]/`, `app/page.tsx`, `app/programs/` — extended Phase 6 with activate button + `activate-action.ts`, `app/programs/[id]/build/`, **Phase 6:** `app/train/page.tsx`, `app/train/actions.ts`, `app/train/train.module.css`, `app/train/session/[id]/page.tsx`, `app/train/session/[id]/SessionClient.tsx`), `src/lib/trpc.tsx`, `src/server/auth.ts`, `components/assessment/`, `components/simulation/`, `e2e/` (`landing.spec.ts`, `builder.spec.ts`, `builder-simulate.spec.ts`, **Phase 6:** `training.spec.ts`).

## Database schema version
- **`0001_init`** applied in Phase 0 — `User` table only.
- **`0002_domain_model`** applied in Phase 1 — adds every model from `04-database-schema.md` except `ProgramShare`, and reconciles `User` (ARCH-024).
- **No new migration in Phases 2, 3, 4, 5, or 6.** Phases 2–3 were pure computation. Phase 4 wrote to existing tables. Phase 5 began writing the `Simulation` table. **Phase 6 began writing the `TrainingBlock`, `Session`, `PerformanceRecord`, and `Observation` tables — all four created by `0002_domain_model`.** No shape change was required; the Phase 6 kickoff confirmed no schema gap.
- Migrations run locally via `pnpm --filter @training/db db:migrate`. Seeding runs automatically after `migrate dev` and is idempotent. **Production migrations remain gated** per `15-deployment.md`.

## API version
tRPC 11, mounted at `/api/trpc/[trpc]` via `fetchRequestHandler`. Routers and procedures:

- `user.getSelf`
- `program.{create, listMine, get, rename, archive}` — Phase 6: `archive` now closes any open `TrainingBlock` inside the same transaction as `archivedAt`
- `draft.{create, get, listForProgram, updateStructure, discard}`
- `analysis.previewAnalyze`
- `programVersion.{commitFromDraft, commitFromSimulation, get, listForProgram}` — Phase 6: `commitFromDraft` and `commitFromSimulation` now also run the `TrainingBlock` close + open inside the commit transaction (ARCH-039)
- `exercise.listAll`
- `muscleGroup.listAll`
- `simulation.simulate`
- **Phase 6:** `training.{activateVersion, getCurrentBlock}`
- **Phase 6:** `session.{getOrCreateNext, getContext, markStarted, markCompleted, markSkipped}`
- **Phase 6:** `performance.{logSet, logBatch, listForSession}`
- **Phase 6:** `observation.{create, listForBlock, listForSession}`

`programService` enforces ownership. All Phase 6 services use `loadOwnedProgramOrThrow` / `loadOwnedSessionOrThrow` / `loadOwnedTrainingBlockOrThrow` so no user can read another's data (non-disclosure: NOT_FOUND, not FORBIDDEN).

`errorFormatter` allow-lists four error classes for structured projection onto `error.data.cause`: `StaleDraftError`, `DraftNotActiveError`, `StaleSimulationError`, `SimulationAlreadyAppliedError`. **No Phase 6 additions** — Phase 6 has no application-level error classes. See ARCH-040 for the code semantics.

## Implemented domain objects
- Phase 1: `ProgramStructure`, `WorkoutDayStructure`, `ExercisePrescriptionStructure`, `LoadScheme`, `EvidenceTag`
- Phase 2: `Analysis`, `AnalysisAxisResult`, `AxisStatus`, `AxisBandDefinition`, `AxisWeight`, `GoalProfileConfig`, `GoalProfileDefinition`, `GoalProfileRegistry`, `ExerciseReferenceData` family, `MovementPattern`, `RecoveryCostCalculator`
- Phase 3: `Severity`, `Weight`, `Leverage`, `SeverityMap`, `SeverityWeightTable`, `FitScoreBand`, `FitScoreProjection`, `AssessedAxis`, `ActionSuggestion`, `Assessment`, `AssessmentResult`, `FitScore`, `FitScoreResult`, `ComputeAssessmentOptions`, `RollUpOutcome`, `ActionTemplateResult`
- Phase 4: `MutationSpec`, `MutationOp`, `MutationErrorCode`, `MutationError` (class), `applyMutation` (function), `ASSESSMENT_ENGINE_VERSION`
- Phase 4 (api-layer): `CommitOrigin`, `StaleDraftError`, `DraftNotActiveError`, `PreviewAnalyzeResult`, `VersionWithSnapshot`, `ClientDraft` (web), `ProgramStructureInput` (zod schema)
- Phase 5: `SimulationNet`, `SimulationResult`, `StructureDiffEntry`, `WhatChangedResult`, `AssessmentDiff`, `SimulateOptions`
- Phase 5 (api-layer): `StaleSimulationError`, `SimulationAlreadyAppliedError`, `SimulateAndPersistResult`, `MutationSpecInput` (zod schema)
- **Phase 6 (db-layer):** `TrainingBlockRecord`, `TrainingBlockStatus`, `CreateTrainingBlockInput`; `SessionRecord`, `SessionStatus`, `CreateSessionInput`, `SessionStatusUpdate`; `PerformanceRecordRecord`, `CreatePerformanceRecordInput`; `ObservationRecord`, `CreateObservationInput`
- **Phase 6 (api-layer):** `SessionContext`, `LogSetInput`, `LogBatchEntry`, `LogBatchInput`; `CreateObservationInput` (service-level, distinct from the db-layer one)
- **Phase 6 (web-layer):** `ClientSessionContext`, `ClientWorkoutDay`, `ClientPrescription`, `ClientPerformanceRecord`, `ClientObservation` (see `SessionClient.tsx`)

## Implemented product capabilities
Program CRUD through the real tRPC API and the authenticated UI. **Builder**: draft CRUD (create/discard/list, multiple concurrent per Program), structure editing, save-on-demand. **Live Analyze**: `analysis.previewAnalyze` runs the deterministic engine over a saved draft's structure and returns `Analysis` + `AssessmentResult` + `FitScoreResult` without persisting. **Commit**: `programVersion.commitFromDraft` writes a new immutable `ProgramVersion` + its normalized rows + first `Revision` + first `AssessmentSnapshot` + flips `Program.activeVersionId` + closes any prior `TrainingBlock` and opens a new one against the new version (ARCH-039) + marks the source Draft `COMMITTED` — all in one transaction. **Simulation & Apply**: `simulation.simulate` runs the deterministic engine on the active version + a proposed `MutationSpec` and persists a `Simulation` row. `programVersion.commitFromSimulation` applies the stored mutation through the same `commitFromMutation` the manual Commit button uses, producing a new immutable `ProgramVersion` with `createdVia: "AI_APPLIED_SIMULATION"` and a `Revision` whose `sourceSimulationId` links back to the Simulation.

**Phase 6 — Training execution:** `training.activateVersion` points `Program.activeVersionId` at an existing committed version and opens a new `TrainingBlock`, closing the prior one with the same COMPLETED/ABANDONED resolution rule as the commit path. Idempotent re-activation of the current active version returns the existing block unchanged. `session.getOrCreateNext` returns the pending or in-progress Session for a Program, or lazily creates the next one in rotation (WorkoutDays in `orderIndex` sequence, wrapping). `session.markStarted` / `markCompleted` / `markSkipped` enforce the `ALLOWED_TRANSITIONS` table (`PLANNED → IN_PROGRESS → COMPLETED`; `PLANNED | IN_PROGRESS → SKIPPED`; COMPLETED/SKIPPED terminal). `performance.logSet` and `performance.logBatch` store exactly what the user enters — deviation honesty is enforced by *not* validating; only prescription-membership is checked. `observation.create` supports standalone, session-scoped, and block-scoped observations; `listForBlock` returns both block-scoped and session-scoped observations within the block. The web UI: `/train` lists Programs with active versions and starts/continues training via server action; `/train/session/[id]` provides the logging flow (large tap targets, per-prescription input row, "Log N remaining sets" batch path, post-session observation capture); the program detail page carries an "Activate this version" button on every non-active version. Archiving a Program closes its open `TrainingBlock` inside the archive transaction.

**Not implemented:** Review (Phase 7), AI Coach (Phase 8). The full `Simulation` flow is present from Phase 5; `Simulation.createdByConversationId` remains `null` until Phase 8.

## Known bugs
None.

## Unresolved decisions
Carried from `docs/00-product-freeze-reference.md` — not to be resolved by any implementation phase, only by explicit product/sports-science input:
- Numeric thresholds for Volume/Frequency/Recovery Cost bands, per goal profile.
- Goal weights per axis, per goal profile (all `null` in `HYPERTROPHY_CONFIG.axisWeights` today).
- North-star metric measurement window.
- Whether Fit Score has previously-named bands to preserve. **Phase-3 working assumption: no.** `FitScoreBand` is `"STRONG" | "DECENT" | "NEEDS_WORK"` — generic placeholders pending the (unavailable) Assessment-Redesign source text.
- Recovery Cost's underlying formula. May need inputs beyond `ProgramVersion` structure (training age, bodyweight, sleep). Phase 6 did NOT resolve this — the placeholder `RecoveryCostCalculator` from Phase 2 is still in place.
- Whether Review should default to showing the Commit-time snapshot vs. a live recompute (ARCH-015, pending product sign-off). Phase 4 writes the Commit-time snapshot; the query side (`findLatestAssessmentSnapshotForVersion`) is in place for Phase 7 to consume.

**Phase-3-specific items (unchanged by Phases 4–6):**
- Severity map, leverage-table cells, and Fit Score projection cell contents are all provisional. Every value is marked `PROVISIONAL` in comments.
- The launch gate is implemented but not wired into CI. CI wiring is Phase 9's.

**Phase-4-specific items (unchanged by Phases 5–6):**
- **Cold-start E2E flake, mitigated not fixed.** `test.setTimeout(120_000–240_000)` and `expect.timeout: 15_000` absorb cold-start compile costs. Long-term fix is `webServer.command: "pnpm build && pnpm start"` — deferred.
- **E2E leaves test fixtures in the dev DB.** One user + one program per spec run (now three specs create fixtures; Phase 6's `training.spec.ts` adds a fourth). Fine for per-developer DBs; needs cleanup before CI runs E2E against shared infrastructure.
- **Success message rendered through the error banner.** `BuilderClient` reuses the `errorBanner` class for the commit-success confirmation. Red text for a success state is confusing; a distinct "status" surface is a Phase-7+ cleanup. Phase 6's `SessionClient` uses a separate `successBanner` class for the same reason — the Builder's case remains outstanding.
- **`analysis.previewAnalyze` does not surface `allAssessedAxes`.** Deliberate per Q3 (partial info presented as real risks normalization).
- **Two unused-import lint warnings** in `packages/domain/src/analysis/__tests__/recoveryCost.test.ts`. Phase 2 leftovers; warnings, not errors. Trivial cleanup.

**Phase-5-specific items (unchanged by Phase 6):**
- **Simulate is against active version only.** The Phase 1 schema's `Simulation.baseVersionId` is a non-null FK to `ProgramVersion`; drafts are not a legal base for a Simulation. Logged in ARCH-035.
- **"Already applied" detection is a query, not a marker.** Under concurrent retries of the same `simulationId`, both calls could pass the check and both could then fail the stale-check. A future phase needing strict serialization would add a unique constraint on `Revision.sourceSimulationId` or take a `Program` row lock.
- **`SimulateChangePanel` label ambiguity.** The Operation `<select>`'s accessible name concatenates its option texts; the E2E works around this with anchored locators. The durable fix is distinct `<label>` text per field.

**Phase-6-specific items:**
- **`getOrCreateNext`'s concurrent-call safety is best-effort.** Two simultaneous `getOrCreateNext` calls (e.g. a double-clicked "Start training") can both read `findActiveSessionForBlock` as null and both create a Session with `sequenceIndex` N. `Session` has no unique constraint on `(trainingBlockId, sequenceIndex)`, so the second insert succeeds rather than being rejected. The scenario requires concurrent calls on the same block, which the UI does not produce today (server-action redirect serializes the interaction). If a future UI introduces parallel calls or offline sync, add `@@unique([trainingBlockId, sequenceIndex])` or a `SELECT ... FOR UPDATE` on the TrainingBlock row. Logged as a Phase-7+ candidate.
- **No `ProgramShare` handling in the Phase 6 ownership helpers.** `loadOwnedSessionOrThrow` / `loadOwnedTrainingBlockOrThrow` check `block.userId === userId` only, matching the pre-Phase-10 state. When sharing lands, both helpers need a shared-access path (structurally identical to `loadOwnedProgramOrThrow`'s future sharing extension — a single change, not a per-entity one).
- **Session context is returned from `session.getContext` as a single read.** The RSC page then issues three parallel reads (`exercise.listAll`, `performance.listForSession`, `observation.listForSession`). At the current scale this is fine; if a session ever renders with hundreds of records, `getContext` could inline the record + observation reads. Not done — the parallel reads keep the service surface minimal.
- **`SessionClient` does not invalidate any tRPC query on mutation success** — it updates local state and calls `router.refresh()` on status transitions. This is deliberate: records come from local state, and a `router.refresh()` after every logged set would re-fetch the whole page mid-workout. Consequence: an unrelated tab's view of the same session would be stale until refreshed. Acceptable at MVP.
- **`Observation.structuredFields` has no domain shape.** It is stored and returned as opaque JSON. A future phase that wants named ratings (sleep hours, soreness 1–5, stress 1–5) should introduce a Zod-validated shape on the API boundary — a service-layer change, not a schema migration.
- **Server action `activateVersionAction` uses `revalidatePath`, not `redirect`.** The user stays on the program detail page. If the product ever wants "activate then go to /train" as a single click, that's a UI decision, not an architectural one — `redirect()` would sit outside any try/catch per the standard convention.
- **Three `.env` files still require manual coordination** (ARCH-034). The Phase-5 candidate for a `playwright.config.ts` `globalSetup` env-parity check was not built in Phase 6.

**Phase-1-specific outstanding items (still open, not blockers):**
- **Sentry sourcemaps** — uploading successfully; may need org-token scope review for release tagging later.
- **Local secret rotation** after ARCH-021's Next.js security upgrade — recommended, not yet done.
- **Exercise/MuscleGroup seed coverage review** — `involvementFactor` values are provisional content data.

## Architectural decisions
See `DECISIONS.md` for the full register (ARCH-001 → ARCH-040). Phase 1 close-out added ARCH-020 – ARCH-024; Phase 2 added ARCH-025 – ARCH-028; Phase 3 added ARCH-029 – ARCH-031; Phase 4 added ARCH-032 – ARCH-033; Phase 5 added ARCH-034 – ARCH-038; **Phase 6 close-out added ARCH-039 – ARCH-040.**

The three-layer split, the AI-apply-confirmation boundary (ARCH-011), the invariant-8 "same roll-up" guarantee, and the invariant-2 "single commit function, two call sites" guarantee all remain as specified.

## Test status
- **Vitest** (all passing locally and in CI):
  - `packages/config` — 1 file, 3 tests
  - `packages/ai` — 2 files, 3 tests
  - `packages/db` — 4 files, 9 tests (unchanged by Phase 6)
  - `packages/api` — **11 files, 63 tests** (Phase 6 added `services/trainingService.test.ts` 12, `services/sessionService.test.ts` 13, `services/performanceService.test.ts` 8, `services/observationService.test.ts` 9 — 42 new tests)
  - `packages/domain` — 24 files, 179 tests (unchanged by Phase 6)
  - **Total Vitest**: **42 files, 257 tests**
- **Playwright** (**4 tests**, all passing):
  - `e2e/landing.spec.ts` — Phase 0, unchanged
  - `e2e/builder.spec.ts` — Phase 4
  - `e2e/builder-simulate.spec.ts` — Phase 5
  - **`e2e/training.spec.ts` — Phase 6**; commit a version, start the session via `/train`, log a deliberate deviation (`Set 1: 5 reps` against a 8-10 rep plan), mark complete
- `pnpm turbo run lint typecheck` → `Tasks: 14 successful, 14 total` (2 lint warnings in `recoveryCost.test.ts`, 0 errors)
- `pnpm turbo run test` → all packages pass; E2E suite runs as 4 tests

## Deployment status
Deployed to Vercel.
- **Production URL**: `https://training-platform-web-alpha.vercel.app`
- **Production branch**: `main` (auto-deploys)
- **Preview**: automatic per PR (Vercel) with isolated Neon branch per PR
- **Database (production)**: Neon primary branch — `0002_domain_model` applied; no further migrations since
- **Database (dev)**: local Postgres; the remote `vercel-dev` Neon branch is preserved in `packages/db/.env.neon-dev` (gitignored)
- **CI database**: ephemeral `postgres:16` container on GitHub Actions runner
- **Sentry**: receiving events; source maps uploaded on build

## Next phase
Phase 7 — Review. Read-only aggregation over Phase 6's execution data — Sessions, PerformanceRecords, Observations — plus the persisted `AssessmentSnapshot` from the Commit that opened the reviewed block. Per `08-training-execution-and-evidence.md`, Review is a computed-on-demand view (`interface ReviewData`), not a stored entity.

**Cross-references for Phase 7:**
- **Repository functions to read from.** `sessionRepository.listSessionsForBlock(blockId)` — every Session in the reviewed block, ordered by `sequenceIndex`. `performanceRecordRepository.listPerformanceRecordsForSession(sessionId)` — every logged set for a Session. `observationRepository.listObservationsForBlock(blockId)` — block-scoped AND session-scoped observations within the block (the union is what Review needs). `assessmentSnapshotRepository.findLatestAssessmentSnapshotForVersion(versionId)` — the Commit-time Assessment the user actually saw. `trainingBlockRepository.findTrainingBlockById(blockId)` + `listTrainingBlocksForProgram(programId)` — to locate the block and iterate history.
- **`AssessmentDisplay` and `GainCostNetDisplay` are the two reusable assessment-shaped renderers.** `apps/web/components/assessment/AssessmentDisplay.tsx` and `apps/web/components/simulation/GainCostNetDisplay.tsx`. Phase 7 re-imports both directly; it does NOT extract them to a shared package (per `16-repository-structure.md`'s "no shared UI package" rule).
- **`commitFromMutation`'s two call sites** (`commitFromDraft`, `commitFromSimulation`) remain the complete write-path surface. Phase 7 is read-only — it does not add a third.
- **`packages/ai/src/__tests__/boundary.test.ts`** will fail CI if Phase 7 or any later phase gives `packages/ai` an import path to `@training/api` or the commit function.
- **ARCH-015 is still pending product sign-off**: whether Review defaults to the Commit-time snapshot vs. a live recompute. Phase 4 wrote the Commit-time snapshot; `findLatestAssessmentSnapshotForVersion` is the query side. Phase 7 is the phase that has to make the default choice, or surface it as a UI toggle.
- **The `Simulation` row's `createdByConversationId` column is still always `null`.** Phase 8 populates it. Phase 7 should not.
- **Deviation honesty is already in the data.** `PerformanceRecord.actualReps` / `.actualLoad` / `.actualRpe` store what the user logged, uncorrected. Review's job is to surface systematic deviations (e.g. "bench press load consistently below prescription") — the data is present and honest; the aggregation is what Phase 7 adds.
- **The phase-6-specific `getOrCreateNext` concurrent-call gap** does not affect Phase 7 (read-only) but remains on the outstanding list.

## Prohibited scope (standing, not phase-specific)
Do not build, in any phase, without an explicit new phase spec authorizing it: social feed, clans, likes, rankings, trainer marketplace, native steps tracking, native nutrition database, a second sport, population-level AI (L3), AI L2 before Phase 8's `L2_ENABLED` flag is deliberately flipped, `ProgramShare`/sharing logic before Phase 10, any numeric scientific threshold presented as validated without a cited source, any Jev/`DecisionProvider` wiring into `packages/ai`'s live orchestration path before Phase 11's trigger condition is met per `19-jev-integration-review.md` — see `ARCH-019`.

---

*Template note for the implementing AI: when you finish a phase, replace the relevant sections above with the real, current state — don't just append. This file describes "now," not a changelog; `DECISIONS.md` is where the history/rationale lives.*