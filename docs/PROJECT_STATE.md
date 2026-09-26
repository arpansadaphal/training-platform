# PROJECT_STATE.md

**This file must be updated at the end of every phase, by the AI session that implemented that phase, before that session ends.** A new AI conversation should be able to understand the current implementation state entirely from this file plus `DECISIONS.md` and the relevant `phases/phase-NN-*.md` file — without reading any previous conversation.

---

## Current phase
**Phase 2 (Analysis Engine) is next.** Phase 1 (Domain Model & Database) is complete and migrated to production. See `docs/phases/phase-02-*.md` and construct the handoff packet with `docs/HANDOFF_TEMPLATE.md`.

## Completed phases
- **Phase 0 — Foundation.** Monorepo (`pnpm@9.12.0` + Turborepo 2.11.3), five `packages/*` stubs, `apps/web` on Next.js 15.5.18 (App Router), Auth.js v5 Credentials + JWT (no adapter), one real tRPC procedure (`user.getSelf`), landing + signup + login + empty authenticated dashboard, CI (GitHub Actions), Sentry wired for client/server/edge with verified delivery, ESLint 9 flat config + Prettier, 5 Vitest tests (one per package) + 1 Playwright E2E, deployed to Vercel production + PR previews.
- **Phase 1 — Domain Model & Database.** Full Phase 1 Prisma schema applied as migration `0002_domain_model` (all models from `04-database-schema.md` except `ProgramShare`, per ARCH-017; `User` reconciled with Phase 0 per ARCH-024). Canonical seed: 18 `MuscleGroup` rows, 43 `Exercise` rows covering every `MovementPattern`, `ExerciseMuscleInvolvement` factors, one `GoalProfileDefinition` (`HYPERTROPHY`, `validated: false`, `thresholds: {}`, `sourceNote: "UNRESOLVED — SCIENTIFIC INPUT REQUIRED"`). `packages/domain` exposes `ProgramStructure` and friends as pure types (no computation logic). `packages/db` gains `programRepository`, `programVersionRepository`, `draftRepository`, `exerciseRepository`, `goalRepository` — all returning plain TS shapes, no Prisma types escape. `packages/api` gains `program` router with `create`/`listMine`/`get`/`rename`/`archive`, plus `programService` for ownership enforcement (non-owner gets NOT_FOUND, not FORBIDDEN). Minimal Program list/create/rename/archive UI added under `apps/web/app/app/programs/`.

## Current architecture
As specified in `docs/01-architecture-recommendation.md` and `docs/02-system-architecture.md`. **As-built matches spec** — no architectural deviations to record. The three-layer rule (`packages/domain` pure, `packages/db` Prisma-only, `packages/api`/`packages/ai` orchestrate) is enforced by package boundaries and holds as designed.

## Current stack
- **Runtime**: Node 20.x (pinned via `.nvmrc`)
- **Package manager**: pnpm 9.12.0 (via `packageManager` field; Vercel uses 9.15.9 internally)
- **Monorepo**: Turborepo 2.11.3
- **Web**: Next.js 15.5.18 (App Router), React 19.0.0 stable, React DOM 19.0.0
- **API**: tRPC 11.19.0 + Zod 3.25.76
- **Database**: PostgreSQL (Neon) via Prisma 5.22.0 — `User`, `GoalProfileDefinition`, `Goal`, `Program`, `ProgramDraft`, `ProgramVersion`, `WorkoutDay`, `ExercisePrescription`, `Exercise`, `MuscleGroup`, `ExerciseMuscleInvolvement`, `Revision`, `Simulation`, `AssessmentSnapshot`, `TrainingBlock`, `Session`, `PerformanceRecord`, `Observation`, `Constraint`, `TemporaryConstraint`, `AIConversation`, `AIMessage`. `ProgramShare` deliberately absent (Phase 10).
- **Auth**: Auth.js (NextAuth v5) 5.0.0-beta.25 — Credentials provider, JWT session strategy, **no database adapter**, `bcryptjs` for password hashing (see ARCH-020)
- **Testing**: Vitest 2.1.9 (unit), Playwright 1.63.0 (E2E)
- **Error monitoring**: `@sentry/nextjs` 8.55.2 — client, server, edge
- **Linting**: ESLint 9.39.5 (flat config), Prettier 3.9.9
- **Hosting**: Vercel (production + PR previews), Neon (Postgres), Sentry

*(Deviations from `01-architecture-recommendation.md`: none. Version numbers reflect what was actually installed; recommendation left exact versions open.)*

