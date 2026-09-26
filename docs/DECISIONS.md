# DECISIONS.md

Append-only. Every entry: ID, date, decision, rationale, alternatives considered, consequence, reversibility, source. **Future AI sessions must not silently reopen a FROZEN decision below** — if one seems wrong, say so explicitly and propose a new, dated entry that supersedes it; never just implement something different.

Format per entry:
ARCH-NNN — Title
Date: YYYY-MM-DD | Status: FROZEN | Reversible: Yes/No/Contained-to-<package>
Decision: ...
Rationale: ...
Alternatives considered: ...
Consequence: ...
Source: ...

text

---

### ARCH-001 — TypeScript across the entire stack
Date: 2026-09-20 | Status: FROZEN | Reversible: No (foundational)
Decision: TypeScript for web, API, domain logic, and future mobile — no polyglot split.
Rationale: The hard problems here are typed-data-correctness problems, not numeric/ML problems; one language enables sharing exact types end to end.
Alternatives considered: Python for the analysis/assessment engine. Rejected — no ML/statistics at MVP.
Consequence: Every new phase's code is TS by default; a deviation requires a new decision entry.
Source: `01-architecture-recommendation.md` §1.

### ARCH-002 — pnpm workspaces + Turborepo monorepo
Date: 2026-09-20 | Status: FROZEN | Reversible: Contained-to-tooling
Decision: pnpm + Turborepo over Nx or separate repos.
Rationale: Lowest conceptual overhead for a solo/small team sharing types between web, API, and future mobile.
Alternatives considered: Nx (more power, more ceremony); separate repos (breaks type sharing).
Consequence: `16-repository-structure.md`'s layout is load-bearing for every phase.
Source: `01-architecture-recommendation.md` §2.

### ARCH-003 — Next.js hosts both the web UI and the tRPC API at MVP
Date: 2026-09-20 | Status: FROZEN | Reversible: Contained-to-hosting (escape hatch designed in)
Decision: One Next.js app (`apps/web`) serves UI and API via Route Handlers; no standalone backend service at MVP.
Rationale: One deployable app for a solo developer; the tRPC router lives in its own `packages/api` package specifically so a future split to a standalone service is a thin adapter, not a rewrite.
Alternatives considered: Standalone Fastify/NestJS service. Rejected for now — no current requirement for independent scaling.
Consequence: AI Coach responses must be designed as streaming (Vercel execution-time constraint), not long blocking calls.
Source: `01-architecture-recommendation.md` §3, `02-system-architecture.md`.

### ARCH-004 — tRPC over REST or GraphQL
Date: 2026-09-20 | Status: FROZEN | Reversible: Contained-to-`packages/api` (bounded hand-port possible)
Decision: tRPC + Zod, routers organized by domain resource.
Rationale: Every first-party client is TypeScript; full type inference with zero codegen.
Alternatives considered: REST (codegen/hand-sync overhead), GraphQL (no current need for its flexibility).
Consequence: A future external/public API consumer requires a hand-built REST facade over a subset of routers — acceptable, bounded cost, not a blocker now.
Source: `01-architecture-recommendation.md` §4, `09-api-architecture.md`.

### ARCH-005 — PostgreSQL + Prisma
Date: 2026-09-20 | Status: FROZEN | Reversible: ORM choice contained to `packages/db`
Decision: Postgres (Neon-hosted) via Prisma; domain/api packages never import Prisma types directly.
Rationale: Relentlessly relational domain; business logic deliberately lives in pure TS, not SQL, so Prisma's ergonomics outweigh Drizzle's SQL-closeness here.
Alternatives considered: Drizzle (close call, valid fallback), Kysely/raw SQL (no current need).
Consequence: Swapping ORMs later touches only `packages/db`.
Source: `01-architecture-recommendation.md` §5–6.

### ARCH-006 — Auth.js with JWT session strategy
Date: 2026-09-20 | Status: FROZEN | Reversible: Yes (provider-agnostic above the auth boundary)
Decision: Self-hosted Auth.js, JWT (not database) sessions.
Rationale: No per-MAU cost; critically, JWT sessions are what makes a future mobile client's bearer-token auth clean without a second auth system.
Alternatives considered: Clerk/Auth0 (faster to wire, real cost/lock-in trade-off) — explicitly noted as a reasonable substitute if speed-to-ship is prioritized.
Consequence: Mobile (Phase 12+) reuses the same session token mechanism.
Source: `01-architecture-recommendation.md` §7, `12-mobile-strategy.md`.

### ARCH-007 — Anthropic Claude as default model provider, behind `ModelProvider`
Date: 2026-09-20 | Status: FROZEN | Reversible: Yes, contained to `packages/ai/src/provider`
Decision: Claude Messages API (tool use) as default; provider accessed only through an interface, never called directly from orchestration code; exact model string lives in environment config, not code or this document set.
Rationale: Strong structured tool-calling and structured output, which the Coach's safety architecture depends on.
Alternatives considered: OpenAI, open-weight hosted models — both viable behind the same interface.
Source: `01-architecture-recommendation.md` §8, `10-ai-coach-architecture.md`.

### ARCH-008 — Vitest + Playwright
Date: 2026-09-20 | Status: FROZEN | Reversible: Yes, low cost
Decision: Vitest for unit/integration, Playwright for E2E.
Rationale: Fast TS/ESM-native feedback loop; Playwright's multi-browser/stateful-flow support fits this product's long flows.
Source: `01-architecture-recommendation.md` §9.

### ARCH-009 — Vercel + Neon + Sentry hosting
Date: 2026-09-20 | Status: FROZEN | Reversible: Yes, escape hatch designed in (see ARCH-003)
Decision: Vercel (web/API), Neon (Postgres, branch-per-preview), Sentry (errors).
Rationale: Lowest-complexity, lowest-cost path to reliable production deployment for a solo developer.
Consequence: Named constraint — long blocking calls don't fit Vercel's serverless model; the AI Coach is designed around this from Phase 8.
Source: `01-architecture-recommendation.md` §10, `15-deployment.md`.

### ARCH-010 — Three-layer split: domain (pure) / db (persistence) / api+ai (orchestration)
Date: 2026-09-20 | Status: FROZEN | Reversible: No (structural)
Decision: `packages/domain` never imports Prisma/HTTP/framework code; `packages/db` holds all persistence; `packages/api`/`packages/ai` coordinate the two.
Rationale: Directly implements the Final Freeze §31 "framework-independent core" requirement; makes the deterministic engine testable with zero infrastructure.
Source: `02-system-architecture.md`.

### ARCH-011 — `packages/ai` has no import path to the program-commit function
Date: 2026-09-20 | Status: FROZEN | Reversible: No — this is the core safety property of the whole AI Coach
Decision: `commitFromMutation` (and its `commitFromSimulation`/`commitFromDraft` callers) live exclusively in `packages/api`; `packages/ai` can call `simulate()` and low-risk constraint-writing functions, nothing else that mutates program structure.
Rationale: Turns "the AI never silently applies a change" (Final Freeze §14) from a prompted instruction into a property of the dependency graph.
Consequence: Any future PR giving `packages/ai` a new import toward a mutating function requires explicit justification and a new decision entry — treated as a standing rule, not a one-time check.
Source: `10-ai-coach-architecture.md`, `02-system-architecture.md`.

