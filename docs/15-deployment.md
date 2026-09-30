# 15 — Deployment (PART J, part 3 of 3)

Optimized for low complexity + low cost + reliable production deployment for a solo developer, per the explicit instruction. See `01-architecture-recommendation.md` decision #10 for the reasoning behind the choices below.

## Infrastructure

| Concern | Choice | Notes |
|---|---|---|
| Web + API hosting | Vercel | `apps/web`, includes the tRPC API at MVP |
| Database | Neon (managed Postgres) | Branch-per-preview-deployment |
| Error monitoring | Sentry | Client + server, both wired from Phase 0 |
| Secrets | Vercel environment variables | Scoped per environment (local/preview/staging/production) |
| Object/file storage | Not provisioned at MVP | No file uploads exist in the MVP scope; revisit only if a future feature (e.g., a Block Report PDF export, Phase 10+) needs it — Cloudflare R2 recommended then, for cost |
| Background jobs | Not provisioned at MVP | Nothing in MVP scope requires a scheduler; see below for the future path |
| CI | GitHub Actions | install → typecheck → lint → test → build, on every PR |

## Environments

- **Local dev:** developer's machine, local Postgres or a personal Neon branch, `.env.local`.
- **Preview:** automatic per pull request — Vercel preview deployment + a fresh Neon database branch, seeded via the same seed script used locally. Destroyed when the PR closes.
- **Staging (optional, pre-launch):** a long-lived Neon branch + a Vercel environment, used for a final pre-launch sanity pass, not a permanent fixture if the team is small enough that preview environments suffice day to day.
- **Production:** Neon primary branch, Vercel production deployment, real users.

## Migrations
Prisma Migrate, run as an explicit CI/CD step (not automatically on every deploy) — `pnpm prisma migrate deploy` gated behind a manual approval or a dedicated migration job, so a schema change is never silently applied by an ordinary code deploy. Every migration is checked into the repo under `packages/db/prisma/migrations/`.

## Logging & error monitoring
- Application errors: Sentry, both `apps/web`'s client and server code, with `packages/api` and `packages/ai` errors tagged by router/tool name so a Coach-tool failure is distinguishable from an ordinary CRUD failure at a glance.
- Structured logs: standard console-based structured logging (JSON) from server code, captured by Vercel's log drain — no separate logging infrastructure needed at this scale.

## Backups
Neon's built-in point-in-time recovery (available on its paid tiers) is the primary backup mechanism; verify the retention window matches business tolerance for data loss before launch and upgrade from the free tier if it doesn't. Not a custom-built backup system.

## When to reconsider Vercel + Neon
Named explicitly as a future decision point, not a current gap: if the AI Coach's usage grows enough that Vercel's serverless execution-time/cost model becomes a real constraint, or if a standalone API service (per `01-architecture-recommendation.md` decision #3's escape hatch) is warranted, Render/Railway/Fly.io become the natural next stop — because `packages/api`'s router package was deliberately kept independent of `apps/web`, this is a hosting change, not an architecture rewrite.

## Background jobs — future path, not built now
Nothing in the MVP or "should-ship-if-cheap" scope requires scheduled/background processing. If the Block Report (Phase 10) or anticipation-cue notifications are pursued, the recommended low-complexity path is Vercel Cron hitting a dedicated API route on a schedule, escalating to a lightweight Postgres-backed queue (e.g., `pg-boss`) only if volume ever demands more than a simple cron sweep — not a new piece of infrastructure (Redis, a message broker) introduced speculatively.
