# PROJECT_STATE.md

**This file must be updated at the end of every phase, by the AI session that implemented that phase, before that session ends.** A new AI conversation should be able to understand the current implementation state entirely from this file plus `DECISIONS.md` and the relevant `phases/phase-NN-*.md` file — without reading any previous conversation.

---

## Current phase
**Phase 4 (Builder) is next.** Phase 3 (Assessment Engine) is complete. See `docs/phases/phase-04-*.md` and construct the handoff packet with `docs/HANDOFF_TEMPLATE.md`.

## Completed phases
- **Phase 0 — Foundation.** Monorepo (`pnpm@9.12.0` + Turborepo 2.11.3), five `packages/*` stubs, `apps/web` on Next.js 15.5.18 (App Router), Auth.js v5 Credentials + JWT (no adapter), one real tRPC procedure (`user.getSelf`), landing + signup + login + empty authenticated dashboard, CI (GitHub Actions), Sentry wired for client/server/edge with verified delivery, ESLint 9 flat config + Prettier, 5 Vitest tests + 1 Playwright E2E, deployed to Vercel production + PR previews.
- **Phase 1 — Domain Model & Database.** Full Phase 1 Prisma schema applied as migration `0002_domain_model` (all models from `04-database-schema.md` except `ProgramShare`, per ARCH-017; `User` reconciled with Phase 0 per ARCH-024). Canonical seed: 18 `MuscleGroup` rows, 43 `Exercise` rows covering every `MovementPattern`, `ExerciseMuscleInvolvement` factors, one `GoalProfileDefinition` (`HYPERTROPHY`, `validated: false`, `thresholds: {}`, `sourceNote: "UNRESOLVED — SCIENTIFIC INPUT REQUIRED"`). `packages/domain` exposes `ProgramStructure` and friends as pure types. `packages/db` gains `programRepository`, `programVersionRepository`, `draftRepository`, `exerciseRepository`, `goalRepository`. `packages/api` gains `program` router with `create`/`listMine`/`get`/`rename`/`archive`, plus `programService` for ownership enforcement. Minimal Program list/create/rename/archive UI added under `apps/web/app/app/programs/`. Migration applied to production Neon branch post-merge; production signup → `/app` → `/app/programs` verified working.
- **Phase 2 — Deterministic Analysis Engine.** `packages/domain/src/analysis/` ships `computeAnalysis()` plus five axis calculators (`volume`, `frequency`, `exerciseSelectionBalance`, `progressionSoundness`, `recoveryCost`), a discriminated `AxisStatus` (`BAND` | `UNVALIDATED`) so unvalidated axes cannot be rendered as banded, and a band-resolution helper. `packages/domain/src/goal-profiles/` ships the registry interface, a registry stub, and a `HYPERTROPHY` config with all bounds `null` and `validated: false` — no numeric threshold was invented. Recovery Cost ships behind a swappable `RecoveryCostCalculator` interface with a structural-only placeholder formula. Zero Prisma/HTTP/UI imports in `packages/domain` (verified). A dev-only QA script (`packages/domain/scripts/run-analysis.ts`) replaces the "internal QA route" option.
- **Phase 3 — Assessment Engine & Fit Score.** `packages/domain/src/assessment/` ships `computeAssessment()` (leverage roll-up → classification → actions), `computeFitScore()` (rule-based ordinal projection — no numeric intermediate), the deterministic action-template registry (`actionTemplates.ts`), and the launch-gate function (`launchGate.ts`). `GoalProfileConfig` gains `severityMap`, `severityWeightTable`, `materialitySeverityThreshold`, `fitScoreProjection` (all values provisional). `HYPERTROPHY_CONFIG` is now structurally complete: every band bound still `null`, every axis weight still `null`, severity map and leverage table populated with illustrative values marked provisional. The Final Freeze worked-example test passes verbatim (Chest→biggest opportunity, Back→strength, Recovery→attention, Quads→not surfaced but present in `allAssessedAxes`). 38 new Vitest tests across 7 files. `Assessment` and `FitScore` are wrapped in discriminated unions (`AssessmentResult`, `FitScoreResult`) so no consumer can read an unvalidated assessment as validated. A dev QA script (`scripts/run-assessment.ts`) prints both a real-analysis UNVALIDATED case and the worked-example VALIDATED case.

