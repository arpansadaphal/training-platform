# PROJECT_STATE.md

**This file must be updated at the end of every phase, by the AI session that implemented that phase, before that session ends.** A new AI conversation should be able to understand the current implementation state entirely from this file plus `DECISIONS.md` and the relevant `phases/phase-NN-*.md` file — without reading any previous conversation.

---

## Current phase
**Phase 6 (Training Execution & Evidence) is next.** Phase 5 (Simulation, Mutation Invariant & Apply) is complete. See `docs/phases/phase-06-training-execution.md` and construct the handoff packet with `docs/HANDOFF_TEMPLATE.md`.

## Completed phases
- **Phase 0 — Foundation.** Monorepo (`pnpm@9.12.0` + Turborepo 2.11.3), five `packages/*` stubs, `apps/web` on Next.js 15.5.18 (App Router), Auth.js v5 Credentials + JWT (no adapter), one real tRPC procedure (`user.getSelf`), landing + signup + login + empty authenticated dashboard, CI (GitHub Actions), Sentry wired for client/server/edge with verified delivery, ESLint 9 flat config + Prettier, 5 Vitest tests + 1 Playwright E2E, deployed to Vercel production + PR previews.
- **Phase 1 — Domain Model & Database.** Full Phase 1 Prisma schema applied as migration `0002_domain_model` (all models from `04-database-schema.md` except `ProgramShare`, per ARCH-017; `User` reconciled with Phase 0 per ARCH-024). Canonical seed: 18 `MuscleGroup` rows, 43 `Exercise` rows covering every `MovementPattern`, `ExerciseMuscleInvolvement` factors, one `GoalProfileDefinition` (`HYPERTROPHY`, `validated: false`, `thresholds: {}`, `sourceNote: "UNRESOLVED — SCIENTIFIC INPUT REQUIRED"`). `packages/domain` exposes `ProgramStructure` and friends as pure types. `packages/db` gains `programRepository`, `programVersionRepository`, `draftRepository`, `exerciseRepository`, `goalRepository`. `packages/api` gains `program` router with `create`/`listMine`/`get`/`rename`/`archive`, plus `programService` for ownership enforcement. Minimal Program list/create/rename/archive UI added under `apps/web/app/app/programs/`. Migration applied to production Neon branch post-merge; production signup → `/app` → `/app/programs` verified working.
- **Phase 2 — Deterministic Analysis Engine.** `packages/domain/src/analysis/` ships `computeAnalysis()` plus five axis calculators (`volume`, `frequency`, `exerciseSelectionBalance`, `progressionSoundness`, `recoveryCost`), a discriminated `AxisStatus` (`BAND` | `UNVALIDATED`) so unvalidated axes cannot be rendered as banded, and a band-resolution helper. `packages/domain/src/goal-profiles/` ships the registry interface, a registry stub, and a `HYPERTROPHY` config with all bounds `null` and `validated: false` — no numeric threshold was invented. Recovery Cost ships behind a swappable `RecoveryCostCalculator` interface with a structural-only placeholder formula. Zero Prisma/HTTP/UI imports in `packages/domain` (verified). A dev-only QA script (`packages/domain/scripts/run-analysis.ts`) replaces the "internal QA route" option.
- **Phase 3 — Assessment Engine & Fit Score.** `packages/domain/src/assessment/` ships `computeAssessment()` (leverage roll-up → classification → actions), `computeFitScore()` (rule-based ordinal projection — no numeric intermediate), the deterministic action-template registry (`actionTemplates.ts`), and the launch-gate function (`launchGate.ts`). `GoalProfileConfig` gains `severityMap`, `severityWeightTable`, `materialitySeverityThreshold`, `fitScoreProjection` (all values provisional). `HYPERTROPHY_CONFIG` is now structurally complete: every band bound still `null`, every axis weight still `null`, severity map and leverage table populated with illustrative values marked provisional. The Final Freeze worked-example test passes verbatim. `Assessment` and `FitScore` are wrapped in discriminated unions (`AssessmentResult`, `FitScoreResult`) so no consumer can read an unvalidated assessment as validated.
- **Phase 4 — Builder, Live Analyze & Commit.** `packages/domain/src/mutation/` ships `applyMutation()` (pure) and the `MutationSpec` discriminated union — the single mutation function simulate and commit share (invariant 2). `packages/domain/src/assessment/version.ts` exports `ASSESSMENT_ENGINE_VERSION = "0.1.0"`. `packages/db` extends its repositories with tx-aware write functions (`createProgramVersionInTx`, `createRevisionInTx`, `createAssessmentSnapshotInTx`, `setActiveVersionInTx`, `markDraftCommittedInTx`, `createProgramInTx`, `createGoalInTx`), a shared exported `TRANSACTION_OPTIONS`, and two new reads (`getLatestVersionForProgram`, `findLatestAssessmentSnapshotForVersion`). `packages/api` gains `programVersionService.ts` (the home of `commitFromMutation`), `draftService.ts`, `referenceDataService.ts`, an extended `programService.ts` (transactional create + auto-Goal), and five new routers (`draft`, `analysis`, `programVersion`, `exercise`, `muscleGroup`). `packages/api/src/errors.ts` adds `StaleDraftError` and `DraftNotActiveError`, projected onto the wire via an extended `errorFormatter`. `packages/ai/src/__tests__/boundary.test.ts` enforces ARCH-011 mechanically. `apps/web` gains its first client-side tRPC wiring (`src/lib/trpc.tsx`), a generic `AssessmentDisplay` component tree (`components/assessment/`), and the Builder route at `/app/programs/[id]/build`. E2E suite now has two tests. No new migration.
- **Phase 5 — Simulation, Mutation Invariant & Apply.** `packages/domain/src/mutation/` ships `simulate()` (the pure composition — invariant 2's second-half proof), `diffAssessments()` (Gain/Cost/Net + What-Changed, leverage-delta-aware), and `diffStructures()` (on-demand structural diff, never persisted). `SimulationResult` is a discriminated union (`COMPUTED` | `CANNOT_COMPUTE` | `INVALID_MUTATION`) — `CANNOT_COMPUTE` carries both analyses and both assessments so the persisted Simulation row's non-null Json columns are satisfiable without a second engine pass (ARCH-036 addendum). `packages/db` gains the Simulation repository (`createSimulation`, `findSimulationById`, `findAppliedRevisionForSimulation` — applied-ness is derived, no column; see ARCH-038). `packages/api/src/services/simulationService.ts` hosts `simulateAndPersist`; `commitFromSimulation` is added next to `commitFromDraft` and is the second-and-last call site of `commitFromMutation`. The `AI_APPLIED_SIMULATION` branch of `commitFromMutation` is now live, with `createdVia`/`trigger` read from `origin.via` rather than hardcoded — the full-stack invariant test asserts both values as a regression guard. `StaleSimulationError` and `SimulationAlreadyAppliedError` are added as siblings of `StaleDraftError` and project onto the wire via the same allow-listed `errorFormatter`. New tRPC procedures: `simulation.simulate`, `programVersion.commitFromSimulation`. The Builder gains a minimal `SimulateChangePanel` (5 of 7 ops) and a `GainCostNetDisplay` component reusable by Phase 8's Coach. No new migration. Domain tests: 24 files / 179 tests (Phase 5 added 5 files, 57 tests). API tests: 7 files, 21 tests (Phase 5 added 3 files, 13 tests). Playwright: 3 specs.

## Current architecture
As specified in `docs/01-architecture-recommendation.md` and `docs/02-system-architecture.md`. **As-built matches spec.** Phase 5 additions are contained to the domain's mutation subdirectory, the API's simulation service/router pair, and a new web-side panel + display component. No layer boundary was crossed. `packages/domain` still has zero Prisma/HTTP/UI imports (verified by grep). The three-layer rule holds.

Phase 4 introduced the first cross-layer flow (`applyMutation` used by both simulate and commit — invariant 2). Phase 5 completes it: `commitFromMutation` now has exactly two call sites — `commitFromDraft` (Builder's manual Commit) and `commitFromSimulation` (the "Apply this change" button after a simulation). **There is no third path.** Any future phase adding one is a violation of invariant 2 and must be stopped, not negotiated. The domain-level invariant test (`packages/domain/src/mutation/__tests__/invariant.test.ts`) proves `simulate()` composes the same `applyMutation` a manual caller would; the full-stack invariant test (`packages/api/src/services/invariant.test.ts`) proves the persisted version's engine output is structurally identical to the simulation's stored payload.

Phase 4 additions still in effect: `CommitOrigin` widened with `draftId` (ARCH-033); the `AssessmentSnapshot` written at commit time (`reason: "COMMIT"`); the errorFormatter allow-list.

Phase-5 additions now in effect: `SimulationResult` as a discriminated union (ARCH-036); `WhatChangedResult` + `StructureDiffEntry` (ARCH-037); applied-ness of a Simulation derived from `Revision.sourceSimulationId`, not stored (ARCH-038); `createdVia`/`trigger` read from `origin.via`.

Phase-3 additions still in effect: `ARCH-029` (severity per axis-status; leverage table is 2-D), `ARCH-030` (assessment result shapes; `allAssessedAxes`; rule-based Fit Score), `ARCH-031` (categorical `AxisWeight.weight`; axis-level fallback keys; `materialitySeverityThreshold`).

## Current stack
- **Runtime**: Node 20.x (pinned via `.nvmrc`)
- **Package manager**: pnpm 9.12.0 (via `packageManager` field; Vercel uses 9.15.9 internally)
- **Monorepo**: Turborepo 2.11.3
- **Web**: Next.js 15.5.18 (App Router), React 19.0.0 stable, React DOM 19.0.0
- **Client data**: `@trpc/react-query` + `@tanstack/react-query` (added in Phase 4)
- **API**: tRPC 11.19.0 + Zod 3.25.76
- **Database**: PostgreSQL (Neon in production; local Postgres in dev) via Prisma 5.22.0 — all models from Phase 1, no changes in Phases 2–5
- **Auth**: Auth.js (NextAuth v5) 5.0.0-beta.25 — Credentials provider, JWT session strategy, **no database adapter**, `bcryptjs` for password hashing (ARCH-020)
- **Testing**: Vitest 2.1.9 (unit), Playwright 1.63.0 (E2E)
- **Error monitoring**: `@sentry/nextjs` 8.55.2 — client, server, edge
- **Linting**: ESLint 9.39.5 (flat config), Prettier 3.9.9
- **Hosting**: Vercel (production + PR previews), Neon (Postgres), Sentry

*(Deviations from `01-architecture-recommendation.md`: none. Version numbers reflect what was actually installed; recommendation left exact versions open. Phase 5 introduced no new runtime dependency.)*

## Project conventions (learned during Phases 0–5)
- **Node version**: pinned to 20 via `.nvmrc`. Node 22+ causes Vitest worker crashes ("Worker exited unexpectedly"). Run `nvm use 20` in a fresh shell before any `pnpm` command.
- **Turbo env vars**: declared via `globalEnv` in `turbo.json`. Turbo 2.x strips undeclared env vars from task subprocesses and excludes them from cache keys. Any new env var the app reads at runtime or build time must be added to `globalEnv`.
- **`turbo.json` `typecheck`** depends on `["^build", "build"]` — deliberate, prevents a race where `tsc` reads a half-regenerated `apps/web/.next/types/` directory when Turbo runs `build` and `typecheck` in parallel.
- **Relative imports in `packages/*`**: extensionless (`from "./router"`, not `"./router.js"`). Next.js webpack does not rewrite `.js` → `.ts` in `transpilePackages`.
- **Env files**: three locations — root `.env.local`, `apps/web/.env.local`, `packages/db/.env`. Next.js reads `apps/web/`; Prisma CLI reads `packages/db/`. **All three must point at the same `DATABASE_URL`/`DIRECT_URL` at all times.** When switching between local Postgres and the remote `vercel-dev` Neon branch, update all three together — not just `packages/db/.env`. Symptom of drift: Prisma CLI operations (migrate, seed, tests) run fast against the intended DB, while Next.js requests take 5–30 s and eventually fail with a Prisma connection-pool timeout. See ARCH-034.
- **Prisma on Vercel**: `packages/db/prisma/schema.prisma` declares `binaryTargets = ["native", "rhel-openssl-3.0.x"]` and `apps/web/next.config.js` uses `@prisma/nextjs-monorepo-workaround-plugin`. Both required together (ARCH-022).
- **Prisma `$transaction`**: passes explicit `{ timeout: 20000, maxWait: 10000 }` via `TRANSACTION_OPTIONS` in `packages/db/src/repositories/programVersion.ts` (ARCH-026). Exported for the commit service; any future transaction should import and reuse it.
- **`as Prisma.InputJsonValue` casts** in repository files are intentional boundary enforcement (ARCH-010). Do not replace with input-signature typing that would leak Prisma types into a repository's public API.
- **Branch convention**: each phase on its own branch named `phase-NN-<short-name>`, merged to `main` via PR.
- **Production migrations** are a gated explicit step, not auto-run on deploy — per `15-deployment.md`.
- **After editing any `package.json`, run `pnpm install` and commit `pnpm-lock.yaml`.** CI and Vercel use `--frozen-lockfile`; an out-of-date lockfile fails both.
- **`noUncheckedIndexedAccess: true` is on** in `packages/domain`. Indexed access (`arr[0]`) types as `T | undefined`. Do not silence with `as T` or `!` — either seed loops from a defined element, or add an explicit `if (x === undefined) throw` guard.
- **Test-file paths are load-bearing.** `assessment/__tests__/*.test.ts` imports `../computeAssessment`; a file placed in `analysis/__tests__/` with the same import fails to resolve. When creating a new test file, verify the containing directory matches the import prefix.
- **Action templates are keyed by `goalProfileKey`.** A test fixture that wants to exercise the action path must use `goalProfileKey: "HYPERTROPHY"`. A synthetic key with no matching templates yields zero actions by design.
- **Client state holding tRPC-mutated rows must not use the `@training/db` record type.** Over the wire, Dates arrive as strings (no superjson transformer configured) and Json columns arrive as optional (`field?: unknown`). Define a per-surface `Client*` type (see `ClientDraft` in `BuilderClient.tsx`).
- **`simulate()` returns `INVALID_MUTATION`, it does not throw.** `applyMutation` throws a typed `MutationError`; `simulate` catches it and returns it as a first-class union branch. Any caller that wraps `simulate` in a try/catch and expects a throw is misreading the contract — check `result.kind` instead.
- **`CANNOT_COMPUTE` carries both analyses, not just both assessments.** This is the ARCH-036 addendum: the persisted `Simulation` row's `resultAnalysis` / `resultAssessment` / `diff` columns are non-null. A future phase that changes the Simulation schema to allow nulls in those columns should revisit the addendum.
- **Simulation "applied" is derived, never stored.** `findAppliedRevisionForSimulation(simulationId)` returns the Revision whose `sourceSimulationId` matches. There is deliberately no `Simulation.appliedAsVersionId` column. See ARCH-038.
- **`createdVia` / `trigger` read from `origin.via`.** `commitFromMutation` no longer hardcodes `"MANUAL_COMMIT"`. The full-stack invariant test asserts `v2.createdVia === "AI_APPLIED_SIMULATION"` and `rev.trigger === "AI_APPLIED_SIMULATION"` after a simulation-apply. See ARCH-033.
- **Playwright `expect.timeout` is 15_000**, not Playwright's 5s default. `next dev` compiles each route lazily on first request; on a cold server those compiles take 2-6s each. The long-term fix is `webServer.command: "pnpm build && pnpm start"` — deferred. Not done.
- **Playwright strict-mode label collisions** in `SimulateChangePanel`: the Operation `<select>`'s accessible name concatenates all option texts, so an unanchored `getByLabel("Workout day")` or `getByLabel("Target sets")` matches both the Operation select and the intended element. Anchor every locator in that panel — `/^Workout day/`, `/^Prescription/`, `getByRole("spinbutton", { name: /^Target sets/ })`.
- **E2E assumes a seeded dev DB.** `pnpm --filter @training/db db:seed` is idempotent; run it after any local Postgres reset.
- **E2E leaves its test users and Programs in the dev DB.** Phase 0's landing test has no fixtures; Phase 4 and Phase 5's specs each create one user and one program per run and do not clean up. Acceptable at MVP because local dev uses a per-developer DB; before CI runs E2E against a shared database, this needs explicit cleanup.

## Repository structure
Created exactly per `docs/16-repository-structure.md`. `apps/mobile` intentionally absent (Phase 12+).

`packages/domain` contains:
- `src/types.ts` — `ProgramStructure` family
- `src/analysis/` — Phase-2 analysis engine + `__fixtures__/` + `__tests__/`
- `src/assessment/` — Phase-3 assessment engine + `__fixtures__/workedExample.ts` + `__tests__/`; `version.ts` (Phase 4)
- `src/goal-profiles/` — registry, HYPERTROPHY config
- `src/mutation/` — Phase-4/5 mutation surface: `types.ts`, `apply-mutation.ts`, `simulate.ts`, `diff-assessments.ts`, `diff-structures.ts`, `index.ts`, plus test files under `__tests__/`
- `scripts/run-analysis.ts`, `scripts/run-assessment.ts` — dev QA scripts

`packages/db` contains: `prisma/` (schema + `migrations/0001_init`, `migrations/0002_domain_model`), `src/repositories/` (`user.ts`, `program.ts`, `programVersion.ts`, `draft.ts`, `simulation.ts`, `exercise.ts`, `goal.ts`), `src/repositories/tests/` (`helpers.ts`, per-repository tests), `src/__tests__/immutability.test.ts`.

`packages/api` contains: `context.ts`, `trpc.ts` (Phase-4/5 errorFormatter extension), `errors.ts` (four error classes: `StaleDraftError`, `DraftNotActiveError`, `StaleSimulationError`, `SimulationAlreadyAppliedError`), `router.ts`, `index.ts`, `routers/` (`user.ts`, `program.ts`, `draft.ts`, `analysis.ts`, `programVersion.ts`, `exercise.ts`, `muscleGroup.ts`, `simulation.ts`, plus `tests/`), `schemas/` (`programStructure.ts`, `mutation.ts`), `services/` (`programService.ts`, `draftService.ts`, `programVersionService.ts`, `simulationService.ts`, `referenceDataService.ts`, `loadOwnedProgram.ts`, plus `commit.test.ts`, `stale-draft.test.ts`, `simulation.test.ts`, `stale-simulation.test.ts`, `invariant.test.ts`).

`packages/ai` contains: `src/index.ts` (unchanged stub), `src/index.test.ts`, `src/__tests__/boundary.test.ts` (Phase 4, ARCH-011 enforcement).

`apps/web` contains: `app/` (`(auth)/`, `api/auth/[...nextauth]/`, `api/trpc/[trpc]/`, `app/page.tsx`, `app/programs/`, `app/programs/[id]/`, `app/programs/[id]/build/`), `src/lib/trpc.tsx`, `src/server/auth.ts`, `components/assessment/` (Phase 4), `components/simulation/` (Phase 5), `app/app/programs/[id]/build/SimulateChangePanel.tsx` (Phase 5), `e2e/` (`landing.spec.ts`, `builder.spec.ts`, `builder-simulate.spec.ts`).

## Database schema version
- **`0001_init`** applied in Phase 0 — `User` table only.
- **`0002_domain_model`** applied in Phase 1 — adds every model from `04-database-schema.md` except `ProgramShare`, and reconciles `User` (ARCH-024).
- **No new migration in Phases 2, 3, 4, or 5.** Phases 2–3 were pure computation. Phase 4 wrote to existing tables. Phase 5 began writing the `Simulation` table (Phase-1 model, no shape change) — its three Json columns (`resultAnalysis`, `resultAssessment`, `diff`) are populated by `simulationService`.
- Migrations run locally via `pnpm --filter @training/db db:migrate`. Seeding runs automatically after `migrate dev` and is idempotent. **Production migrations remain gated** per `15-deployment.md`.

## API version
tRPC 11, mounted at `/api/trpc/[trpc]` via `fetchRequestHandler`. Routers and procedures:

- `user.getSelf`
- `program.{create, listMine, get, rename, archive}`
- `draft.{create, get, listForProgram, updateStructure, discard}`
- `analysis.previewAnalyze`
- `programVersion.{commitFromDraft, commitFromSimulation, get, listForProgram}`
- `exercise.listAll`
- `muscleGroup.listAll`
- `simulation.simulate`

`programService` enforces ownership. `draftService`, `programVersionService`, `simulationService`, and `analysis.previewAnalyze` all use `loadOwnedProgramOrThrow` so no user can read another's data (non-disclosure: NOT_FOUND, not FORBIDDEN).

`errorFormatter` allow-lists four error classes for structured projection onto `error.data.cause`: `StaleDraftError` (`STALE_DRAFT`), `DraftNotActiveError` (`DRAFT_NOT_ACTIVE`), `StaleSimulationError` (`STALE_SIMULATION`), `SimulationAlreadyAppliedError` (`SIMULATION_ALREADY_APPLIED`). Everything else omits `cause`.

## Implemented domain objects
- Phase 1: `ProgramStructure`, `WorkoutDayStructure`, `ExercisePrescriptionStructure`, `LoadScheme`, `EvidenceTag`
- Phase 2: `Analysis`, `AnalysisAxisResult`, `AxisStatus`, `AxisBandDefinition`, `AxisWeight`, `GoalProfileConfig`, `GoalProfileDefinition`, `GoalProfileRegistry`, `ExerciseReferenceData` family, `MovementPattern`, `RecoveryCostCalculator`
- Phase 3: `Severity`, `Weight`, `Leverage`, `SeverityMap`, `SeverityWeightTable`, `FitScoreBand`, `FitScoreProjection`, `AssessedAxis`, `ActionSuggestion`, `Assessment`, `AssessmentResult`, `FitScore`, `FitScoreResult`, `ComputeAssessmentOptions`, `RollUpOutcome`, `ActionTemplateResult`
- Phase 4: `MutationSpec`, `MutationOp`, `MutationErrorCode`, `MutationError` (class), `applyMutation` (function), `ASSESSMENT_ENGINE_VERSION`
- Phase 4 (api-layer): `CommitOrigin`, `StaleDraftError`, `DraftNotActiveError`, `PreviewAnalyzeResult`, `VersionWithSnapshot`, `ClientDraft` (web), `ProgramStructureInput` (zod schema)
- Phase 5: `SimulationNet`, `SimulationResult`, `StructureDiffEntry`, `WhatChangedResult`, `AssessmentDiff`, `SimulateOptions`
- Phase 5 (api-layer): `StaleSimulationError`, `SimulationAlreadyAppliedError`, `SimulateAndPersistResult`, `MutationSpecInput` (zod schema)

## Implemented product capabilities
Program CRUD through the real tRPC API and the authenticated UI. **Builder**: draft CRUD (create/discard/list, multiple concurrent per Program), structure editing, save-on-demand. **Live Analyze**: `analysis.previewAnalyze` runs the deterministic engine over a saved draft's structure and returns `Analysis` + `AssessmentResult` + `FitScoreResult` without persisting. **Commit**: `programVersion.commitFromDraft` writes a new immutable `ProgramVersion` + its normalized rows + first `Revision` + first `AssessmentSnapshot` + flips `Program.activeVersionId` + marks the source Draft `COMMITTED` — all in one transaction. The `AssessmentDisplay` component renders the fixed Final Freeze §9 order when the assessment is valid, and an honest "not yet validated" state when it isn't (which is the current state — the shipped `HYPERTROPHY_CONFIG` has all-null thresholds per ARCH-029–031).

**Simulation & Apply**: `simulation.simulate` runs the deterministic engine on the active version + a proposed `MutationSpec` and persists a `Simulation` row. `programVersion.commitFromSimulation` applies the stored mutation through the same `commitFromMutation` the manual Commit button uses, producing a new immutable `ProgramVersion` with `createdVia: "AI_APPLIED_SIMULATION"` and a `Revision` whose `sourceSimulationId` links back to the Simulation. Both `StaleSimulationError` and `SimulationAlreadyAppliedError` are rejected before the transaction opens. The Builder's `SimulateChangePanel` supports 5 of 7 `MutationSpec` ops; a `GainCostNetDisplay` component renders the `COMPUTED` branch's Net/Gain/Cost/What-Changed, the honest `CANNOT_COMPUTE` state, and the `INVALID_MUTATION` error surface.

Training execution, logging, Review, and the AI Coach are **not** implemented.

## Known bugs
None.

## Unresolved decisions
Carried from `docs/00-product-freeze-reference.md` — not to be resolved by any implementation phase, only by explicit product/sports-science input:
- Numeric thresholds for Volume/Frequency/Recovery Cost bands, per goal profile.
- Goal weights per axis, per goal profile (all `null` in `HYPERTROPHY_CONFIG.axisWeights` today).
- North-star metric measurement window.
- Whether Fit Score has previously-named bands to preserve. **Phase-3 working assumption: no.** `FitScoreBand` is `"STRONG" | "DECENT" | "NEEDS_WORK"` — generic placeholders pending the (unavailable) Assessment-Redesign source text.
- Recovery Cost's underlying formula. May need inputs beyond `ProgramVersion` structure (training age, bodyweight, sleep). Phase 5 did NOT resolve this — the placeholder `RecoveryCostCalculator` from Phase 2 is still in place.
- Whether Review should default to showing the Commit-time snapshot vs. a live recompute (ARCH-015, pending product sign-off). Phase 4 writes the Commit-time snapshot; the query side (`findLatestAssessmentSnapshotForVersion`) is in place for Phase 7 to consume.

**Phase-3-specific items (unchanged by Phases 4–5):**
- Severity map, leverage-table cells, and Fit Score projection cell contents are all provisional. Every value is marked `PROVISIONAL` in comments.
- The launch gate is implemented but not wired into CI. CI wiring is Phase 9's.

**Phase-4-specific items (unchanged by Phase 5):**
- **Cold-start E2E flake, mitigated not fixed.** `test.setTimeout(120_000)` and `expect.timeout: 15_000` absorb cold-start compile costs. Long-term fix is `webServer.command: "pnpm build && pnpm start"` — deferred.
- **E2E leaves test fixtures in the dev DB.** One user + one program per spec run. Fine for per-developer DBs; needs cleanup before CI runs E2E against shared infrastructure.
- **Success message rendered through the error banner.** `BuilderClient` reuses the `errorBanner` class for the commit-success confirmation. Red text for a success state is confusing; a distinct "status" surface is a Phase-5+ cleanup.
- **`analysis.previewAnalyze` does not surface `allAssessedAxes`.** Deliberate per Q3 (partial info presented as real risks normalization).
- **Two unused-import lint warnings** in `packages/domain/src/analysis/__tests__/recoveryCost.test.ts` (`provisionalRecoveryCostCalculator`, `TEST_CONFIG_BOUNDED`). Phase 2 leftovers; warnings, not errors.

**Phase-5-specific items:**
- **Simulate is against active version only.** The Phase 1 schema's `Simulation.baseVersionId` is a non-null FK to `ProgramVersion`; drafts are not a legal base for a Simulation. The phase file's `simulate(programId | draftId, mutation, goalId)` signature is aspirational — a future phase wanting draft-base simulations needs a schema change. Logged in ARCH-035.
- **`CANNOT_COMPUTE` extension beyond Q3's frozen shape.** Q3's shape carried only the two assessments; the addendum adds both analyses too, because the `Simulation` table's `resultAnalysis` column is non-null. Logged as the ARCH-036 addendum.
- **"Already applied" detection is a query, not a marker.** Under concurrent retries of the same `simulationId`, both calls could pass the check and both could then fail the stale-check. A future phase needing strict serialization would add a unique constraint on `Revision.sourceSimulationId` or take a `Program` row lock.
- **`SimulateChangePanel` label ambiguity.** The Operation `<select>`'s accessible name concatenates its option texts, so an unanchored `getByLabel("Workout day")` or `getByLabel("Target sets")` matches both. The E2E works around this with anchored locators. The durable fix is distinct `<label>` text per field.

**Phase-1-specific outstanding items (still open, not blockers):**
- **Sentry sourcemaps** — uploading successfully; may need org-token scope review for release tagging later.
- **Local secret rotation** after ARCH-021's Next.js security upgrade — recommended, not yet done.
- **Exercise/MuscleGroup seed coverage review** — `involvementFactor` values are provisional content data.

## Architectural decisions
See `DECISIONS.md` for the full register (ARCH-001 → ARCH-038). Phase 1 close-out added ARCH-020 – ARCH-024; Phase 2 added ARCH-025 – ARCH-028; Phase 3 added ARCH-029 – ARCH-031; Phase 4 added ARCH-032 – ARCH-033; Phase 5 close-out added ARCH-034 – ARCH-038.

The three-layer split, the AI-apply-confirmation boundary (ARCH-011), the invariant-8 "same roll-up" guarantee, and the invariant-2 "single commit function, two call sites" guarantee all remain as specified.

## Test status
- **Vitest** (all passing locally and in CI):
  - `packages/config` — 1 file, 3 tests
  - `packages/ai` — 2 files, 3 tests
  - `packages/db` — 4 files, 9 tests
  - `packages/api` — 7 files, 21 tests (Phase 5 added `services/simulation.test.ts`, `services/stale-simulation.test.ts`, `services/invariant.test.ts`)
  - `packages/domain` — 24 files, 179 tests total:
    - Phase 1: `src/index.test.ts` (1)
    - Phase 2 (9 files, 41 tests): `bandResolution` 7, `computeAnalysis` 4, `configValidation` 3, `determinism` 2, `exerciseSelectionBalance` 4, `frequency` 6, `progressionSoundness` 4, `recoveryCost` 4, `volume` 7
    - Phase 3 (7 files, 38 tests): `worked-example` 9, `dedup` 4, `shipped-config-unvalidated` 5, `fit-score` 5, `determinism` 4, `rollup-precedence` 5, `launch-gate` 6
    - Phase 4 (2 files, 42 tests): `mutation/apply-mutation` 36, `mutation/determinism` 6
    - Phase 5 (5 files, 57 tests): `mutation/simulate` 11, `mutation/diff-assessments` 13, `mutation/diff-structures` 14, `mutation/invariant` 8, `mutation/cannot-compute` 11
  - **Total Vitest**: 38 files, 215 tests
- **Playwright** (3 tests, all passing):
  - `e2e/landing.spec.ts` — Phase 0, unchanged
  - `e2e/builder.spec.ts` — Phase 4; asserts the unvalidated Assessment state per ARCH-032, then the committed version appears on the program page
  - `e2e/builder-simulate.spec.ts` — Phase 5; asserts the honest `Cannot compute Gain / Cost / Net` state (the shipped-config case per ARCH-036), the absence of Gain/Cost headings before apply, then applies and asserts version 2 appears
- `pnpm turbo run typecheck lint test build` → `Tasks: 19 successful, 19 total` (2 lint warnings, 0 errors)

## Deployment status
Deployed to Vercel.
- **Production URL**: `https://training-platform-web-alpha.vercel.app`
- **Production branch**: `main` (auto-deploys)
- **Preview**: automatic per PR (Vercel) with isolated Neon branch per PR (Neon integration installed during Phase 1)
- **Database (production)**: Neon primary branch (`ep-quiet-sea-...`) — `0002_domain_model` applied; no further migrations since
- **Database (dev)**: local Postgres (`postgresql://<user>@localhost:5432/training_platform_dev`); the remote `vercel-dev` Neon branch is preserved in `packages/db/.env.neon-dev` (gitignored)
- **CI database**: ephemeral `postgres:16` container on GitHub Actions runner
- **Sentry**: receiving events; source maps uploaded on build

## Next phase
Phase 6 — Training Execution & Evidence. Consumes the committed `ProgramVersion` (Phase 4), the `TrainingBlock` model (Phase 1), and — later in the phase — the `simulate` / `commitFromSimulation` pair (Phase 5) for any review-driven revision. Phase 6 adds: workout Session generation from an active version's WorkoutDay templates, `PerformanceRecord` logging, `Observation` capture, and the TrainingBlock auto-open / auto-close lifecycle per `08-training-execution-and-evidence.md`.

**Cross-references for Phase 6:**
- `AssessmentDisplay` (apps/web/components/assessment/AssessmentDisplay.tsx) and `GainCostNetDisplay` (apps/web/components/simulation/GainCostNetDisplay.tsx) are the two reusable assessment-shaped renderers. Phase 7's Review re-imports both directly; it does not extract them to a shared package (per 16-repository-structure.md's "no shared UI package" rule).
- `commitFromMutation`'s two call sites (`commitFromDraft`, `commitFromSimulation`) are the complete write-path surface. Phase 6 must not add a third. The full-stack invariant test in `packages/api/src/services/invariant.test.ts` guards the AI-applied path's `createdVia`/`trigger` labels.
- `packages/ai/src/__tests__/boundary.test.ts` will fail CI if Phase 6 or any later phase gives `packages/ai` an import path to `@training/api` or the commit function.
- The `Simulation` row's `createdByConversationId` column is currently always `null`. Phase 8 populates it. Phase 6 should not.

## Prohibited scope (standing, not phase-specific)
Do not build, in any phase, without an explicit new phase spec authorizing it: social feed, clans, likes, rankings, trainer marketplace, native steps tracking, native nutrition database, a second sport, population-level AI (L3), AI L2 before Phase 8's `L2_ENABLED` flag is deliberately flipped, `ProgramShare`/sharing logic before Phase 10, any numeric scientific threshold presented as validated without a cited source, any Jev/`DecisionProvider` wiring into `packages/ai`'s live orchestration path before Phase 11's trigger condition is met per `19-jev-integration-review.md` — see `ARCH-019`.

---

*Template note for the implementing AI: when you finish a phase, replace the relevant sections above with the real, current state — don't just append. This file describes "now," not a changelog; `DECISIONS.md` is where the history/rationale lives.*