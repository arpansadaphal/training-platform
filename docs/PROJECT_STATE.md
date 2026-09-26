# PROJECT_STATE.md

**This file must be updated at the end of every phase, by the AI session that implemented that phase, before that session ends.** A new AI conversation should be able to understand the current implementation state entirely from this file plus `DECISIONS.md` and the relevant `phases/phase-NN-*.md` file — without reading any previous conversation.

---

## Current phase
**Phase 3 (Assessment Engine) is next.** Phase 2 (Deterministic Analysis Engine) is complete. See `docs/phases/phase-03-*.md` and construct the handoff packet with `docs/HANDOFF_TEMPLATE.md`.

## Completed phases
- **Phase 0 — Foundation.** Monorepo (`pnpm@9.12.0` + Turborepo 2.11.3), five `packages/*` stubs, `apps/web` on Next.js 15.5.18 (App Router), Auth.js v5 Credentials + JWT (no adapter), one real tRPC procedure (`user.getSelf`), landing + signup + login + empty authenticated dashboard, CI (GitHub Actions), Sentry wired for client/server/edge with verified delivery, ESLint 9 flat config + Prettier, 5 Vitest tests (one per package) + 1 Playwright E2E, deployed to Vercel production + PR previews.
- **Phase 1 — Domain Model & Database.** Full Phase 1 Prisma schema applied as migration `0002_domain_model` (all models from `04-database-schema.md` except `ProgramShare`, per ARCH-017; `User` reconciled with Phase 0 per ARCH-024). Canonical seed: 18 `MuscleGroup` rows, 43 `Exercise` rows covering every `MovementPattern`, `ExerciseMuscleInvolvement` factors, one `GoalProfileDefinition` (`HYPERTROPHY`, `validated: false`, `thresholds: {}`, `sourceNote: "UNRESOLVED — SCIENTIFIC INPUT REQUIRED"`). `packages/domain` exposes `ProgramStructure` and friends as pure types (no computation logic). `packages/db` gains `programRepository`, `programVersionRepository`, `draftRepository`, `exerciseRepository`, `goalRepository` — all returning plain TS shapes, no Prisma types escape. `packages/api` gains `program` router with `create`/`listMine`/`get`/`rename`/`archive`, plus `programService` for ownership enforcement (non-owner gets NOT_FOUND, not FORBIDDEN). Minimal Program list/create/rename/archive UI added under `apps/web/app/app/programs/`. Migration applied to production Neon branch post-merge; production signup → `/app` → `/app/programs` verified working.
- **Phase 2 — Deterministic Analysis Engine.** `packages/domain/src/analysis/` now ships `computeAnalysis()` plus five axis calculators (`volume`, `frequency`, `exerciseSelectionBalance`, `progressionSoundness`, `recoveryCost`), a discriminated `AxisStatus` (`BAND` | `UNVALIDATED`) so unvalidated axes cannot be rendered as banded, and a band-resolution helper. `packages/domain/src/goal-profiles/` ships the registry interface, a registry stub, and a `HYPERTROPHY` config with all bounds `null` and `validated: false` — no numeric threshold was invented. Recovery Cost ships behind a swappable `RecoveryCostCalculator` interface with a structural-only placeholder formula, explicitly commented as provisional pending sports-science input. Zero Prisma/HTTP/UI imports in `packages/domain` (verified). 42 new Vitest tests across 10 files, all passing. A dev-only QA script (`packages/domain/scripts/run-analysis.ts`) replaces the "internal QA route" option — no web-exposed surface was created, so nothing needs hiding before Phase 9.

## Current architecture
As specified in `docs/01-architecture-recommendation.md` and `docs/02-system-architecture.md`. **As-built matches spec** — no architectural deviations. The three-layer rule (`packages/domain` pure, `packages/db` Prisma-only, `packages/api`/`packages/ai` orchestrate) holds: Phase 2 added pure functions only; no layer boundary was crossed.

