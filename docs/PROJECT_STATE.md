# PROJECT_STATE.md

**This file must be updated at the end of every phase, by the AI session that implemented that phase, before that session ends.** A new AI conversation should be able to understand the current implementation state entirely from this file plus `DECISIONS.md` and the relevant `phases/phase-NN-*.md` file — without reading any previous conversation.

---

## Current phase
**Phase 5 (Simulation) is next.** Phase 4 (Builder, Live Analyze & Commit) is complete. See `docs/phases/phase-05-*.md` and construct the handoff packet with `docs/HANDOFF_TEMPLATE.md`.

## Completed phases
- **Phase 0 — Foundation.** Monorepo (`pnpm@9.12.0` + Turborepo 2.11.3), five `packages/*` stubs, `apps/web` on Next.js 15.5.18 (App Router), Auth.js v5 Credentials + JWT (no adapter), one real tRPC procedure (`user.getSelf`), landing + signup + login + empty authenticated dashboard, CI (GitHub Actions), Sentry wired for client/server/edge with verified delivery, ESLint 9 flat config + Prettier, 5 Vitest tests + 1 Playwright E2E, deployed to Vercel production + PR previews.
- **Phase 1 — Domain Model & Database.** Full Phase 1 Prisma schema applied as migration `0002_domain_model` (all models from `04-database-schema.md` except `ProgramShare`, per ARCH-017; `User` reconciled with Phase 0 per ARCH-024). Canonical seed: 18 `MuscleGroup` rows, 43 `Exercise` rows covering every `MovementPattern`, `ExerciseMuscleInvolvement` factors, one `GoalProfileDefinition` (`HYPERTROPHY`, `validated: false`, `thresholds: {}`, `sourceNote: "UNRESOLVED — SCIENTIFIC INPUT REQUIRED"`). `packages/domain` exposes `ProgramStructure` and friends as pure types. `packages/db` gains `programRepository`, `programVersionRepository`, `draftRepository`, `exerciseRepository`, `goalRepository`. `packages/api` gains `program` router with `create`/`listMine`/`get`/`rename`/`archive`, plus `programService` for ownership enforcement. Minimal Program list/create/rename/archive UI added under `apps/web/app/app/programs/`. Migration applied to production Neon branch post-merge; production signup → `/app` → `/app/programs` verified working.
- **Phase 2 — Deterministic Analysis Engine.** `packages/domain/src/analysis/` ships `computeAnalysis()` plus five axis calculators (`volume`, `frequency`, `exerciseSelectionBalance`, `progressionSoundness`, `recoveryCost`), a discriminated `AxisStatus` (`BAND` | `UNVALIDATED`) so unvalidated axes cannot be rendered as banded, and a band-resolution helper. `packages/domain/src/goal-profiles/` ships the registry interface, a registry stub, and a `HYPERTROPHY` config with all bounds `null` and `validated: false` — no numeric threshold was invented. Recovery Cost ships behind a swappable `RecoveryCostCalculator` interface with a structural-only placeholder formula. Zero Prisma/HTTP/UI imports in `packages/domain` (verified). A dev-only QA script (`packages/domain/scripts/run-analysis.ts`) replaces the "internal QA route" option.
- **Phase 3 — Assessment Engine & Fit Score.** `packages/domain/src/assessment/` ships `computeAssessment()` (leverage roll-up → classification → actions), `computeFitScore()` (rule-based ordinal projection — no numeric intermediate), the deterministic action-template registry (`actionTemplates.ts`), and the launch-gate function (`launchGate.ts`). `GoalProfileConfig` gains `severityMap`, `severityWeightTable`, `materialitySeverityThreshold`, `fitScoreProjection` (all values provisional). `HYPERTROPHY_CONFIG` is now structurally complete: every band bound still `null`, every axis weight still `null`, severity map and leverage table populated with illustrative values marked provisional. The Final Freeze worked-example test passes verbatim. `Assessment` and `FitScore` are wrapped in discriminated unions (`AssessmentResult`, `FitScoreResult`) so no consumer can read an unvalidated assessment as validated.
- **Phase 4 — Builder, Live Analyze & Commit.** `packages/domain/src/mutation/` ships `applyMutation()` (pure) and the `MutationSpec` discriminated union — the single mutation function simulate and commit share (invariant 2). `packages/domain/src/assessment/version.ts` exports `ASSESSMENT_ENGINE_VERSION = "0.1.0"`. `packages/db` extends its repositories with tx-aware write functions (`createProgramVersionInTx`, `createRevisionInTx`, `createAssessmentSnapshotInTx`, `setActiveVersionInTx`, `markDraftCommittedInTx`, `createProgramInTx`, `createGoalInTx`), a shared exported `TRANSACTION_OPTIONS`, and two new reads (`getLatestVersionForProgram`, `findLatestAssessmentSnapshotForVersion`). `packages/api` gains `programVersionService.ts` (the home of `commitFromMutation`), `draftService.ts`, `referenceDataService.ts`, an extended `programService.ts` (transactional create + auto-Goal), and five new routers (`draft`, `analysis`, `programVersion`, `exercise`, `muscleGroup`). `packages/api/src/errors.ts` adds `StaleDraftError` and `DraftNotActiveError`, projected onto the wire via an extended `errorFormatter`. `packages/ai/src/__tests__/boundary.test.ts` enforces ARCH-011 mechanically. `apps/web` gains its first client-side tRPC wiring (`src/lib/trpc.tsx`), a generic `AssessmentDisplay` component tree (`components/assessment/`), and the Builder route at `/app/programs/[id]/build`. E2E suite now has two tests. No new migration.

