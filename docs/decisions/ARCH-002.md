### ARCH-002 — pnpm workspaces + Turborepo monorepo
Date: 2026-09-20 | Status: FROZEN | Reversible: Contained-to-tooling
Decision: pnpm + Turborepo over Nx or separate repos.
Rationale: Lowest conceptual overhead for a solo/small team sharing types between web, API, and future mobile.
Alternatives considered: Nx (more power, more ceremony); separate repos (breaks type sharing).
Consequence: `16-repository-structure.md`'s layout is load-bearing for every phase.
Source: `01-architecture-recommendation.md` §2.
