### ARCH-005 — PostgreSQL + Prisma
Date: 2026-09-20 | Status: FROZEN | Reversible: ORM choice contained to `packages/db`
Decision: Postgres (Neon-hosted) via Prisma; domain/api packages never import Prisma types directly.
Rationale: Relentlessly relational domain; business logic deliberately lives in pure TS, not SQL, so Prisma's ergonomics outweigh Drizzle's SQL-closeness here.
Alternatives considered: Drizzle (close call, valid fallback), Kysely/raw SQL (no current need).
Consequence: Swapping ORMs later touches only `packages/db`.
Source: `01-architecture-recommendation.md` §5–6.