## Project conventions (learned during Phases 0–1)
- **Node version**: pinned to 20 via `.nvmrc`. Node 22+ causes Vitest worker crashes ("Worker exited unexpectedly"). Run `nvm use 20` in a fresh shell before any `pnpm` command.
- **Turbo env vars**: declared via `globalEnv` in `turbo.json`. Turbo 2.x strips undeclared env vars from task subprocesses and excludes them from cache keys. Any new env var the app reads at runtime or build time must be added to `globalEnv`.
- **`turbo.json` `typecheck`** depends on `["^build", "build"]` — deliberate, prevents a race where `tsc` reads a half-regenerated `apps/web/.next/types/` directory when Turbo runs `build` and `typecheck` in parallel.
- **Relative imports in `packages/*`**: extensionless (`from "./router"`, not `"./router.js"`). Next.js webpack does not rewrite `.js` → `.ts` in `transpilePackages`.
- **Env files**: three locations — root `.env.local`, `apps/web/.env.local`, `packages/db/.env`. Next.js reads `apps/web/`; Prisma CLI reads `packages/db/`. Add new env vars to all three for local dev.
- **Prisma on Vercel**: `packages/db/prisma/schema.prisma` declares `binaryTargets = ["native", "rhel-openssl-3.0.x"]` and `apps/web/next.config.js` uses `@prisma/nextjs-monorepo-workaround-plugin`. Both required together (ARCH-022).
- **Prisma `$transaction`**: passes explicit `{ timeout: 20000, maxWait: 10000 }` via an exported `TRANSACTION_OPTIONS` const in repository files. Remote Neon latency can exceed Prisma's 5s default.
- **`as Prisma.InputJsonValue` casts** in repository files are intentional boundary enforcement (ARCH-010). Do not replace with input-signature typing that would leak Prisma types into the repository's public API.
- **Branch convention**: each phase on its own branch named `phase-NN-<short-name>`, merged to `main` via PR. Never commit phase work directly to `main`.
- **Production migrations** are a gated explicit step, not auto-run on deploy — per `15-deployment.md`.

## Repository structure
Created exactly per `docs/16-repository-structure.md`. `apps/mobile` intentionally absent (Phase 12+, per roadmap). All five `packages/*` now contain non-trivial Phase 1 code: `packages/domain` (types only), `packages/db` (Prisma schema + 5 repositories + seed), `packages/api` (user + program routers, programService), `packages/ai` (unchanged stub), `packages/config` (unchanged).

## Database schema version
- **`0001_init`** applied in Phase 0 — `User` table only.
- **`0002_domain_model`** applied in Phase 1 — adds every model from `04-database-schema.md` except `ProgramShare`, and reconciles `User`: `name` → `displayName` (required), `passwordHash` made nullable, `updatedAt` retained (see ARCH-024). This is the largest single migration in the roadmap; every later phase adds small incremental migrations on top.
- Migrations run locally via `pnpm --filter @training/db db:migrate`. Seeding runs automatically after `migrate dev` (`prisma.seed` in `packages/db/package.json`) and is idempotent. **Production migrations remain gated as an explicit CI/CD step** per `15-deployment.md`; the Neon integration is installed, so PR previews get isolated Neon branches and do not touch production.

## API version
tRPC 11, mounted at `/api/trpc/[trpc]` via `fetchRequestHandler`. Routers: `user.getSelf`, and `program.{create,listMine,get,rename,archive}`. `programService` enforces ownership: non-owner receives NOT_FOUND on any read/mutation.

## Implemented domain objects
`ProgramStructure`, `WorkoutDayStructure`, `ExercisePrescriptionStructure`, `LoadScheme`, `EvidenceTag` (types only, in `packages/domain/src/types.ts`). Every Prisma model from `0002_domain_model` is now persisted; repository functions exist for `Program`, `ProgramVersion`, `ProgramDraft`, `Exercise`/`MuscleGroup`/`ExerciseMuscleInvolvement` (read-only), and `Goal`/`GoalProfileDefinition`. No computation logic yet — Analysis/Assessment/Mutation/Simulation arrive in Phases 2–3.

## Implemented product capabilities
Program CRUD (create / list / rename / archive) through the real tRPC API and a minimal authenticated UI under `apps/web/app/app/programs/`. No Draft editing, no Analysis, no Assessment, no commit flow, no training execution, no AI Coach — all deferred to their named phases.

## Known bugs
None. Phase 1 migration `0002_domain_model` applied cleanly to the local dev DB, the `vercel-dev` Neon branch, PR preview branches, and production.

## Unresolved decisions
Carried from `docs/00-product-freeze-reference.md` — not to be resolved by any implementation phase, only by explicit product/sports-science input:
- Numeric thresholds for Volume/Frequency/Recovery Cost bands, per goal profile.
- Goal weights per axis, per goal profile.
- North-star metric measurement window.
- Whether Fit Score has previously-named bands to preserve.
- Recovery Cost's underlying formula (may need inputs beyond ProgramVersion structure — flagged in `05-analysis-engine.md`).
- Whether Review should default to showing the Commit-time snapshot vs. a live recompute — architecture recommendation made (`ARCH-015` in `DECISIONS.md`), pending product sign-off.