## Current stack
- **Runtime**: Node 20.x (pinned via `.nvmrc`)
- **Package manager**: pnpm 9.12.0 (via `packageManager` field; Vercel uses 9.15.9 internally)
- **Monorepo**: Turborepo 2.11.3
- **Web**: Next.js 15.5.18 (App Router), React 19.0.0 stable, React DOM 19.0.0
- **API**: tRPC 11.19.0 + Zod 3.25.76
- **Database**: PostgreSQL (Neon) via Prisma 5.22.0 — `User`, `GoalProfileDefinition`, `Goal`, `Program`, `ProgramDraft`, `ProgramVersion`, `WorkoutDay`, `ExercisePrescription`, `Exercise`, `MuscleGroup`, `ExerciseMuscleInvolvement`, `Revision`, `Simulation`, `AssessmentSnapshot`, `TrainingBlock`, `Session`, `PerformanceRecord`, `Observation`, `Constraint`, `TemporaryConstraint`, `AIConversation`, `AIMessage`. `ProgramShare` deliberately absent (Phase 10).
- **Auth**: Auth.js (NextAuth v5) 5.0.0-beta.25 — Credentials provider, JWT session strategy, **no database adapter**, `bcryptjs` for password hashing (ARCH-020)
- **Testing**: Vitest 2.1.9 (unit), Playwright 1.63.0 (E2E)
- **Error monitoring**: `@sentry/nextjs` 8.55.2 — client, server, edge
- **Linting**: ESLint 9.39.5 (flat config), Prettier 3.9.9
- **Hosting**: Vercel (production + PR previews), Neon (Postgres), Sentry

*(Deviations from `01-architecture-recommendation.md`: none. Version numbers reflect what was actually installed; recommendation left exact versions open.)*