### ARCH-012 — ProgramVersion stores both a canonical `structureSnapshot` and normalized rows
Date: 2026-09-20 | Status: FROZEN (revisit if normalized rows go unused — see `18-architecture-sanity-check.md`) | Reversible: Yes, contained to `packages/db` + `packages/domain`'s structure-loading code
Decision: The JSON snapshot is the single source of truth, written once at commit; normalized `WorkoutDay`/`ExercisePrescription` rows are a derived, regenerated-never-edited projection of it.
Rationale: Guarantees historical reproducibility even as row-level schema evolves, while preserving queryability and structural diffing for history views.
Alternatives considered: Normalized rows only (schema drift risk to historical meaning); snapshot only (loses queryability).
Source: `04-database-schema.md`.

### ARCH-013 — `Goal` modeled as its own entity referencing `GoalProfileDefinition`
Date: 2026-09-20 | Status: FROZEN | Reversible: Yes, low cost (currently just a pointer)
Decision: `Goal` is a row, not an enum column on `Program`.
Rationale: Preserves room for future per-instance goal parameters and historical goal-querying without a later schema change; at MVP it's functionally just a profile pointer.
Source: `03-domain-model.md`.

### ARCH-014 — `ProgramDraft` is many-per-Program, not one
Date: 2026-09-20 | Status: FROZEN | Reversible: No (would silently break a named JTBD if reverted)
Decision: A Program can hold several concurrent, labeled Drafts.
Rationale: Master Blueprint job-to-be-done #4 ("compare two candidate structures side by side before committing") is explicitly unsatisfiable with a one-draft-per-program model. Checked against this JTBD deliberately, not assumed.
Source: `03-domain-model.md`, `07-versioning-and-simulation.md`.

### ARCH-015 — AssessmentSnapshot persisted at Commit and Block-End; Review reads the snapshot, not a live recompute, by default
Date: 2026-09-20 | Status: FROZEN, flagged for product sign-off | Reversible: Yes, contained
Decision: Historical Review shows the Assessment the user actually saw and acted on; a "recompute with current thresholds" action is a separate, explicit, opt-in comparison.
Rationale: Prevents a later threshold revision from retroactively changing what a historical Review screen shows, without hiding the option to see an updated view.
Consequence: This is an architecture-level recommendation resolving a gap the Final Freeze doesn't fully spell out — genuinely worth a product-owner confirmation, not purely an engineering call.
Source: `04-database-schema.md`, `06-assessment-engine.md`.

### ARCH-016 — TrainingBlock lifecycle is fully automatic
Date: 2026-09-20 | Status: FROZEN | Reversible: Yes, contained
Decision: A block opens on version activation and closes automatically when a different version activates or the Program is archived — no explicit "end block" user action.
Rationale: Lets Review serve both a final and a mid-block "how's this going" purpose with one mechanism, matching Round 1's "lightweight mid-block check-in" idea at zero extra cost.
Source: `08-training-execution-and-evidence.md`.

### ARCH-017 — `Program.visibility` column added at Phase 1; `ProgramShare` table and all sharing logic deferred to Phase 10
Date: 2026-09-20 | Status: FROZEN | Reversible: N/A (both are additive)
Decision: The cheap, hard-to-retrofit schema piece (the enum column) ships early; the actual feature (table + logic + UI) does not ship until explicitly scheduled.
Rationale: Direct implementation of the Final Freeze's "architect now, build later" distinction for sharing — verified against §28's "do not expand the MVP" instruction.
Source: `04-database-schema.md`, `phases/phase-01-domain-and-database.md`, `phases/phase-10-optional-extensions.md`.

### ARCH-018 — AI "apply" is implemented as a client-only mutating endpoint the model cannot call, not a model-facing `apply` tool
Date: 2026-09-20 | Status: FROZEN | Reversible: No
Decision: The model-facing tool is named `prepare_apply_confirmation` and only returns a render payload; the actual commit is `programVersion.commitFromSimulation`, called exclusively by client code on an explicit user click.
Rationale: A strengthening of the Final Freeze §17's "confirmation required" requirement — flagged explicitly as an interpretation choice rather than implemented silently, per this document's own standing instruction to surface exactly this kind of decision.
Source: `10-ai-coach-architecture.md`.

### ARCH-019 — Jev / System One (TypeSafe AI) evaluated, not adopted for MVP or V1
Date: 2026-09-23 | Status: FROZEN, revisit only per the named trigger below | Reversible: Yes, by design (see below)
Decision: A full due-diligence review (`19-jev-integration-review.md`) concluded "prototype behind an adapter; do not adopt for MVP or V1." No code was written. A reserved interface name (`DecisionProvider`) and an unauthorized candidate phase (`phases/phase-11-jev-prototype-candidate.md`) exist purely as a ready-made seam, not as approved work.
Rationale: (1) Nothing in the current roadmap needs it — Phase 8's Claude-native tool-calling already works without it. (2) Several tempting use cases (constraint-violation checking, trade-off detection) are already solved deterministically and would be a reliability downgrade if routed through a probabilistic layer. (3) The vendor is one week old at review time, hosted-only with no self-host option, early-access/waitlisted, and already iterating point versions rapidly — not a dependency to build MVP-critical behavior on, independent of the underlying idea's merit.
Alternatives considered: Adopt now for Coach intent routing (rejected — no usage volume yet to justify a cost/latency optimization); reject outright / never revisit (rejected — the narrow advisory pre-classifier use case has real outside precedent and a legitimate, if not yet MVP-relevant, fit).
Consequence: Any future session proposing to wire a `DecisionProvider` (Jev or otherwise) into `packages/ai`'s live orchestration path must first satisfy `19-jev-integration-review.md`§G's benchmark plan and its "Adopt" decision rule — this is a standing gate, not a one-time check. Giving any such provider an import path toward `commitFromMutation` is not a "future enhancement," it is a direct violation of `ARCH-011`.
Source: `19-jev-integration-review.md`, `10-ai-coach-architecture.md`, `phases/phase-11-jev-prototype-candidate.md`.

### ARCH-020 — Auth.js Phase 0 configuration: Credentials-only, JWT, no database adapter; bcryptjs for password hashing
Date: 2026-09-24 | Status: FROZEN | Reversible: Yes, contained to `apps/web/src/server/auth.ts` + `packages/db/prisma/schema.prisma`
Decision: Auth.js v5 wired with a single Credentials provider, `session: { strategy: "jwt" }`, and NO database adapter. Password hashing uses `bcryptjs` (pure-JS). Consequently the Phase 0 Prisma schema contains only `User` — no `Account`, `Session`, or `VerificationToken` tables.
Rationale: Phase 0's spec requires exactly "email/password signup + login, JWT session strategy." ARCH-006 already froze Auth.js + JWT but left the provider/adapter shape open. Credentials-only with no adapter is the smallest surface that satisfies Phase 0, keeps the schema minimal as the phase spec explicitly directs, and avoids prematurely adding tables that only an OAuth provider would need. `bcryptjs` (not native `bcrypt` or `@node-rs/argon2`) was chosen because it runs unmodified on Vercel's serverless and Edge runtimes with no native build step — a real operational concern named by ARCH-009.
Alternatives considered: (1) Add an OAuth provider now — rejected, no requirement and would force `Account`/`VerificationToken` tables into Phase 0 against the spec's explicit guidance. (2) Prisma adapter + database sessions — rejected, contradicts ARCH-006's JWT choice and would silently break the future-mobile bearer-token story. (3) `argon2` / native `bcrypt` — rejected for serverless deployment friction; revisit only if bcryptjs's throughput ever becomes a measured problem.
Consequence: Phase 0's schema has no auth-adjacent tables beyond `User`. Any future OAuth addition is a new, dated decision entry that adds tables and does not retroactively change this one. Swapping hash algorithm later requires re-hashing on next login; noted as a bounded, contained migration path, not a blocker.
Source: `phases/phase-00-foundation.md`, ARCH-006, ARCH-009.

