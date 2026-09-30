# Phase 1 — Domain Model & Database Schema

## Objective
Implement the full data model described in `04-database-schema.md`, seed canonical reference data, and build the repository layer that translates Prisma rows to and from plain domain types — with no business logic yet beyond basic CRUD to prove the plumbing.

## Scope
Schema, migrations, seed scripts, repository functions, domain type definitions, minimal tRPC CRUD for `Program` to validate the stack end to end.

## Prerequisites
Phase 0 complete and deployed.

## Exact deliverables
- Full Prisma schema exactly as specified in `04-database-schema.md`, **with one deliberate omission**: the `ProgramShare` model is **not** included in this migration (it's fully designed in the doc but built in Phase 10 — see `04-database-schema.md`'s MVP-vs-anticipated table). `Program.visibility` and `Program.publicShowsExecutionHistory` columns **are** included now, unused beyond `PRIVATE`.
- Migration applied to a local dev database and a Neon preview branch.
- Seed script populating: a working set of canonical `Exercise` rows with `MovementPattern` and `ExerciseMuscleInvolvement` data sufficient to exercise every axis type in Phase 2 (at minimum: enough exercises to cover every movement pattern, and at least one exercise per major muscle group with a nonzero involvement factor); the full `MuscleGroup` lookup table; exactly one `GoalProfileDefinition` row (`key: 'HYPERTROPHY'`), with `validated: false` and placeholder-free `null` bounds per `05-analysis-engine.md`'s explicit instruction not to invent numbers even as seed data.
- `packages/domain/src/types.ts`: `ProgramStructure`, `WorkoutDayStructure`, `ExercisePrescriptionStructure`, `LoadScheme`, `EvidenceTag` — exactly as specified in `03-domain-model.md`.
- `packages/db/src/repositories/`: one module per aggregate (`programRepository`, `programVersionRepository`, `draftRepository`, `exerciseRepository`, `goalRepository`) — read/write functions returning plain domain types, never Prisma types, to any caller outside `packages/db`.
- `packages/api/src/routers/program.ts`: `create`, `listMine`, `get`, `rename`, `archive` — enough to prove the schema and repository layer work through a real request.

## Files/modules expected to be created
`packages/db/prisma/schema.prisma` (full), `packages/db/prisma/seed.ts`, `packages/db/src/repositories/*.ts`, `packages/domain/src/types.ts`, `packages/api/src/routers/program.ts`, `packages/api/src/services/programService.ts` (thin — this phase only needs CRUD).

## Database changes
Every table in `04-database-schema.md` except `ProgramShare`. This is the largest single migration in the whole roadmap — every subsequent phase adds much smaller, incremental migrations on top of this one.

## API changes
`program.create`, `program.listMine`, `program.get`, `program.rename`, `program.archive`.

## Domain changes
Type definitions only in this phase — no computation logic yet (that's Phases 2–3).

## UI changes
A minimal Program list/create/rename UI in `apps/web`, sufficient to exercise the new API by hand — not the real Builder (that's Phase 4).

## Tests
Repository-layer tests (Vitest + test database): round-trip a `Program` and a `ProgramVersion` with nested `WorkoutDay`/`ExercisePrescription` rows, assert the repository returns the correct plain-TS shape. API authorization test: a non-owner cannot `get`/`rename`/`archive` another user's Program.

## Acceptance criteria
- The full schema migrates cleanly on a fresh database.
- The seed script runs idempotently (safe to re-run).
- A user can create, list, rename, and archive a Program through the real API and UI, in production.
- No code outside `packages/db` imports anything from `@prisma/client` (grep-checkable).

## Explicitly NOT included
`ProgramShare` table. Any Analysis/Assessment computation. Any Draft editing UI beyond what's needed to prove Program CRUD. Any Simulation, Training, Review, or Coach code.

## Risks
Seed data quality directly gates Phase 2's ability to write meaningful fixture tests — under-seeding the Exercise catalog (e.g., missing coverage of a movement pattern) will surface as a Phase 2 blocker, not a Phase 1 bug. Verify seed coverage against every `AxisType` in `05-analysis-engine.md` before calling this phase done.

## Handoff information to the next phase
Update `PROJECT_STATE.md` with the final schema (or a pointer to the migration files), confirm seed data coverage against Phase 2's needs, and list every repository function now available for Phase 2 to build on. No new architectural decisions are expected in this phase beyond what `04-database-schema.md` already specifies; if any were made, log them in `DECISIONS.md`.