## Current architecture
As specified in `docs/01-architecture-recommendation.md` and `docs/02-system-architecture.md`. **As-built matches spec** with three Phase-3 additions logged in `DECISIONS.md`:
- `ARCH-029` — severity is per-axis-status (not per-weight); the leverage table is strictly 2-D (Severity × Weight → Leverage); weight enters the pipeline only at the leverage lookup. Resolves a contradiction between step 2's prose and the leverage-table section of `06-assessment-engine.md`.
- `ARCH-030` — Assessment-layer result shapes and Fit Score derivation. `AssessmentResult` and `FitScoreResult` are discriminated unions; `Assessment` carries `computedAt`, `allAssessedAxes`, and a snapshot of the config's `fitScoreProjection`; Fit Score is a rule-based ordinal projection with no numeric intermediate.
- `ARCH-031` — config-surface extensions. `AxisWeight.weight` narrowed from `number | null` to `Weight | null`; axis-level fallback keys in `axisWeights`; `materialitySeverityThreshold` on `GoalProfileConfig`.

The three-layer rule holds: Phase 3 added pure functions only; no layer boundary was crossed. `packages/domain` still has zero Prisma/HTTP/UI imports (verified by grep).

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

## Project conventions (learned during Phases 0–3)
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
- **After editing any `package.json`, run `pnpm install` and commit `pnpm-lock.yaml`.** CI and Vercel use `--frozen-lockfile`; an out-of-date lockfile fails both.
- **`noUncheckedIndexedAccess: true` is on** in `packages/domain`. Indexed access (`arr[0]`) types as `T | undefined`. Do not silence with `as T` or `!` — either seed loops from a defined element (see `computeFitScore.ts`), or add an explicit `if (x === undefined) throw` guard.
- **Test-file paths are load-bearing.** `assessment/__tests__/*.test.ts` imports `../computeAssessment`; a file placed in `analysis/__tests__/` with the same import fails to resolve. When creating a new test file, verify the containing directory matches the import prefix (both resolve relative to the test file's location).
- **Action templates are keyed by `goalProfileKey`.** A test fixture that wants to exercise the action path must use `goalProfileKey: "HYPERTROPHY"` (or another key with templates). A synthetic key with no matching templates yields zero actions by design — that's correct behavior, not a bug.

## Repository structure
Created exactly per `docs/16-repository-structure.md`. `apps/mobile` intentionally absent (Phase 12+). `packages/domain` now contains:
- `src/types.ts` — `ProgramStructure` family
- `src/analysis/` — Phase-2 analysis engine + `__fixtures__/` + `__tests__/`
- `src/assessment/` — Phase-3 assessment engine + `__fixtures__/workedExample.ts` + `__tests__/`
- `src/goal-profiles/` — registry, HYPERTROPHY config
- `scripts/run-analysis.ts`, `scripts/run-assessment.ts` — dev QA scripts

`packages/db` (schema + 5 repositories + seed), `packages/api` (user + program routers), `packages/ai` (unchanged stub), `packages/config` (unchanged) are as of Phase 1.

## Database schema version
- **`0001_init`** applied in Phase 0 — `User` table only.
- **`0002_domain_model`** applied in Phase 1 — adds every model from `04-database-schema.md` except `ProgramShare`, and reconciles `User` (ARCH-024).
- **No new migration in Phase 2 or Phase 3** — both are pure computation over existing structures; assessment is `f(ProgramVersion, Goal)` and isn't persisted yet. `AssessmentSnapshot` persistence begins in Phase 4 at Commit time (ARCH-015).
- Migrations run locally via `pnpm --filter @training/db db:migrate`. Seeding runs automatically after `migrate dev` and is idempotent. **Production migrations remain gated** per `15-deployment.md`; PR previews get isolated Neon branches.

## API version
tRPC 11, mounted at `/api/trpc/[trpc]` via `fetchRequestHandler`. Routers: `user.getSelf`, and `program.{create,listMine,get,rename,archive}`. `programService` enforces ownership. **Phases 2 and 3 added no API surface** — both engines are pure computation, exposed via `packages/domain`'s public surface only.

## Implemented domain objects
- Phase 1: `ProgramStructure`, `WorkoutDayStructure`, `ExercisePrescriptionStructure`, `LoadScheme`, `EvidenceTag`
- Phase 2: `Analysis`, `AnalysisAxisResult`, `AxisStatus` (discriminated union), `AxisBandDefinition`, `AxisWeight` (**Phase-3 shape: `Weight | null`**, see ARCH-031), `GoalProfileConfig` (**Phase-3 extended shape**, see ARCH-031), `GoalProfileDefinition`, `GoalProfileRegistry`, `ExerciseReferenceData` family, `MovementPattern`, `RecoveryCostCalculator`
- Phase 3: `Severity`, `Weight`, `Leverage`, `SeverityMap`, `SeverityWeightTable`, `FitScoreBand`, `FitScoreProjection`, `AssessedAxis`, `ActionSuggestion`, `Assessment`, `AssessmentResult`, `FitScore`, `FitScoreResult`, `ComputeAssessmentOptions`, `RollUpOutcome`, `ActionTemplateResult`

## Implemented product capabilities
Program CRUD (create / list / rename / archive) through the real tRPC API and a minimal authenticated UI. Both the deterministic Analysis engine and the Assessment engine (leverage roll-up, classification, Fit Score) are implemented and fully unit-tested, **but neither is exposed via any API or UI** — Phases 2 and 3 scoped themselves to pure computation plus dev-only QA scripts. No Draft editing, no commit flow, no training execution, no AI Coach yet.

## Known bugs
None.

## Unresolved decisions
Carried from `docs/00-product-freeze-reference.md` — not to be resolved by any implementation phase, only by explicit product/sports-science input:
- Numeric thresholds for Volume/Frequency/Recovery Cost bands, per goal profile.
- Goal weights per axis, per goal profile (all `null` in `HYPERTROPHY_CONFIG.axisWeights` today).
- North-star metric measurement window.
- Whether Fit Score has previously-named bands to preserve. **Phase-3 working assumption: no.** `FitScoreBand` is `"STRONG" | "DECENT" | "NEEDS_WORK"` — generic placeholders pending the (unavailable) Assessment-Redesign source text (Final Freeze Appendix C item 5). If that text is obtained, only the string values and their cutoff mapping change.
- Recovery Cost's underlying formula. May need inputs beyond `ProgramVersion` structure (training age, bodyweight, sleep). Phase 3 did NOT resolve this — the placeholder `RecoveryCostCalculator` from Phase 2 is still in place.
- Whether Review should default to showing the Commit-time snapshot vs. a live recompute (ARCH-015, pending product sign-off).

**Phase-3-specific items:**
- **Severity map and leverage-table cell contents are provisional.** Phase 3 populated `SEVERITY_MAP` and `SEVERITY_WEIGHT_TABLE` in `hypertrophy.ts` with illustrative values so the worked example passes. Every value is marked `PROVISIONAL` in comments. They are not scientifically validated and must not be presented as such without sports-science sign-off and a fresh `DECISIONS.md` entry.
- **Fit Score projection cell contents are provisional.** `HYPERTROPHY_FIT_SCORE_PROJECTION.leverageOrdinal` and `worstLeverageToBand` are illustrative; the ordering is comparison-only (no magnitudes) but the *identity* of the bands (`STRONG`/`DECENT`/`NEEDS_WORK`) is a placeholder pending the source text.
- **The launch gate is implemented but not wired into CI.** `assertNoUnvalidatedProfilesInProduction(env, registry)` in `packages/domain/src/assessment/launchGate.ts` is pure and tested. CI wiring is Phase 9's, when there's a production build to gate. Do NOT add a skipped/non-blocking CI step now.

Phase-1-specific outstanding items (still open, not blockers):
- **Local Postgres for tests** — `packages/db` tests hit the remote `vercel-dev` Neon branch; suite takes 3–4 min. Recommended before the test count grows further.
- **Sentry sourcemaps** — uploading successfully; may need org-token scope review for release tagging later.
- **Local secret rotation** after ARCH-021's Next.js security upgrade — recommended, not yet done.
- **Exercise/MuscleGroup seed coverage review** — `involvementFactor` values are provisional content data.

## Architectural decisions
See `DECISIONS.md` for the full register (ARCH-001 → ARCH-031). Phase 1 close-out added ARCH-020 – ARCH-024; Phase 2 close-out added ARCH-025 – ARCH-028; **Phase 3 close-out added ARCH-029 – ARCH-031.** The three-layer split, the AI-apply-confirmation boundary, and the invariant-8 "same roll-up" guarantee remain as specified.

## Test status
- **Vitest** (all passing locally and in CI):
  - `packages/config` — 1 file, 3 tests
  - `packages/ai` — 1 file, 1 test
  - `packages/db` — 3 files, 8 tests
  - `packages/api` — 2 files, 5 tests
  - `packages/domain` — 17 files, 80 tests total:
    - Phase 1: `src/index.test.ts` (1)
    - Phase 2 (9 files, 41 tests): `bandResolution` 7, `computeAnalysis` 4, `configValidation` 3, `determinism` 2, `exerciseSelectionBalance` 4, `frequency` 6, `progressionSoundness` 4, `recoveryCost` 4, `volume` 7
    - Phase 3 (7 files, 38 tests): `worked-example` 9, `dedup` 4, `shipped-config-unvalidated` 5, `fit-score` 5, `determinism` 4, `rollup-precedence` 5, `launch-gate` 6
  - **Total**: 24 files, 97 tests
- **Playwright**: 1 E2E (`e2e/landing.spec.ts`) — unchanged.
- `pnpm turbo run typecheck lint test build` → `Tasks: 19 successful, 19 total`.

## Deployment status
Deployed to Vercel.
- **Production URL**: `https://training-platform-web-alpha.vercel.app`
- **Production branch**: `main` (auto-deploys)
- **Preview**: automatic per PR (Vercel) with isolated Neon branch per PR (Neon integration installed during Phase 1)
- **Database (production)**: Neon primary branch (`ep-quiet-sea-...`) — `0002_domain_model` applied
- **Database (dev)**: `vercel-dev` Neon branch (`ep-flat-bread-...`)
- **CI database**: ephemeral `postgres:16` container on GitHub Actions runner
- **Sentry**: receiving events; source maps uploaded on build

## Next phase
Phase 4 — Builder. Consumes Phase 2's `Analysis`, Phase 3's `Assessment`, and adds the mutation/simulation surface plus the first real UI for Build↔Analyze. `MutationSpec` and `SimulationResult` arrive here. `AssessmentSnapshot` persistence begins at Commit time per ARCH-015. Do NOT invent numeric thresholds — the provisional values in `hypertrophy.ts` remain provisional.

**Cross-references for Phase 4:**
- `ActionSuggestion.rootCauseKey` (`<axisType>:<verb>-<target>`) is the bridge from assessment actions to `MutationSpec` — the phase spec should map from these keys, not invent a parallel naming.
- `computeFitScore`'s empty-axes throw is a defensive guard for an upstream bug; Phase 4 should never be able to trigger it if `computeAssessment` is called correctly.
- `allAssessedAxes` on `Assessment` is the full roll-up before classification; anything Phase 4 needs to re-derive (e.g. "which axis was worst") can be found there without a Phase-4 addition to `Assessment`.

## Prohibited scope (standing, not phase-specific)
Do not build, in any phase, without an explicit new phase spec authorizing it: social feed, clans, likes, rankings, trainer marketplace, native steps tracking, native nutrition database, a second sport, population-level AI (L3), AI L2 before Phase 8's `L2_ENABLED` flag is deliberately flipped, `ProgramShare`/sharing logic before Phase 10, any numeric scientific threshold presented as validated without a cited source, any Jev/`DecisionProvider` wiring into `packages/ai`'s live orchestration path before Phase 11's trigger condition is met per `19-jev-integration-review.md` — see `ARCH-019`.

---

*Template note for the implementing AI: when you finish a phase, replace the relevant sections above with the real, current state — don't just append. This file describes "now," not a changelog; `DECISIONS.md` is where the history/rationale lives.*