Phase-1-specific outstanding items (not blockers for Phase 2 start, but should be scheduled):
- **Local Postgres for tests** — `packages/db` tests currently hit the remote `vercel-dev` Neon branch (ap-southeast-1). Suite takes 3–4 min due to round-trip latency and is prone to connection flakiness. Installing Postgres locally (`brew install postgresql@16`) and pointing tests at it would cut the suite to <10s. Recommended before Phase 2's test count doubles.
- **Sentry sourcemaps** — `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` set in Vercel; the SDK now uploads source maps on build (verified during Phase 1's preview build). May still need org-token scope review for release tagging; revisit when trace quality matters.
- **Local secret rotation** after ARCH-021's Next.js security upgrade — still recommended, not yet done.
- **Exercise/MuscleGroup seed coverage review** — 18 muscle groups, 43 exercises covering every `MovementPattern`, but `involvementFactor` values are provisional content data, not validated scientific thresholds. Should be reviewed alongside the GoalProfileDefinition thresholds (`[SCIENTIFIC INPUT REQUIRED]`).

## Architectural decisions
See `DECISIONS.md` for the full register. Summary: TypeScript monorepo (pnpm + Turborepo), Next.js 15.5.18 full-stack, tRPC 11, Prisma/Postgres, Auth.js v5 Credentials+JWT with no adapter and bcryptjs (ARCH-020), Next.js security upgrade to 15.5.18 + Turbo env var declarations (ARCH-021), Prisma `binaryTargets = ["native", "rhel-openssl-3.0.x"]` + `@prisma/nextjs-monorepo-workaround-plugin` (ARCH-022), explicit `Sentry.captureException` + `await Sentry.flush()` pattern in route handlers (ARCH-023), and the Phase 1 `User` reconciliation — `name` → `displayName`, nullable `passwordHash`, `updatedAt` retained (ARCH-024). The three-layer split and the AI-apply-confirmation boundary from the reference docs remain as specified.

## Test status
- **Vitest**: 8 test files. Phase 0: `packages/config` (3), `packages/domain` (1), `packages/ai` (1), `packages/db` (1), `packages/api` (2). Phase 1 adds: `packages/db` — `program.test.ts` (4 tests) + `programVersion.test.ts` (3 tests); `packages/api` — `program.test.ts` (3 tests, authorization). Total 19 tests across 8 files. All passing locally and in CI (CI runs against an ephemeral `postgres:16` service container; local runs against `vercel-dev` Neon branch).
- **Playwright**: 1 E2E (`e2e/landing.spec.ts`) — unchanged; Phase 1's Program UI is exercised by hand and by Vitest, not E2E.
- `pnpm turbo run typecheck lint test build` → all green.

## Deployment status
Deployed to Vercel.
- **Production URL**: `https://training-platform-web-alpha.vercel.app`
- **Production branch**: `main` (auto-deploys)
- **Preview**: automatic per PR (Vercel) with isolated Neon branch per PR (Neon integration installed during Phase 1)
- **Database (production)**: Neon primary branch (`ep-quiet-sea-...`) — **`0002_domain_model` applied**; production signup → `/app` and `/app/programs` CRUD verified working
- **Database (dev)**: `vercel-dev` Neon branch (`ep-flat-bread-...`); used for local dev and repository tests
- **CI database**: ephemeral `postgres:16` container on GitHub Actions runner — migrations applied via `prisma migrate deploy`, then seed, then tests
- **Sentry**: receiving events from both client and server; source maps uploaded on build during Phase 1

## Next phase
Phase 2 — Analysis Engine. Implements the deterministic analysis rules from `docs/05-analysis-engine.md` against the `ProgramStructure` types and the seeded `Exercise`/`MuscleGroup`/`ExerciseMuscleInvolvement` reference data. Do NOT invent any numeric threshold; the GoalProfileDefinition for HYPERTROPHY remains `validated: false, thresholds: {}` until SCIENTIFIC INPUT is provided. Use `docs/HANDOFF_TEMPLATE.md`. Uploads required: `phases/phase-02-*.md`, `05-analysis-engine.md`, and (for cross-reference) `03-domain-model.md` + `04-database-schema.md`.

## Prohibited scope (standing, not phase-specific)
Do not build, in any phase, without an explicit new phase spec authorizing it: social feed, clans, likes, rankings, trainer marketplace, native steps tracking, native nutrition database, a second sport, population-level AI (L3), AI L2 before Phase 8's `L2_ENABLED` flag is deliberately flipped, `ProgramShare`/sharing logic before Phase 10, any numeric scientific threshold presented as validated without a cited source, any Jev/`DecisionProvider` wiring into `packages/ai`'s live orchestration path before Phase 11's trigger condition is met per `19-jev-integration-review.md` — see `ARCH-019`.

---

*Template note for the implementing AI: when you finish a phase, replace the relevant sections above with the real, current state — don't just append. This file describes "now," not a changelog; `DECISIONS.md` is where the history/rationale lives.*