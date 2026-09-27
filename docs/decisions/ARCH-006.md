### ARCH-006 — Auth.js with JWT session strategy
Date: 2026-09-20 | Status: FROZEN | Reversible: Yes (provider-agnostic above the auth boundary)
Decision: Self-hosted Auth.js, JWT (not database) sessions.
Rationale: No per-MAU cost; critically, JWT sessions are what makes a future mobile client's bearer-token auth clean without a second auth system.
Alternatives considered: Clerk/Auth0 (faster to wire, real cost/lock-in trade-off) — explicitly noted as a reasonable substitute if speed-to-ship is prioritized.
Consequence: Mobile (Phase 12+) reuses the same session token mechanism.
Source: `01-architecture-recommendation.md` §7, `12-mobile-strategy.md`.
