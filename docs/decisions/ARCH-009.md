### ARCH-009 — Vercel + Neon + Sentry hosting
Date: 2026-09-20 | Status: FROZEN | Reversible: Yes, escape hatch designed in (see ARCH-003)
Decision: Vercel (web/API), Neon (Postgres, branch-per-preview), Sentry (errors).
Rationale: Lowest-complexity, lowest-cost path to reliable production deployment for a solo developer.
Consequence: Named constraint — long blocking calls don't fit Vercel's serverless model; the AI Coach is designed around this from Phase 8.
Source: `01-architecture-recommendation.md` §10, `15-deployment.md`.
