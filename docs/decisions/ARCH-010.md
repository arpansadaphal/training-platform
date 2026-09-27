### ARCH-010 — Three-layer split: domain (pure) / db (persistence) / api+ai (orchestration)
Date: 2026-09-20 | Status: FROZEN | Reversible: No (structural)
Decision: `packages/domain` never imports Prisma/HTTP/framework code; `packages/db` holds all persistence; `packages/api`/`packages/ai` coordinate the two.
Rationale: Directly implements the Final Freeze §31 "framework-independent core" requirement; makes the deterministic engine testable with zero infrastructure.
Source: `02-system-architecture.md`.