## Current architecture
As specified in `docs/01-architecture-recommendation.md` and `docs/02-system-architecture.md`. **As-built matches spec.** Phase 4 additions are contained to the transport/orchestration layer and the domain's mutation subdirectory; no layer boundary was crossed. `packages/domain` still has zero Prisma/HTTP/UI imports (verified by grep). The three-layer rule holds: Phase 4 added pure functions to `packages/domain`; the commit transaction, draft services, and routers all live in `packages/api`; the UI is web-only.

Phase 4 introduced the first cross-layer flow (`applyMutation` used by both simulate and commit — invariant 2). That boundary is now under real pressure; any future phase adding a second mutation path is a violation of invariant 2 and must be stopped, not negotiated.

Phase-3 additions still in effect: `ARCH-029` (severity per axis-status; leverage table is 2-D), `ARCH-030` (assessment result shapes; `allAssessedAxes`; rule-based Fit Score), `ARCH-031` (categorical `AxisWeight.weight`; axis-level fallback keys; `materialitySeverityThreshold`).

## Current stack
- **Runtime**: Node 20.x (pinned via `.nvmrc`)
- **Package manager**: pnpm 9.12.0 (via `packageManager` field; Vercel uses 9.15.9 internally)
- **Monorepo**: Turborepo 2.11.3
- **Web**: Next.js 15.5.18 (App Router), React 19.0.0 stable, React DOM 19.0.0
- **Client data**: `@trpc/react-query` + `@tanstack/react-query` (added in Phase 4 — first client-side data fetching; Phase 0/1 used RSC callers only)
- **API**: tRPC 11.19.0 + Zod 3.25.76
- **Database**: PostgreSQL (Neon in production; local Postgres in dev) via Prisma 5.22.0 — all models from Phase 1, no changes in Phases 2–4
- **Auth**: Auth.js (NextAuth v5) 5.0.0-beta.25 — Credentials provider, JWT session strategy, **no database adapter**, `bcryptjs` for password hashing (ARCH-020)
- **Testing**: Vitest 2.1.9 (unit), Playwright 1.63.0 (E2E)
- **Error monitoring**: `@sentry/nextjs` 8.55.2 — client, server, edge
- **Linting**: ESLint 9.39.5 (flat config), Prettier 3.9.9
- **Hosting**: Vercel (production + PR previews), Neon (Postgres), Sentry

*(Deviations from `01-architecture-recommendation.md`: none. Version numbers reflect what was actually installed; recommendation left exact versions open.)*

