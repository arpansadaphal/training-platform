### ARCH-004 — tRPC over REST or GraphQL
Date: 2026-09-20 | Status: FROZEN | Reversible: Contained-to-`packages/api` (bounded hand-port possible)
Decision: tRPC + Zod, routers organized by domain resource.
Rationale: Every first-party client is TypeScript; full type inference with zero codegen.
Alternatives considered: REST (codegen/hand-sync overhead), GraphQL (no current need for its flexibility).
Consequence: A future external/public API consumer requires a hand-built REST facade over a subset of routers — acceptable, bounded cost, not a blocker now.
Source: `01-architecture-recommendation.md` §4, `09-api-architecture.md`.
