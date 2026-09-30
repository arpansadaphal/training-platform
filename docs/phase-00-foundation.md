# Phase 0 — Project Foundation & Tooling

## Objective
Stand up the monorepo, tooling, CI, and a deployed, empty, full-stack skeleton with working authentication — before any product domain logic exists. Validate the entire deployment pipeline cheaply, before there's anything complex to deploy.

## Scope
Repo scaffolding, package boundaries, CI, hosting wiring, auth, minimal layout shell. Explicitly **not** any Program/Analysis/Assessment/AI code.

## Prerequisites
None — this is the first phase.

## Exact deliverables
- pnpm workspace + Turborepo monorepo, matching `16-repository-structure.md` exactly (all five `packages/*` created as stubs, `apps/web` scaffolded, `apps/mobile` **not** created).
- `apps/web`: Next.js 15, App Router, TypeScript, deployed and reachable.
- `packages/db`: Prisma configured against Neon, schema containing only `User` and whatever Auth.js requires for a JWT session strategy (no `Account`/`Session` tables needed beyond what a credentials-only JWT setup requires; add OAuth-related tables only if an OAuth provider is wired in this phase).
- `packages/api`: an `appRouter` with exactly one real procedure, `user.getSelf`, plus the Next.js Route Handler that mounts it.
- `packages/domain`, `packages/ai`, `packages/config`: created with a `package.json`, a trivial passing export, and one trivial passing Vitest test each — proving the pipeline, not proving anything about the product yet.
- Auth.js wired: email/password signup + login, JWT session strategy, session available server-side in tRPC context.
- Public landing page (`/`) and an authenticated empty dashboard shell (`/app`).
- CI: GitHub Actions workflow running install → typecheck → lint → test → build on every PR.
- Deployed to Vercel (preview per PR + production), Neon configured with branch-per-preview.
- Sentry wired for both `apps/web` client and server code.
- ESLint + Prettier configured monorepo-wide.
- One trivial Playwright E2E test (loads the landing page and asserts it renders).

## Files/modules expected to be created
`turbo.json`, `pnpm-workspace.yaml`, root `package.json`, `.github/workflows/ci.yml`, `apps/web/app/{page.tsx, app/page.tsx, api/trpc/[trpc]/route.ts}`, `apps/web/app/(auth)/{signup,login}/page.tsx`, `packages/db/prisma/schema.prisma`, `packages/db/src/client.ts`, `packages/api/src/{router.ts, context.ts, routers/user.ts}`, `packages/domain/src/index.ts`, `packages/ai/src/index.ts`, `packages/config/src/env.ts`, `.env.example`.

## Database changes
Initial migration: `User` table + Auth.js's required JWT-strategy tables only.

## API changes
`user.getSelf` — the only real procedure. Everything else in `09-api-architecture.md` is out of scope for this phase.

## Domain changes
None. `packages/domain` exists as an empty, wired placeholder only.

## UI changes
Landing page, signup, login, empty authenticated dashboard shell. No Program-related UI of any kind.

## Tests
1 Vitest unit test per new package (trivial, proves the pipeline runs). 1 Playwright E2E: sign up → land on `/app` authenticated.

## Acceptance criteria
- A fresh visitor can sign up, log in, and see an authenticated empty dashboard, in production, on the real Vercel deployment.
- CI is green on a clean PR.
- `pnpm turbo run typecheck lint test build` succeeds from the repo root with zero errors.
- Sentry receives a manually-triggered test error from both client and server code during this phase's verification.

## Explicitly NOT included
Any Program/Draft/Version/Analysis/Assessment/Simulation/Training/Coach code or UI. Any styling beyond a minimal usable shell — visual design is a Phase 4+ concern per `/mnt/skills/public/frontend-design/SKILL.md`.

## Risks
Account/secret setup friction (Neon, Vercel, Sentry, Anthropic API key placeholder) is the main risk at this phase, not code complexity. Mitigate with a complete `.env.example` and a short, explicit setup checklist committed alongside this phase's code.

## Handoff information to the next phase
Update `PROJECT_STATE.md`: mark Phase 0 complete, record the exact Node/pnpm versions used, the live preview/production URLs, and any deviation from this spec (e.g., if an OAuth provider was added beyond email/password). Log any stack decision that had to be made concretely during implementation (e.g., a specific Auth.js configuration choice) in `DECISIONS.md` if it wasn't already covered by `01-architecture-recommendation.md`.