## Project conventions (learned during Phases 0–4)
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
- **`noUncheckedIndexedAccess: true` is on** in `packages/domain`. Indexed access (`arr[0]`) types as `T | undefined`. Do not silence with `as T` or `!` — either seed loops from a defined element (see `computeFitScore.ts`), or add an explicit `if (x === undefined) throw` guard.
- **Test-file paths are load-bearing.** `assessment/__tests__/*.test.ts` imports `../computeAssessment`; a file placed in `analysis/__tests__/` with the same import fails to resolve. When creating a new test file, verify the containing directory matches the import prefix (both resolve relative to the test file's location).
- **Action templates are keyed by `goalProfileKey`.** A test fixture that wants to exercise the action path must use `goalProfileKey: "HYPERTROPHY"` (or another key with templates). A synthetic key with no matching templates yields zero actions by design — that's correct behavior, not a bug.
- **Client state holding tRPC-mutated rows must not use the `@training/db` record type.** Over the wire, Dates arrive as strings (no superjson transformer configured) and Json columns arrive as optional (`field?: unknown`). Define a per-surface `Client*` type (see `ClientDraft` in `apps/web/app/app/programs/[id]/build/BuilderClient.tsx`). If a future phase genuinely needs Dates on the client, configure superjson on both ends of tRPC — noted as a Phase-5+ candidate.
- **Playwright `expect.timeout` is 15_000**, not Playwright's 5s default (`apps/web/playwright.config.ts`). `next dev` compiles each route lazily on first request; on a cold server those compiles take 2-6s each. Phase 4's Builder E2E crosses enough routes that the default 5s assertion timeout failed on cold runs. Warm dev servers finish in ~1s and are unaffected. Longer-term fix — for when the E2E suite is big enough that a pre-test build is cheaper than the flake — is `webServer.command: "pnpm build && pnpm start"`. Not done.
- **E2E assumes a seeded dev DB.** `pnpm --filter @training/db db:seed` is idempotent; run it after any local Postgres reset. `createMyProgram` throws a clear error if the seed is missing.
- **E2E leaves its test users and Programs in the dev DB.** Phase 0's landing test has no fixtures; Phase 4's Builder test creates one user and one program per run and does not clean up. Acceptable at MVP because local dev uses a per-developer DB; before CI runs E2E against a shared database, this needs an explicit cleanup or a per-run transaction rollback.

## Repository structure
Created exactly per `docs/16-repository-structure.md`. `apps/mobile` intentionally absent (Phase 12+).

`packages/domain` contains:
- `src/types.ts` — `ProgramStructure` family
- `src/analysis/` — Phase-2 analysis engine + `__fixtures__/` + `__tests__/`
- `src/assessment/` — Phase-3 assessment engine + `__fixtures__/workedExample.ts` + `__tests__/`; `version.ts` (Phase 4)
- `src/goal-profiles/` — registry, HYPERTROPHY config
- `src/mutation/` — Phase-4 mutation surface: `types.ts`, `apply-mutation.ts`, `index.ts`, `__tests__/`
- `scripts/run-analysis.ts`, `scripts/run-assessment.ts` — dev QA scripts

`packages/db` contains: `prisma/` (schema + `migrations/0001_init`, `migrations/0002_domain_model`), `src/repositories/` (`user.ts`, `program.ts`, `programVersion.ts`, `draft.ts`, `exercise.ts`, `goal.ts`), `src/repositories/tests/` (`helpers.ts`, per-repository tests), `src/__tests__/immutability.test.ts`.

`packages/api` contains: `context.ts`, `trpc.ts` (with the Phase-4 errorFormatter extension), `errors.ts`, `router.ts`, `index.ts`, `routers/` (`user.ts`, `program.ts`, `draft.ts`, `analysis.ts`, `programVersion.ts`, `exercise.ts`, `muscleGroup.ts`, plus `tests/`), `schemas/programStructure.ts`, `services/` (`programService.ts`, `draftService.ts`, `programVersionService.ts`, `referenceDataService.ts`, `loadOwnedProgram.ts`, plus `commit.test.ts` and `stale-draft.test.ts`).

`packages/ai` contains: `src/index.ts` (unchanged stub), `src/index.test.ts`, `src/__tests__/boundary.test.ts` (Phase 4, ARCH-011 enforcement).

`apps/web` contains: `app/` (`(auth)/`, `api/auth/[...nextauth]/`, `api/trpc/[trpc]/`, `app/page.tsx`, `app/programs/`, `app/programs/[id]/`, `app/programs/[id]/build/`), `src/lib/trpc.tsx` (Phase 4 — the first client-side tRPC wiring), `src/server/auth.ts`, `components/assessment/` (Phase 4 — `AssessmentDisplay.tsx`, `AxisCard.tsx`, `UnvalidatedState.tsx`, `assessment.module.css`), `e2e/` (`landing.spec.ts`, `builder.spec.ts`).

## Database schema version
- **`0001_init`** applied in Phase 0 — `User` table only.
- **`0002_domain_model`** applied in Phase 1 — adds every model from `04-database-schema.md` except `ProgramShare`, and reconciles `User` (ARCH-024).
- **No new migration in Phases 2, 3, or 4.** Phases 2–3 were pure computation. Phase 4 writes to existing tables (`ProgramVersion`, `WorkoutDay`, `ExercisePrescription`, `Revision`, `AssessmentSnapshot`, `ProgramDraft`, `Program`, `Goal`) using the shapes Phase 1 already declared.
- Migrations run locally via `pnpm --filter @training/db db:migrate`. Seeding runs automatically after `migrate dev` and is idempotent. **Production migrations remain gated** per `15-deployment.md`; PR previews get isolated Neon branches.

## API version
tRPC 11, mounted at `/api/trpc/[trpc]` via `fetchRequestHandler`. Routers and procedures:

- `user.getSelf`
- `program.{create, listMine, get, rename, archive}` — Phase 4 change: `create` now also creates the initial Goal in the same transaction (Q5 resolution)
- `draft.{create, get, listForProgram, updateStructure, discard}` — Phase 4
- `analysis.previewAnalyze` — Phase 4; non-persisting
- `programVersion.{commitFromDraft, get, listForProgram}` — Phase 4
- `exercise.listAll` — Phase 4
- `muscleGroup.listAll` — Phase 4

`programService` enforces ownership. `draftService`, `programVersionService`, and `analysis.previewAnalyze` all use `loadOwnedProgramOrThrow` so no user can read another's data (non-disclosure: NOT_FOUND, not FORBIDDEN).

## Implemented domain objects
- Phase 1: `ProgramStructure`, `WorkoutDayStructure`, `ExercisePrescriptionStructure`, `LoadScheme`, `EvidenceTag`
- Phase 2: `Analysis`, `AnalysisAxisResult`, `AxisStatus` (discriminated union), `AxisBandDefinition`, `AxisWeight` (Phase-3 shape: `Weight | null`), `GoalProfileConfig` (Phase-3 extended shape), `GoalProfileDefinition`, `GoalProfileRegistry`, `ExerciseReferenceData` family, `MovementPattern`, `RecoveryCostCalculator`
- Phase 3: `Severity`, `Weight`, `Leverage`, `SeverityMap`, `SeverityWeightTable`, `FitScoreBand`, `FitScoreProjection`, `AssessedAxis`, `ActionSuggestion`, `Assessment`, `AssessmentResult`, `FitScore`, `FitScoreResult`, `ComputeAssessmentOptions`, `RollUpOutcome`, `ActionTemplateResult`
- Phase 4: `MutationSpec`, `MutationOp`, `MutationErrorCode`, `MutationError` (class), `applyMutation` (function), `ASSESSMENT_ENGINE_VERSION`
- Phase 4 (api-layer, not domain): `CommitOrigin`, `StaleDraftError`, `DraftNotActiveError`, `PreviewAnalyzeResult`, `VersionWithSnapshot`, `ClientDraft` (web), `ProgramStructureInput` (zod schema)

## Implemented product capabilities
Program CRUD through the real tRPC API and the authenticated UI. **Builder**: draft CRUD (create/discard/list, multiple concurrent per Program), structure editing (workout days, exercises, sets/reps/load scheme, reorder), save-on-demand. **Live Analyze**: `analysis.previewAnalyze` runs the deterministic engine over a saved draft's structure and returns `Analysis` + `AssessmentResult` + `FitScoreResult` without persisting. **Commit**: `programVersion.commitFromDraft` writes a new immutable `ProgramVersion` + its normalized `WorkoutDay`/`ExercisePrescription` rows + first `Revision` + first `AssessmentSnapshot` + flips `Program.activeVersionId` + marks the source Draft `COMMITTED` — all in one transaction (ARCH-026 timeouts). The `AssessmentDisplay` component renders the fixed Final Freeze §9 order (Overall → Strengths → Attention → Biggest Opportunity → Actions) when the assessment is valid, and an honest "not yet validated" state when it isn't (which is the current state — the shipped `HYPERTROPHY_CONFIG` has all-null thresholds per ARCH-029–031).

Training execution, logging, Review, Simulation, and the AI Coach are **not** implemented. The `AI_APPLIED_SIMULATION` branch of `commitFromMutation` throws deliberately — Phase 8 replaces it with the equivalent simulation-based check.

## Known bugs
None.

## Unresolved decisions
Carried from `docs/00-product-freeze-reference.md` — not to be resolved by any implementation phase, only by explicit product/sports-science input:
- Numeric thresholds for Volume/Frequency/Recovery Cost bands, per goal profile.
- Goal weights per axis, per goal profile (all `null` in `HYPERTROPHY_CONFIG.axisWeights` today).
- North-star metric measurement window.
- Whether Fit Score has previously-named bands to preserve. **Phase-3 working assumption: no.** `FitScoreBand` is `"STRONG" | "DECENT" | "NEEDS_WORK"` — generic placeholders pending the (unavailable) Assessment-Redesign source text.
- Recovery Cost's underlying formula. May need inputs beyond `ProgramVersion` structure (training age, bodyweight, sleep). Phase 4 did NOT resolve this — the placeholder `RecoveryCostCalculator` from Phase 2 is still in place.
- Whether Review should default to showing the Commit-time snapshot vs. a live recompute (ARCH-015, pending product sign-off). Phase 4 writes the Commit-time snapshot; the query side (`findLatestAssessmentSnapshotForVersion`) is in place for Phase 7 to consume.

**Phase-3-specific items (unchanged by Phase 4):**
- Severity map, leverage-table cells, and Fit Score projection cell contents are all provisional. Every value is marked `PROVISIONAL` in comments.
- The launch gate is implemented but not wired into CI. CI wiring is Phase 9's.

**Phase-4-specific items:**
- **Cold-start E2E flake, mitigated not fixed.** The Builder E2E crosses 5 routes on a cold `next dev` server; each pays a lazy-compile cost of 2-6s. `test.setTimeout(120_000)` and `expect.timeout: 15_000` absorb this. Warm runs take 4-6s; three consecutive warm runs passed. The underlying issue remains: cold-start runs occasionally exceed even these budgets. The long-term fix is `webServer.command: "pnpm build && pnpm start"` — deferred because it makes every local test run pay a full build.
- **E2E leaves test fixtures in the dev DB.** One user + one program per Builder test run. Fine for per-developer DBs; needs cleanup before CI runs E2E against shared infrastructure.
- **Success message rendered through the error banner.** `BuilderClient` reuses the `errorBanner` class for the commit-success confirmation ("Committed as version 1."). Red text for a success state is confusing; a distinct "status" surface is a Phase-5+ cleanup.
- **`analysis.previewAnalyze` does not surface `allAssessedAxes`.** When an assessment is UNVALIDATED, the panel shows only the reason string; the inner `Assessment.allAssessedAxes` is present but not rendered. Deliberate per Q3 (partial info presented as real risks normalization), but the info is available if a future phase decides to surface it.
- **Two unused-import lint warnings** in `packages/domain/src/analysis/__tests__/recoveryCost.test.ts` (`provisionalRecoveryCostCalculator`, `TEST_CONFIG_BOUNDED`). Phase 2 leftovers; warnings, not errors. Trivial cleanup.

Phase-1-specific outstanding items (still open, not blockers):
- **Sentry sourcemaps** — uploading successfully; may need org-token scope review for release tagging later.
- **Local secret rotation** after ARCH-021's Next.js security upgrade — recommended, not yet done.
- **Exercise/MuscleGroup seed coverage review** — `involvementFactor` values are provisional content data.

## Architectural decisions
See `DECISIONS.md` for the full register (ARCH-001 → ARCH-033). Phase 1 close-out added ARCH-020 – ARCH-024; Phase 2 close-out added ARCH-025 – ARCH-028; Phase 3 close-out added ARCH-029 – ARCH-031; **Phase 4 close-out added ARCH-032 – ARCH-033.**

The three-layer split, the AI-apply-confirmation boundary (ARCH-011), and the invariant-8 "same roll-up" guarantee remain as specified.

## Test status
- **Vitest** (all passing locally and in CI):
  - `packages/config` — 1 file, 3 tests
  - `packages/ai` — 2 files, 3 tests (Phase 4 added `boundary.test.ts`, 2 tests)
  - `packages/db` — 4 files, 9 tests (Phase 4 added `__tests__/immutability.test.ts`, 1 test)
  - `packages/api` — 4 files, 9 tests (Phase 4 added `services/commit.test.ts` and `services/stale-draft.test.ts`, 4 tests)
  - `packages/domain` — 19 files, 122 tests total:
    - Phase 1: `src/index.test.ts` (1)
    - Phase 2 (9 files, 41 tests): `bandResolution` 7, `computeAnalysis` 4, `configValidation` 3, `determinism` 2, `exerciseSelectionBalance` 4, `frequency` 6, `progressionSoundness` 4, `recoveryCost` 4, `volume` 7
    - Phase 3 (7 files, 38 tests): `worked-example` 9, `dedup` 4, `shipped-config-unvalidated` 5, `fit-score` 5, `determinism` 4, `rollup-precedence` 5, `launch-gate` 6
    - Phase 4 (2 files, 42 tests): `mutation/apply-mutation` 36, `mutation/determinism` 6
  - **Total Vitest**: 30 files, 146 tests
- **Playwright** (2 tests):
  - `e2e/landing.spec.ts` — Phase 0, unchanged
  - `e2e/builder.spec.ts` — Phase 4; asserts the unvalidated Assessment state per ARCH-032, then the committed version appears on the program page
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
Phase 5 — Simulation. Consumes Phase 4's `applyMutation` (which the commit path already uses), `commitFromMutation`'s signature (which has a dormant `AI_APPLIED_SIMULATION` branch awaiting a real implementation), and the `Assessment` shape (`assessedAxes` is already available via `allAssessedAxes`). Adds `simulate()`, `SimulationResult`, Gain/Cost/Net, and What-Changed — all pure `packages/domain` code, per `07-versioning-and-simulation.md`. The `Simulation` Prisma table exists from Phase 1.

**Cross-references for Phase 5:**
- `ActionSuggestion.rootCauseKey` (`<axisType>:<verb>-<target>`) is the bridge from assessment actions to `MutationSpec` — Phase 5 (and Phase 8's Coach) should map from these keys, not invent a parallel naming.
- `applyMutation` is the only mutation function. Any second one — including a "just for simulation" version — is an invariant-2 violation. `simulate()` and `commitFromMutation` MUST share it.
- `commitFromMutation`'s `AI_APPLIED_SIMULATION` branch currently throws. Phase 5 may open the branch (if it implements the AI-apply path) or leave it for Phase 8. The stale-state check pattern is set by the MANUAL_COMMIT path (`draft.baseVersionId` vs. `program.activeVersionId`); the AI path uses `simulation.baseVersionId` against the same program pointer.
- `AssessmentDisplay` lives at `apps/web/components/assessment/AssessmentDisplay.tsx`. Phases 7 (Review) and 8 (Coach) re-import it; they do not extract it to a shared package (per `16-repository-structure.md`'s "no shared UI package" rule).
- `packages/ai/src/__tests__/boundary.test.ts` will fail CI if Phase 5 or any later phase gives `packages/ai` an import path to `@training/api` or the commit function.

## Prohibited scope (standing, not phase-specific)
Do not build, in any phase, without an explicit new phase spec authorizing it: social feed, clans, likes, rankings, trainer marketplace, native steps tracking, native nutrition database, a second sport, population-level AI (L3), AI L2 before Phase 8's `L2_ENABLED` flag is deliberately flipped, `ProgramShare`/sharing logic before Phase 10, any numeric scientific threshold presented as validated without a cited source, any Jev/`DecisionProvider` wiring into `packages/ai`'s live orchestration path before Phase 11's trigger condition is met per `19-jev-integration-review.md` — see `ARCH-019`.

---

*Template note for the implementing AI: when you finish a phase, replace the relevant sections above with the real, current state — don't just append. This file describes "now," not a changelog; `DECISIONS.md` is where the history/rationale lives.*