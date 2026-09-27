### ARCH-003 — Next.js hosts both the web UI and the tRPC API at MVP
Date: 2026-09-20 | Status: FROZEN | Reversible: Contained-to-hosting (escape hatch designed in)
Decision: One Next.js app (`apps/web`) serves UI and API via Route Handlers; no standalone backend service at MVP.
Rationale: One deployable app for a solo developer; the tRPC router lives in its own `packages/api` package specifically so a future split to a standalone service is a thin adapter, not a rewrite.
Alternatives considered: Standalone Fastify/NestJS service. Rejected for now — no current requirement for independent scaling.
Consequence: AI Coach responses must be designed as streaming (Vercel execution-time constraint), not long blocking calls.
Source: `01-architecture-recommendation.md` §3, `02-system-architecture.md`.