### ARCH-021 — Next.js upgraded to 15.5.18 for the security patch flagged by Vercel; React moved to 19.0.0 stable; Turbo env var declarations added
Date: 2026-09-24 | Status: FROZEN | Reversible: Yes, contained to `apps/web/package.json` + `turbo.json` + `pnpm-lock.yaml`
Decision: Upgrade `next` from `15.0.2` to `15.5.18` and `react`/`react-dom` from `19.0.0-rc-69d4b800-20241021` (later `19.0.0-rc-02c0e824-20241028`) to `19.0.0` stable. Additionally, declare `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, and the Sentry env vars in `turbo.json`'s `build` task `env` array so Turborepo's cache-key correctness is preserved.
Rationale: Vercel's production deploy for Phase 0's initial build printed "Vulnerable version of Next.js detected, please update immediately." Next.js 15.0.2 was flagged for a critical RSC vulnerability (the specific advisory is the one Vercel cited during this deployment; the ID should be confirmed against Next.js's advisory database if the register entry needs an exact CVE). 15.5.18 is the latest patched 15.x at the time. React 19 RC was pinned to match the original Next 15.0.2 peer range; upgrading Next required moving to React 19.0.0 stable, which 15.5.x targets.
Alternatives considered: (1) Stay on 15.0.2 and accept the deployment warning — rejected: shipping a known-vulnerable framework to production is not an acceptable "done" state. (2) Bump to a Next 16.x canary — rejected: no reason to jump majors mid-phase; the patch is available within 15.x. (3) Not declare env vars in `turbo.json` — rejected: Turbo 2.x excludes undeclared env vars from build cache keys and from build-time passthrough; leaving them undeclared would cache-poison future builds that read any of these at build time.
Consequence: Production CVE banner gone. First Load JS grew from ~100 kB to ~162 kB, which is expected from the larger Next 15.5 runtime and React 19 stable — not a problem at Phase 0, revisit if/when bundle size becomes a Phase 4+ concern. If the specific CVE ID matters for the register, add it as an amendment rather than reopening this entry. Secret rotation (AUTH_SECRET, Neon password) was recommended as a precaution following the CVE patch; treated as an operational follow-up, not a blocking item.
Source: Vercel build log for Phase 0's first production deploy; Next.js release notes.

### ARCH-022 — Prisma on Vercel requires `binaryTargets = ["native", "rhel-openssl-3.0.x"]` AND `@prisma/nextjs-monorepo-workaround-plugin` in `apps/web`
Date: 2026-09-24 | Status: FROZEN, structural for as long as Prisma runs inside Vercel serverless functions in a pnpm monorepo | Reversible: Conditional — would be revisited if ARCH-003's escape hatch is used (standalone API service outside Vercel) or if Next.js's output file tracing ever follows pnpm's symlinked `node_modules` layout natively
Decision: `packages/db/prisma/schema.prisma`'s `generator client` block declares `binaryTargets = ["native", "rhel-openssl-3.0.x"]`. `apps/web`'s `next.config.js` adds a `webpack` function that instantiates `@prisma/nextjs-monorepo-workaround-plugin`'s `PrismaPlugin` on the server-side config. Both are required together.
Rationale: Two independent failures were encountered during Phase 0's first production deploy. (1) Prisma's default `native` binary target downloaded only the macOS engine during local `pnpm install`; Vercel's Amazon Linux runtime then couldn't find a query engine for `rhel-openssl-3.0.x` — the exact error was `Prisma Client could not locate the Query Engine for runtime "rhel-openssl-3.0.x"`. Adding `binaryTargets` makes install download the correct engine. (2) Even with the engine present on disk, Next.js's output file tracing doesn't follow pnpm's symlinked `node_modules/.pnpm/` layout, so the engine wasn't copied into the serverless function's filesystem — the runtime log showed `External APIs: No outgoing requests` (function crashed before opening any DB connection). `PrismaPlugin` copies the engine into the bundle. Neither fix alone is sufficient; both are necessary.
Alternatives considered: (1) `outputFileTracingIncludes` in `next.config.js` — technically works but more brittle (path globs must match pnpm's internal layout) and less idiomatic than the plugin Prisma itself recommends for this exact case. (2) Hiding `libquery_engine-*` behind a wrapper that shells out to `prisma` CLI — rejected, adds a process-spawn per request and doesn't solve the fundamental bundling gap. (3) Move database access into a standalone API service — rejected at Phase 0 (would contradict ARCH-003's "one deployable app at MVP"); this remains the escape hatch if the constraint ever becomes painful.
Consequence: Any future package that needs Prisma must resolve it through `packages/db`. Any future Next.js app (e.g., a Phase 12+ mobile-web shell) that ships serverless functions reading Prisma needs the same two-line config. The **diagnostic heuristic worth preserving**: on Vercel, `External APIs: No outgoing requests` on a function that should hit Postgres almost always means the serverless bundle is missing the query engine, not that the connection string is wrong.
Source: Phase 0 production runtime log for `POST /signup`; Prisma's Vercel deployment guidance; the `pris.ly/d/engine-not-found-nextjs` link Prisma's own error message provided.

### ARCH-023 — Sentry error delivery on Vercel requires explicit `Sentry.captureException` + `await Sentry.flush()` in route handlers; automatic capture via Next's `onRequestError` is unreliable in Next 15.4+
Date: 2026-09-24 | Status: FROZEN, structural for any route handler expected to reliably deliver to Sentry | Reversible: Conditional — would be revisited if either (a) Next.js fixes the `onRequestError` regression for route handlers, or (b) Vercel changes Lambda freeze behavior
Decision: Any route handler (`app/api/**/route.ts`) that needs reliable Sentry delivery must explicitly call `Sentry.captureException(error)` and `await Sentry.flush(timeoutMs)` before returning. Relying on Next.js's `onRequestError` hook (which `apps/web/instrumentation.ts` exports as `Sentry.captureRequestError`) is insufficient in the current version. The same pattern is documented here for any future async capture path that runs in a Vercel serverless function.
Rationale: Two distinct problems compound. (1) **Vercel Lambda freeze**: the execution environment is frozen immediately after the HTTP response is sent, so Sentry's asynchronous queue never drains — the event is captured but never transmitted. An explicit `await Sentry.flush(N)` before returning forces the queue to drain. (2) **Next.js 15.4+ `onRequestError` regression**: when OpenTelemetry is enabled (which the Sentry SDK does by default), Next.js 15.4.0+ stops invoking `onRequestError` for route handlers. Both were observed empirically during Phase 0: the first server test threw an error that appeared in Vercel's runtime logs but never reached Sentry. Adding `Sentry.captureException` + `await Sentry.flush(5000)` and *removing the `throw`* (so the automatic path is never triggered) fixed it — the error then appeared in Sentry's Issues list within seconds.
Alternatives considered: (1) Rely on the SDK's automatic `waitUntil` integration — rejected: it defers the Lambda freeze correctly but only for the automatic capture path, which is the one that's broken in Next 15.4+. (2) Use `after()` from `next/server` to run capture post-response — valid fallback, but requires the route to return a response immediately (i.e., still removes the throw); the simpler explicit-flush pattern was chosen because it's more obvious in code review. (3) Downgrade Next.js to pre-15.4 — rejected: contradicts ARCH-021's security upgrade.
Consequence: The **Phase 0 Sentry acceptance test's route shape is the reference pattern** — capture explicitly, flush explicitly, return rather than throw. Any future route handler that throws expects its error to reach Vercel logs, but not Sentry, unless it adopts this pattern. `Sentry.captureRequestError` (from `instrumentation.ts`'s `onRequestError` export) is retained in the codebase because it's still correct for RSC render errors and non-route-handler server errors — it's specifically route handlers that need the workaround. Sentry's `debug: true` option requires a debug bundle; setting it in a production build prints "Cannot initialize SDK with `debug` option using a non-debug bundle" and is a no-op, not an error.
Source: Phase 0's Sentry verification exercise — `POST /api/sentry-test` route returned 500 with the error visible in Vercel logs but absent from Sentry Issues, until the explicit-capture + flush pattern was applied.

### ARCH-024 — Phase 1 reconciles `User` with Phase 0: `name` → `displayName` (required), `passwordHash` made nullable, `updatedAt` retained
Date: 2026-09-25 | Status: FROZEN | Reversible: Yes, contained to `packages/db/prisma/schema.prisma` and migration `0002_domain_model`
Decision: Phase 1's schema rewrite adopts `04-database-schema.md`'s `User` shape with three concrete adjustments, each justified below:
- **`name String?` → `displayName String` (required).** Matches `04-database-schema.md`. The rename is a pure field rename, not a data migration — Phase 0's `name` was nullable, and at the time of this decision there were no production users other than test accounts, so backfilling `displayName` from `name` (with a fallback for nulls) is lossless.
- **`passwordHash String` → `passwordHash String?` (optional).** Matches `04-database-schema.md`. Anticipates a future OAuth provider, where a user record would exist without a password. Making this change now costs nothing; making it later would require a schema migration plus a code audit of every reader.
- **`updatedAt DateTime @updatedAt` retained.** `04-database-schema.md` omits it, but that document's own header says "treat field/relation names as adjustable during Phase 1, not gospel." `updatedAt` is a standard Prisma field, Phase 0 already had it, and no reader depends on its absence. Dropping it would lose information with no benefit.

All three changes are bundled into the single migration `0002_domain_model` per the phase spec's "largest single migration in the whole roadmap" instruction, rather than split into a separate `0002_user_reconcile` + `0003_domain_model` pair.
Rationale: Phase 1's phase file says "Full Prisma schema exactly as specified in `04-database-schema.md`," but Phase 0's as-built `User` had drifted (extra `updatedAt`, missing `displayName`, non-nullable `passwordHash`). Silently overwriting Phase 0's shape would be a silent change to shipped code; silently keeping Phase 0's shape would contradict the phase file. Neither silent option is acceptable — hence this explicit reconciliation, logged rather than resolved invisibly. The `passwordHash` nullability in particular is a forward-compatibility choice: it aligns the schema with the eventual OAuth story without adding any OAuth-specific tables now.
Alternatives considered: (1) Keep Phase 0's `name` field and add `displayName` as a second column — rejected, two names for one concept is exactly the kind of drift the freeze exists to prevent. (2) Keep `passwordHash` non-nullable — rejected; zero cost to relax now, real cost to relax after OAuth-adjacent code exists. (3) Drop `updatedAt` to match the doc exactly — rejected; `04-database-schema.md` explicitly permits field-level adjustment, and the Phase 0 column is harmless. (4) Split into two migrations — rejected; the phase file names `0002_domain_model` as a single migration and no downstream consumer needs the split.
Consequence: Any code written before Phase 1 that referenced `user.name` must be updated to `user.displayName` (Phase 1 verified `packages/db`, `packages/api`, and `apps/web` — the only consumers, including `apps/web/app/(auth)/signup/actions.ts`, `apps/web/app/app/page.tsx`, and `apps/web/src/server/auth.ts`'s `authorize` callback). `findUserByEmailWithHash` and `createUser` now treat `passwordHash` as `string | null`, and `authorize` guards with an explicit `if (!user.passwordHash) return null;` since the Credentials provider cannot authenticate a passwordless user. `UserRecord` exposes `displayName`, not `name`. If a future phase introduces OAuth, no new migration is needed for the nullability change — only the `Account`/`VerificationToken` tables that OAuth itself requires (which would be a separate, dated decision).
Source: `phases/phase-01-domain-and-database.md` ("Full Prisma schema exactly as specified in `04-database-schema.md`"), Phase 0's `packages/db/prisma/schema.prisma`, `04-database-schema.md` (header note on field-name adjustability), and the Phase 1 kickoff exchange confirming "Option A, with one amendment."

### ARCH-025 — Turbo env vars declared via `globalEnv` at the config root, not per-task `env` arrays
Date: 2026-09-25 | Status: FROZEN | Reversible: Yes, contained to `turbo.json`
Decision: `turbo.json` declares all build- and runtime-read environment variables in a top-level `globalEnv` array. Per-task `env` arrays are not used. Any new env var the app reads at runtime or build time must be added to `globalEnv`.
Rationale: Phase 1's CI failed with `Environment variable not found: DATABASE_URL` even though the workflow declared `DATABASE_URL` at the job level. Turbo 2.x strips undeclared env vars from task subprocess environments and excludes them from task cache keys — a deliberate design that improves cache correctness but silently breaks tests that need secrets or connection strings. The original `turbo.json` had per-task `env` arrays on `build` only (from ARCH-021), which meant `test` ran without any env vars at all. `globalEnv` applies to every task uniformly, eliminates the per-task duplication, and matches how the docs describe setting env vars that affect more than one task.
Alternatives considered: (1) Add an `env` array to each task that needs it — works, but duplicates the list per-task and requires every future task author to remember to declare env vars; the failure mode is silent (tests fail with "environment variable not found" instead of a config error). (2) `--env-mode=loose` on the `turbo run` invocation — rejected: disables env-var cache-key inclusion (stale test results when env changes), and forwards *all* process env vars to every task, including accidental secrets. (3) Skip the declaration and rely on shell env inheritance — rejected: that's the failure mode Turbo 2.x is designed to prevent.
Consequence: Adding a new env var the app needs is now a two-step process — write it in the platform config (Vercel / CI / local `.env`) *and* add it to `globalEnv`. A var missing from `globalEnv` will work locally in some contexts and fail in others (specifically: fail under `pnpm turbo run …` in CI, pass under direct `pnpm --filter …` invocation). Documented as a project convention in `PROJECT_STATE.md` so future sessions don't rediscover it.
Source: Phase 1 CI failure log — `pnpm turbo run test` printed `PrismaClientInitializationError: Environment variable not found: DATABASE_URL` while `prisma migrate deploy` (which runs outside Turbo) succeeded with the same job-level env.

### ARCH-026 — Repository `$transaction` calls pass explicit `{ timeout: 20000, maxWait: 10000 }` via a shared `TRANSACTION_OPTIONS` const
Date: 2026-09-25 | Status: FROZEN | Reversible: Yes, contained to `packages/db/src/repositories/*.ts`
Decision: Every `prisma.$transaction(...)` invocation in `packages/db` passes an options object with `timeout: 20000` (max transaction runtime) and `maxWait: 10000` (max connection-acquisition wait). The values live in an exported `TRANSACTION_OPTIONS` const so future transaction sites reuse the same numbers and tests can assert them if needed.
Rationale: Prisma's defaults (5s transaction timeout, 2s max wait) are tuned for a database on the same network as the application. The `vercel-dev` Neon branch is in `ap-southeast-1` while development happens in India; round-trip latency across that distance plus several queries inside one transaction (e.g. `createProgramVersion` writing a `ProgramVersion`, its `WorkoutDay` rows, and its `ExercisePrescription` rows atomically) exceeded the 5s default. Two distinct errors were observed: `Transaction already closed: … The timeout for this transaction was 5000 ms` (transaction-runtime clock) and `Unable to start a transaction in the given time` (connection-acquisition clock). Bumping only `timeout` would have shifted the failure from one to the other, so both were raised in one change.
Alternatives considered: (1) Leave Prisma's defaults and accept test flakiness on remote Neon — rejected: the tests exercise real transaction behavior and should pass consistently. (2) Migrate tests to a local Postgres and keep defaults — this is the better long-term answer (see Phase-1 outstanding items in `PROJECT_STATE.md`), but the explicit options are still correct for the path where tests *do* hit a remote branch, and they cost nothing on localhost. (3) Set `$transaction` options per call site without a shared const — rejected: the values are a policy, not a per-call decision; centralizing them makes it obvious when they change.
Consequence: Repository transactions tolerate up to 20s of DB work and 10s of pool wait. This is a ceiling, not a target. If Phase 3+ introduces longer-running transactions, the ceiling may need raising again — a one-line change in the shared const. The `as Prisma.InputJsonValue` casts elsewhere in the same repository files are boundary enforcement per ARCH-010 and are unaffected by this entry.
Source: Phase 1 DB test failures — `enforces the (programId, versionNumber) uniqueness constraint` and `getMaxVersionNumber` both failed with transaction-timeout errors against the `vercel-dev` Neon branch before the options were added.

### ARCH-027 — CI runs against an ephemeral `postgres:16` service container with `prisma migrate deploy` + seed, not against a remote Neon branch
Date: 2026-09-25 | Status: FROZEN | Reversible: Yes, contained to `.github/workflows/ci.yml`
Decision: GitHub Actions' `ci` job declares a `postgres:16` service container, sets `DATABASE_URL` / `DIRECT_URL` to `postgresql://ci:ci@localhost:5432/ci`, and runs `prisma migrate deploy` followed by `prisma db seed` before `pnpm turbo run test`. CI does not connect to Neon. Both `DATABASE_URL` and `DIRECT_URL` point at the service container.
Rationale: Three reasons. (1) **Speed and reliability** — the same tests that take 3–4 minutes against remote Neon run in seconds against a container on the runner's own network. (2) **Isolation** — CI must not mutate a shared Neon branch, and it must not depend on branch state from a prior PR; a fresh container guarantees a clean schema every run. (3) **Migration coverage** — using `prisma migrate deploy` (not `db:push`) means CI exercises the same migration files that production applies, so a broken migration fails in CI instead of in production.
Alternatives considered: (1) Point CI at the `vercel-dev` Neon branch — rejected: shared-state tests are non-deterministic, CI runtime is dominated by network latency, and one careless test can corrupt dev state. (2) Neon branch-per-CI-run — viable but adds an external dependency for what a service container solves locally. (3) `db:push` instead of `migrate deploy` — rejected; a green CI must mean the migration files work, not that the current schema works.
Consequence: Five distinct database contexts now exist, all running the same migrations: local dev, local DB tests, CI, Vercel previews, Vercel production. Any change to a migration file must be verified against a *fresh* database at least once. Adding a migration that requires a Neon-specific extension would break the service container approach and require revisiting this entry.
Source: Phase 1 CI failures — `pnpm turbo run test` couldn't reach any database in the workflow's original shape. Fixing this required all three of: service container, job-level env, and Turbo `globalEnv` declaration (ARCH-025).

### ARCH-028 — Analysis axis status is a discriminated union (`BAND` | `UNVALIDATED`), not a bare string; unvalidated axes are compile-time unrenderable as banded
Date: 2026-09-26 | Status: FROZEN | Reversible: Yes, contained to `packages/domain/src/analysis/types.ts` + `bandResolution.ts` + every consumer of `AnalysisAxisResult`
Decision: `AnalysisAxisResult.status` is `{ kind: "BAND"; band: string } | { kind: "UNVALIDATED"; reason: string }` rather than the `status: string` shown in `05-analysis-engine.md`. `resolveBand()` returns `UNVALIDATED` whenever a config's bands are empty or every band has both bounds null, and never picks a "closest" band for an unmatched value.
Rationale: Phase 2's acceptance criteria require that no plausible-looking numeric threshold be presented as validated. A bare `status: string` would let `computeAnalysis` return `"Low"` from an all-null placeholder config and let a UI render that as a real recommendation — a direct violation of invariant 1 ("deterministic engine is the sole source of quantitative truth") and of Final Freeze §36's launch gate. A discriminated union makes that mistake a type error rather than a code-review problem: any consumer that wants to display a band must narrow the union first, and the `UNVALIDATED` branch carries a `reason` explaining which config condition produced it. This is a strict narrowing of 05's shape, not a semantic change.
Alternatives considered: (1) Keep `status: string` and treat `"UNVALIDATED"` as a magic string — rejected: it is not distinguishable at the type level, and any typo or refactor can silently drop the guard. (2) Add a separate `unvalidated: boolean` sibling field — rejected: allows contradictory states (`status: "Low", unvalidated: true`). (3) Make the whole `AnalysisAxisResult` a union — considered and rejected as over-engineering; a union on `status` is sufficient.
Consequence: Every future consumer of `AnalysisAxisResult` (`packages/api` services, the Review UI, the AI Coach context builder) must narrow on `status.kind`. If a later phase genuinely needs a plain `string` status for serialization, the narrowing rule is `status.kind === "BAND" ? status.band : "UNVALIDATED"` — one line, deliberately explicit. This becomes the mechanism by which the Phase 9 launch gate is enforced at the API surface: any axis from an unvalidated profile is structurally incapable of surfacing a band name.
Source: `phases/phase-02-analysis-engine.md` acceptance criteria; `05-analysis-engine.md` ("returns a `status: 'UNVALIDATED'` for any axis whose bounds are null, rather than guessing"); Phase 2 kickoff Q3 confirmation (Option A).

### ARCH-029 — Assessment severity is per-axis-status; weight enters only at the leverage lookup; the leverage table is strictly 2-D (Severity × Weight)
Date: 2026-09-26 | Status: FROZEN | Reversible: Yes, contained to `packages/domain/src/assessment/` types and the goal-profile config shape
Decision: `severity = severityMap[axisType][status]` — a two-dimensional map (axis, status). `leverage = severityWeightTable[severity][weight]` — a strictly two-dimensional map (severity, weight). Weight appears in exactly one place in the Assessment pipeline: the leverage lookup. Axis-specific severity tuning is the mechanism by which "Low volume on a high-leverage axis is more severe than Low on a low-leverage axis" is expressed; weight is not a third severity dimension.
Rationale: `06-assessment-engine.md` contains two contradictory phrasings — step 2's prose implies severity is a function of status and weight; the leverage-table section fixes the table as 2-D (Severity × Weight → Leverage). Both cannot hold. A 3-D severity map combined with a 2-D leverage table would double-count weight. A 2-D severity map + 2-D leverage table is consistent, matches the phase file's worked examples, and preserves the doc's intuitive claim by encoding axis sensitivity in the severity map itself.
Alternatives considered: (1) 3-D severity map + 1-D leverage map — rejected; contradicts the doc's explicit "shape is fixed" statement. (2) 3-D severity map + 2-D leverage table — rejected as double-counting. (3) Widen the leverage table to 3-D (axis, severity, weight) — rejected as a larger deviation than necessary.
Consequence: A new axis requires a new severity row in each config's severityMap, a new axisWeight entry, and no change to the leverage table (which is axis-agnostic). The leverage table's 12 cells are shared across all axes. The worked-example tuple for Quads uses severity `MINOR`.
Source: `phases/phase-03-assessment-engine.md` worked example; `06-assessment-engine.md` step 2 vs. leverage-table section (contradiction); Phase 3 kickoff exchange resolving the four tuples.

### ARCH-030 — Assessment-layer result shapes and Fit Score derivation: discriminated unions, an explicit allAssessedAxes roll-up, and rule-based ordinal projection (no numeric intermediate)
Date: 2026-09-26 | Status: FROZEN | Reversible: Yes, contained to `packages/domain/src/assessment/types.ts`, `computeAssessment.ts`, `computeFitScore.ts`
Decision: Three coupled structural choices, applied together:
  (1) **Discriminated-union return types.** `computeAssessment` returns `AssessmentResult = { kind: "VALIDATED"; assessment } | { kind: "UNVALIDATED"; reason; assessment }`. `computeFitScore` returns `FitScoreResult = { kind: "VALIDATED"; fitScore } | { kind: "UNVALIDATED"; reason }`. Both branches of `AssessmentResult` carry the fully-populated inner `Assessment`. The inner `Assessment` type is NOT a union — it matches `06-assessment-engine.md`'s shape with three strict additions below.
  (2) **Two additions to `Assessment` for invariant-8 soundness.** `allAssessedAxes: readonly AssessedAxis[]` carries the *full* leverage roll-up before classification. `fitScoreProjection: FitScoreProjection` snapshots the config's projection so `computeFitScore(result)` stays single-parameter. A third addition, `computedAt`, gives `FitScore.derivedFromAssessmentComputedAt` a value.
  (3) **Fit Score is a rule-based ordinal projection, not a weighted sum.** `FitScoreProjection = { leverageOrdinal: readonly Leverage[]; worstLeverageToBand: Record<Leverage, FitScoreBand> }`. `computeFitScore` finds the worst leverage across `allAssessedAxes` by `indexOf` comparison against `leverageOrdinal`, then looks up the band. No numeric intermediate, no ordinal→numeric mapping, no averaging.
Rationale: Invariant 8 requires the Fit Score to be "derived from the same leverage roll-up as the qualitative Assessment." Three failure modes motivate the design: (a) a bare-string fit score would let an unvalidated profile produce a "real-looking" band — same class of bug ARCH-028 fixed at the axis level; (b) reading Fit Score from the surfaced subset (strengths + attention + biggest opportunity) is unsound against invariant 8, since an axis whose severity is below materiality but whose leverage is HIGH would be missed; (c) a weighted sum over categorical leverages would require an ordinal→numeric mapping — a form of threshold invention.
Alternatives considered: (1) `Assessment` itself as a discriminated union — rejected; wrap at the boundary keeps the doc-compliant inner shape. (2) Fit Score taking only the VALIDATED branch — rejected; accepting the union and returning a mirrored one preserves the derivation guarantee structurally. (3) Fit Score derived only from attention/opportunity — rejected as a worse instance of (b). (4) `computeFitScore(result, now)` — rejected; `computedAt` is part of the assessment's identity.
Consequence: Every consumer of `AssessmentResult` or `FitScoreResult` must narrow on `kind`. Adding a new axis does not require a new field on `Assessment`. The Fit Score band strings are placeholders pending the Assessment-Redesign source text. `computeFitScore`'s throw on empty-axes is a defensive guard for an upstream inconsistency in `computeAssessment`.
Source: `00-product-freeze-reference.md` invariant 8; `06-assessment-engine.md` §"Fit Score — guaranteed consistent by construction"; Phase 3 kickoff exchange Q2, Q3.

### ARCH-031 — Config-surface extensions for Phase 3: categorical `AxisWeight.weight`, axis-level fallback keys, and `materialitySeverityThreshold`
Date: 2026-09-26 | Status: FROZEN | Reversible: Yes, contained to `packages/domain/src/analysis/types.ts` + `goal-profiles/hypertrophy.ts` + `rollup.ts`
Decision: Three coupled shape changes to the goal-profile config surface:
  (1) **`AxisWeight.weight` narrowed from `number | null` to `Weight | null`** where `Weight = "LOW" | "MEDIUM" | "HIGH"`. `null` continues to mean "[SCIENTIFIC INPUT REQUIRED]". The leverage table requires the categorical enum (per ARCH-029); a numeric weight would force a numeric→categorical bucketing threshold that does not exist and cannot be invented.
  (2) **Axis-level fallback keys in `axisWeights`.** Precedence: fully-scoped key (`"VOLUME:chest"`) wins; else axis-level fallback (`"VOLUME:"`); else UNRESOLVED (blocks the roll-up). An unresolved key terminates in "we don't know," not a fabricated value.
  (3) **`materialitySeverityThreshold: Severity` added to `GoalProfileConfig`.** Step 6 of `06-assessment-engine.md` says the materiality threshold is config, not hardcoded in the engine. Type is `Severity`.
Rationale: (1) is dictated by ARCH-029. (2) is an interpretation of `05-analysis-engine.md`'s key spec: without a fallback, the shipped `HYPERTROPHY_CONFIG.axisWeights` would be an empty object, contradicting the phase file's instruction that it be "structurally complete, but numerically unresolved." (3) has nowhere else to live — the doc says config.
Alternatives considered: (1) Keep `AxisWeight.weight` numeric — rejected; forces a bucketing threshold. (2) Ship `HYPERTROPHY_CONFIG.axisWeights = {}` — rejected. (3) Use a wildcard syntax like `"VOLUME:*"` — rejected; not in the doc. (4) Fall through a `null` scoped value to the axis-level default — rejected; `null` is an explicit "[SCIENTIFIC INPUT REQUIRED]" marker.
Consequence: A future phase adding a scoped weight does not need to touch the axis-level fallback — the scoped key wins. Removing an axis-level fallback would BLOCK the roll-up for every axis that lacks a scoped override. `materialitySeverityThreshold` is provisional in the shipped config.
Source: Phase 3 kickoff exchange Decisions #1, #2, #3; `05-analysis-engine.md` key spec; `06-assessment-engine.md` step 6.

### ARCH-032 — Phase 4 UI E2E acceptance criterion rewritten: asserts the unvalidated Assessment state, not "Biggest Opportunity"
Date: 2026-09-26 | Status: FROZEN | Reversible: No — this is a product-behavior commitment, not a tooling choice
Decision: Phase 4's UI E2E (`apps/web/e2e/builder.spec.ts`) asserts the honest unvalidated state instead of the phase file's literal "verify the Assessment screen surfaces it as Biggest Opportunity." Specifically: the test builds a real draft, saves it, asserts that the Assessment panel shows the "Assessment not yet available" heading and its reason paragraph, asserts that none of the validated-only sections (Strengths / Attention areas / Biggest Opportunity / Actions) are present, then commits the draft and asserts the committed version appears on the program detail page.
Rationale: The phase file's original criterion is unsatisfiable against the shipped configuration. `HYPERTROPHY_CONFIG` has every analysis band bound `null` and every axis weight `null`, so `rollUpLeverage` returns BLOCKED for every axis, `computeAssessment` returns `{ kind: "UNVALIDATED" }`, and no axis reaches classification — there is no "Biggest Opportunity" to surface. Satisfying the literal criterion would require either (a) inventing numeric thresholds, which the freeze forbids (§36, `[SCIENTIFIC INPUT REQUIRED]` items), or (b) introducing a runtime registry-swap seam in the E2E environment, which the kickoff discussion rejected as a production footgun. Rewriting the criterion keeps the E2E honest: it asserts what the product actually does today, not what it will do once thresholds are signed off.
Alternatives considered: (1) Test-only fixture config swapped in under `PLAYWRIGHT=1` — rejected as a production footgun and a pre-emption of Phase 9's launch gate. (2) Test against a locally-registered HYPERTROPHY profile with populated thresholds — rejected for the same reason. (3) Skip the E2E until thresholds are signed off — rejected because the point of the test is to enforce the honesty requirement now.
Consequence: Any future phase that ships a validated `HYPERTROPHY_CONFIG` must **extend** this test, not rewrite it. The phase file's literal wording must not be re-attempted in Phase 5+ without first landing the thresholds.
Source: Phase 4 kickoff exchange Q3; `00-product-freeze-reference.md` invariant 1 and `[SCIENTIFIC INPUT REQUIRED]` list; `06-assessment-engine.md` §"validation gate"; ARCH-029–031.

### ARCH-033 — `CommitOrigin` extended with `draftId` so commit + draft-status-flip are atomic
Date: 2026-09-26 | Status: FROZEN | Reversible: Yes, contained to `packages/api/src/services/programVersionService.ts` and its callers
Decision: `CommitOrigin` is widened from `07-versioning-and-simulation.md`'s literal shape to:
```ts
type CommitOrigin =
  | { via: "MANUAL_COMMIT"; draftId?: string }
  | { via: "AI_APPLIED_SIMULATION"; simulationId: string };
commitFromMutation accepts this type; when origin.draftId is set, the draft's status is flipped to COMMITTED and its committedAsVersionId is set inside the same transaction that writes the version, revision, snapshot, and active-pointer flip.
Rationale: The doc's literal { via: 'MANUAL_COMMIT' } covers the origin label but not the atomic pairing of "a new version exists" with "the source draft is now committed." Without the pairing, two outcomes are possible and both are wrong: (a) the commit transaction succeeds but the draft stays ACTIVE, so a retry hits the stale check and fails for a reason the user cannot understand; (b) the commit transaction succeeds, the draft-status update runs as a second step and fails, leaving a committed version whose source draft still appears editable. Extending the origin type — rather than adding a second commit function — keeps commitFromMutation as the single function with the single write path, satisfying invariant 2.
Alternatives considered: (1) Two-step commit-then-update-draft — rejected for the recoverable-window reasons above. (2) Add a commitFromDraft variant alongside commitFromMutation — rejected; it would be the second mutation path invariant 2 forbids, even if it delegated internally. (3) Nested context object — rejected as unnecessary ceremony.
Consequence: Phase 8's AI_APPLIED_SIMULATION path will not need a new type; the current shape fits it. Any future origin type — a scheduled/automated commit, e.g. — extends this union rather than adding a parallel service function. The 07-versioning-and-simulation.md doc's literal CommitOrigin shape is understood to be the abstract form; this entry records the concrete as-built form and the reason for the widening.
Source: Phase 4 kickoff exchange Q1 and Q10; 07-versioning-and-simulation.md §"Composing the invariant"; 00-product-freeze-reference.md invariant 3 and invariant 6.

ARCH-034 — All three .env files must point at the same database; drift produces silent dev-loop breakage
Date: 2026-09-26 | Status: FROZEN | Reversible: Yes, contained to .env.local, apps/web/.env.local, packages/db/.env
Decision: The three local env files — root .env.local, apps/web/.env.local, packages/db/.env — must always point at the same DATABASE_URL and DIRECT_URL. When switching between local Postgres and the remote vercel-dev Neon branch, all three are updated together.
Rationale: packages/db/.env is read by Prisma CLI (migrate, db seed, db execute) and by the packages/db test suite. apps/web/.env.local is read by the Next.js runtime — the dev server, route handlers, RSC, and tRPC procedures — even when those procedures ultimately call through packages/db. Root .env.local is read by root-level scripts. These readers are independent: Prisma CLI never reads apps/web/.env.local, and Next.js never reads packages/db/.env. During Phase 4's Builder E2E, packages/db/.env had been pointed at local Postgres but the other two files were left pointing at remote Neon. Result: POST /app/programs took 8.3 seconds instead of 84 milliseconds, the Program detail RSC hit a Prisma connection-pool timeout (17-connection limit, 10-second acquire), and the Builder route 500'd before the "Open Builder" link rendered — which the E2E reported as a missing locator with no obvious server-side cause.
Alternatives considered: (1) Startup assertion that all three files point at the same DB — rejected for now. Any check that reads all three files would itself need to know which is authoritative in which context; a runtime assertion in packages/db would fire during migrate deploy against production (where the files legitimately differ). (2) Single .env file at root — rejected: Next.js only reads apps/web/.env.local; Prisma CLI only reads packages/db/.env. (3) Symlink the two files to root — rejected: git would track symlinks (fragile across OSes), and each file legitimately needs different vars in some contexts.
Consequence: This is a documented convention, not an enforced invariant. A future session that resets local Postgres must update all three files, and the symptom to recognize is: "Prisma CLI is fast, Next.js is slow, RSC hits pool timeout." A Phase-5+ candidate is a globalSetup check in playwright.config.ts that asserts the three files agree.
Source: Phase 4 Builder E2E debugging session; the dev-server log showing an 8.3-second POST /app/programs and a 27.7-second RSC 500 with connection_limit: 17, timeout: 10.

ARCH-035 — Phase 5's phase-file scope is authoritative; PROJECT_STATE.md's earlier "pure-only" summary was wrong
Date: 2026-09-26 | Status: FROZEN | Reversible: N/A (documentation correction)
Decision: Phase 5 (Simulation, Mutation Invariant & Apply) is full-stack, exactly as phases/phase-05-simulation-and-apply.md specifies: domain simulation primitives in packages/domain/src/mutation/, API endpoints (simulation.simulate, programVersion.commitFromSimulation), a Simulation table write, and a minimal UI panel. The Phase 5 handoff prompt's initial framing ("Phase 5 is pure computation in packages/domain/src/simulation/ — no DB access, no migrations, no API, no UI") was authored from a stale PROJECT_STATE.md "Next phase" summary, not from the phase file, and is retracted.
Rationale: The PROJECT_STATE.md "Next phase" summary was written during Phase 4 close-out as a forecast, and — like all forecasts — it can drift from what the phase file actually specifies. When the Phase 5 session read the actual phases/phase-05-simulation-and-apply.md, it found its deliverables included simulation.simulate (a persisting tRPC procedure), a commitFromSimulation second call site for commitFromMutation, and a manual UI. The Phase 5 kickoff conversation surfaced the contradiction and resolved it in favor of the phase file.
Alternatives considered: (1) Follow the PROJECT_STATE summary (pure-only) — rejected: the phase file is the actual task specification; summaries are derivatives. (2) Split the difference by deferring the API/UI to a later phase — rejected: the phase file scopes them together on purpose (proving the full simulate → commit path end-to-end before Phase 8 adds a model in front of it).
Consequence: Standing rule: when a phase file and a PROJECT_STATE "Next phase" summary disagree, the phase file wins. The summary is a forecast; the phase file is the specification. Future handoff prompts should always be authored from the phase file, not from the summary.
Source: Phase 5 kickoff exchange Q1; phases/phase-05-simulation-and-apply.md; PROJECT_STATE.md Phase 4 close-out's "Next phase" block (superseded).

ARCH-036 — SimulationResult is a discriminated union (COMPUTED | CANNOT_COMPUTE | INVALID_MUTATION), and CANNOT_COMPUTE carries both analyses and both assessments
Date: 2026-09-26 | Status: FROZEN | Reversible: Yes, contained to packages/domain/src/mutation/types.ts and its consumers
Decision: simulate() returns a discriminated union keyed on kind:

ts
type SimulationResult =
  | {
      kind: "COMPUTED";
      baseAnalysis: Analysis;
      baseAssessment: AssessmentResult;
      mutatedStructure: ProgramStructure;
      mutatedAnalysis: Analysis;
      mutatedAssessment: AssessmentResult;
      gain: AssessedAxis[];
      cost: AssessedAxis[];
      net: "POSITIVE" | "NEGATIVE" | "MIXED" | "NO_MEANINGFUL_CHANGE";
      whatChanged: WhatChangedResult;
    }
  | {
      kind: "CANNOT_COMPUTE";
      reason: "ASSESSMENT_UNVALIDATED";
      baseAnalysis: Analysis;
      baseAssessment: AssessmentResult;
      mutatedAnalysis: Analysis;
      mutatedAssessment: AssessmentResult;
    }
  | { kind: "INVALID_MUTATION"; error: MutationError };
Three deviations from the doc's and Q3's literal shape: (a) mutatedStructure is carried on COMPUTED; (b) CANNOT_COMPUTE carries both analyses in addition to both assessments; (c) the whole type is a discriminated union keyed on kind.
Rationale: (a) mutatedStructure — a consumer would otherwise have to re-apply applyMutation to render the mutated state, creating a second call site for the mutation function — exactly what invariant 2 forbids. (b) CANNOT_COMPUTE carries analyses — the Simulation Prisma table's resultAnalysis column is non-null. (c) Discriminated union — same discipline as ARCH-028 and ARCH-030.
Alternatives considered: (1) Flat object with optional net — rejected. (2) CANNOT_COMPUTE carrying only assessments — rejected; the schema's non-null columns make the wider shape the honest one. (3) simulate() throwing — rejected; simulate is called by the future AI Coach's tool handler, where a throw would crash a conversation.
Consequence: Every consumer narrows on kind. The persisted Simulation row's non-null Json columns are satisfiable without a second engine pass. simulate() never throws.
Source: phases/phase-05-simulation-and-apply.md; Phase 5 kickoff exchange Q3; Simulation Prisma model from 04-database-schema.md.

ARCH-037 — WhatChangedResult and StructureDiffEntry are two distinct types for two distinct consumers
Date: 2026-09-26 | Status: FROZEN | Reversible: Yes, contained to packages/domain/src/mutation/diff-assessments.ts and diff-structures.ts
Decision: Two separate diff functions, two separate types:

diffAssessments(base, mutated): WhatChangedResult — assessment-level: meaningful: boolean, statusTransitions, membershipChanges, overallBandShift, tradeOffs. Drives the "no meaningful change" message in the UI and Phase 8's Coach narration.

diffStructures(base, mutated): StructureDiffEntry[] — structural: a discriminated union of ADDED_WORKOUT_DAY | REMOVED_WORKOUT_DAY | REORDERED_WORKOUT_DAY | ADDED_PRESCRIPTION | REMOVED_PRESCRIPTION | MODIFIED_PRESCRIPTION. Computed on demand; never stored on ProgramVersion.
Rationale: The two diffs answer different questions for different consumers. "Did the assessment meaningfully change?" is a semantic question the UI renders as a message. "What structural edits happened between two versions?" is a fact question the history view renders as a list. Per 03-domain-model.md, the structural diff is explicitly "computed on demand by comparing two versions' normalized rows, not stored redundantly."
Alternatives considered: (1) One DiffResult with both fields — rejected; every consumer would carry irrelevant fields. (2) Store StructureDiffEntry[] on ProgramVersion — rejected; contradicts 03-domain-model.md. (3) Return a stringified patch — rejected.
Consequence: History view reads diffStructures. Trade-off messaging reads diffAssessments. Phase 7's Review uses both.
Source: 07-versioning-and-simulation.md; 03-domain-model.md; Phase 5 kickoff exchange Q4.

ARCH-038 — Simulation "applied" status is derived from Revision.sourceSimulationId, never stored as a column
Date: 2026-09-26 | Status: FROZEN | Reversible: Yes, contained to packages/db/src/repositories/simulation.ts + packages/api/src/services/programVersionService.ts
Decision: The Simulation Prisma model has no "applied" field — no appliedAsVersionId, no appliedAt, no boolean. commitFromSimulation calls findAppliedRevisionForSimulation(simulationId) before opening its transaction: the query returns the Revision whose sourceSimulationId matches (or null). A non-null result raises SimulationAlreadyAppliedError; a null result proceeds.
Rationale: Revision.sourceSimulationId records exactly the fact "this revision was produced by that simulation." Adding a second field to Simulation would make two sources of truth for one fact. The derivation is a cheap indexed lookup. The alternative — a boolean or FK column — is a denormalization whose only benefit is saving one query per apply, which is not a bottleneck.
Alternatives considered: (1) Add Simulation.appliedAsVersionId String? @unique FK — rejected; two sources of truth. (2) Add Simulation.appliedAt DateTime? — rejected; same problem. (3) No check at all, rely on the stale-check — rejected; a re-apply of the same simulation would produce an identical second version if the base hasn't moved.
Consequence: Any future feature that wants "has this simulation been applied?" calls findAppliedRevisionForSimulation. Under concurrent retries, both calls could pass the check and both could then fail the stale-check — best-effort semantics apply. A future phase wanting strict serialization would add a unique constraint on Revision.sourceSimulationId or take a Program row lock.
Source: 04-database-schema.md (Revision model); Phase 5 kickoff exchange C3.

Next ID: ARCH-039. Every future phase that makes a genuine new architectural choice (not already covered by the reference docs above) must append an entry here before that phase is considered complete.