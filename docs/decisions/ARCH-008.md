### ARCH-008 — Vitest + Playwright
Date: 2026-09-20 | Status: FROZEN | Reversible: Yes, low cost
Decision: Vitest for unit/integration, Playwright for E2E.
Rationale: Fast TS/ESM-native feedback loop; Playwright's multi-browser/stateful-flow support fits this product's long flows.
Source: `01-architecture-recommendation.md` §9.