## Project conventions (learned during Phases 0–2)
- **Node version**: pinned to 20 via `.nvmrc`. Node 22+ causes Vitest worker crashes ("Worker exited unexpectedly"). Run `nvm use 20` in a fresh shell before any `pnpm` command.
- **Turbo env vars**: declared via `globalEnv` in `turbo.json`. Turbo 2.x strips undeclared env vars from task subprocesses and excludes them from cache keys. Any new env var the app reads at runtime or build time must be added to `globalEnv`.
- **`turbo.json` `typecheck`** depends on `["^build", "build"]` — deliberate, prevents a race where `tsc` reads a half-regenerated `apps/web/.next/types/` directory when Turbo runs `build` and `typecheck` in parallel.
- **Relative imports in `packages/*`**: extensionless (`from "./router"`, not `"./router.js"`). Next.js webpack does not rewrite `.js` → `.ts` in `transpilePackages`.
- **Env files**: three locations — root `.env.local`, `apps/web/.env.local`, `packages/db/.env`. Next.js reads `apps/web/`; Prisma CLI reads `packages/db/`. Add new env vars to all three for local dev.
- **Prisma on Vercel**: `packages/db/prisma/schema.prisma` declares `binaryTargets = ["native", "rhel-openssl-3.0.x"]` and `apps/web/next.config.js` uses `@prisma/nextjs-monorepo-workaround-plugin`. Both required together (ARCH-022).
- **Prisma `$transaction`**: passes explicit `{ timeout: 20000, maxWait: 10000 }` via an exported `TRANSACTION_OPTIONS` const in repository files (ARCH-026).
- **`as Prisma.InputJsonValue` casts** in repository files are intentional boundary enforcement (ARCH-010). Do not replace with input-signature typing that would leak Prisma types into the repository's public API.
- **Branch convention**: each phase on its own branch named `phase-NN-<short-name>`, merged to `main` via PR.
- **Production migrations** are a gated explicit step, not auto-run on deploy — per `15-deployment.md`.
- **After editing any `package.json`, run `pnpm install` and commit `pnpm-lock.yaml`.** CI and Vercel use `--frozen-lockfile`; an out-of-date lockfile fails both. (Hit during Phase 2 when `tsx` was added to `packages/domain` but the lockfile wasn't regenerated.)

## Repository structure
Created exactly per `docs/16-repository-structure.md`. `apps/mobile` intentionally absent (Phase 12+). All five `packages/*` contain non-trivial code: `packages/domain` (Phase 1 types + Phase 2 analysis engine + goal-profile registry), `packages/db` (Prisma schema + 5 repositories + seed), `packages/api` (user + program routers, programService), `packages/ai` (unchanged stub), `packages/config` (unchanged).

## Database schema version
- **`0001_init`** applied in Phase 0 — `User` table only.
- **`0002_domain_model`** applied in Phase 1 — adds every model from `04-database-schema.md` except `ProgramShare`, and reconciles `User`: `name` → `displayName` (required), `passwordHash` made nullable, `updatedAt` retained (ARCH-024). This is the largest single migration in the roadmap; every later phase adds small incremental migrations on top.
- **No new migration in Phase 2** — analysis is pure computation over `ProgramStructure`, not persisted data.
- Migrations run locally via `pnpm --filter @training/db db:migrate`. Seeding runs automatically after `migrate dev` and is idempotent. **Production migrations remain gated** per `15-deployment.md`; PR previews get isolated Neon branches via the Neon integration.

## API version
tRPC 11, mounted at `/api/trpc/[trpc]` via `fetchRequestHandler`. Routers: `user.getSelf`, and `program.{create,listMine,get,rename,archive}`. `programService` enforces ownership: non-owner receives NOT_FOUND on any read/mutation. **Phase 2 added no API surface** — the analysis engine is not yet exposed via tRPC.

## Implemented domain objects
Phase 1's `ProgramStructure` family (`ProgramStructure`, `WorkoutDayStructure`, `ExercisePrescriptionStructure`, `LoadScheme`, `EvidenceTag`) plus Phase 2's `Analysis`, `AnalysisAxisResult`, `AxisStatus` (discriminated union: `BAND` | `UNVALIDATED`), `AxisBandDefinition`, `AxisWeight`, `GoalProfileConfig`, `GoalProfileDefinition`, `GoalProfileRegistry`, `ExerciseReferenceData` (`ExerciseReference`, `MuscleGroupReference`, `ExerciseMuscleInvolvementReference`), `MovementPattern` (plain TS union mirroring the Prisma enum's string values), and `RecoveryCostCalculator` (swappable interface). No Assessment/Mutation/Simulation yet — those are Phase 3+.

## Implemented product capabilities
Program CRUD (create / list / rename / archive) through the real tRPC API and a minimal authenticated UI. The deterministic Analysis engine is implemented and unit-tested but **not yet exposed via any API or UI** — Phase 2's spec explicitly scoped it to pure computation plus a dev-only QA script. No Draft editing, no Assessment, no commit flow, no training execution, no AI Coach.

## Known bugs
None.

## Unresolved decisions
Carried from `docs/00-product-freeze-reference.md` — not to be resolved by any implementation phase, only by explicit product/sports-science input:
- Numeric thresholds for Volume/Frequency/Recovery Cost bands, per goal profile.
- Goal weights per axis, per goal profile.
- North-star metric measurement window.
- Whether Fit Score has previously-named bands to preserve.
- Recovery Cost's underlying formula (may need inputs beyond ProgramVersion structure — flagged in `05-analysis-engine.md`).
- Whether Review should default to showing the Commit-time snapshot vs. a live recompute — architecture recommendation made (`ARCH-015`), pending product sign-off.

**Phase-2-specific unresolved item:**
- **Recovery Cost formula gap — unresolved.** Phase 2 implemented the structural-only placeholder behind a swappable `RecoveryCostCalculator` interface and did NOT resolve the formula question. The formula may need inputs beyond `ProgramStructure` (training age, bodyweight, sleep). Flagged for Phase 3 (which needs a `severity` mapping regardless of whether the formula is finalized) and for explicit sports-science review.

Phase-1-specific outstanding items (still open, not blockers):
- **Local Postgres for tests** — `packages/db` tests hit the remote `vercel-dev` Neon branch; suite takes 3–4 min. Recommended before Phase 3's test count grows further.
- **Sentry sourcemaps** — uploading successfully now; may need org-token scope review for release tagging later.
- **Local secret rotation** after ARCH-021's Next.js security upgrade — still recommended, not yet done.
- **Exercise/MuscleGroup seed coverage review** — `involvementFactor` values are provisional content data, not validated thresholds.

## Architectural decisions
See `DECISIONS.md` for the full register (ARCH-001 → ARCH-028). Phase 1 close-out added ARCH-020 through ARCH-024; Phase 2 close-out added ARCH-025 through ARCH-028 (Turbo `globalEnv`, Prisma transaction options, CI Postgres container, `AnalysisAxisResult` discriminated union). The three-layer split and the AI-apply-confirmation boundary from the reference docs remain as specified.

## Test status
- **Vitest** (all passing locally and in CI):
  - `packages/config` — 1 file, 3 tests
  - `packages/ai` — 1 file, 1 test
  - `packages/db` — 3 files, 8 tests
  - `packages/api` — 2 files, 5 tests
  - `packages/domain` — 1 Phase-1 file + 10 Phase-2 files, 42 tests (`bandResolution` 7, `volume` 7, `frequency` 6, `exerciseSelectionBalance` 4, `progressionSoundness` 4, `recoveryCost` 4, `computeAnalysis` 4, `determinism` 2, `configValidation` 3)
  - **Total**: 17 files, 59 tests
- **Playwright**: 1 E2E (`e2e/landing.spec.ts`) — unchanged.
- `pnpm turbo run typecheck lint test build` → `Tasks: 19 successful, 19 total`.

## Deployment status
Deployed to Vercel.
- **Production URL**: `https://training-platform-web-alpha.vercel.app`
- **Production branch**: `main` (auto-deploys)
- **Preview**: automatic per PR (Vercel) with isolated Neon branch per PR (Neon integration installed during Phase 1)
- **Database (production)**: Neon primary branch (`ep-quiet-sea-...`) — `0002_domain_model` applied
- **Database (dev)**: `vercel-dev` Neon branch (`ep-flat-bread-...`)
- **CI database**: ephemeral `postgres:16` container on GitHub Actions runner — `prisma migrate deploy` + seed before tests
- **Sentry**: receiving events; source maps uploaded on build (verified during Phase 1)

## Next phase
Phase 3 — Assessment Engine. Consumes Phase 2's `Analysis` and the goal-profile registry. Implements the leverage roll-up, Fit Score (derived from the same roll-up per invariant 8), Strengths/Attention/Opportunity, and the first real `GoalProfileConfig` for HYPERTROPHY (which requires SCIENTIFIC INPUT before `validated: true`). Do NOT invent numeric thresholds. Use `docs/HANDOFF_TEMPLATE.md`. Uploads required: `phases/phase-03-*.md`, `06-assessment-engine.md`, and (for cross-reference) `03-domain-model.md` + `05-analysis-engine.md`.

## Prohibited scope (standing, not phase-specific)
Do not build, in any phase, without an explicit new phase spec authorizing it: social feed, clans, likes, rankings, trainer marketplace, native steps tracking, native nutrition database, a second sport, population-level AI (L3), AI L2 before Phase 8's `L2_ENABLED` flag is deliberately flipped, `ProgramShare`/sharing logic before Phase 10, any numeric scientific threshold presented as validated without a cited source, any Jev/`DecisionProvider` wiring into `packages/ai`'s live orchestration path before Phase 11's trigger condition is met per `19-jev-integration-review.md` — see `ARCH-019`.

---

*Template note for the implementing AI: when you finish a phase, replace the relevant sections above with the real, current state — don't just append. This file describes "now," not a changelog; `DECISIONS.md` is where the history/rationale lives.*