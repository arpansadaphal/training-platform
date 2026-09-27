### ARCH-012 — ProgramVersion stores both a canonical `structureSnapshot` and normalized rows
Date: 2026-09-20 | Status: FROZEN (revisit if normalized rows go unused — see `18-architecture-sanity-check.md`) | Reversible: Yes, contained to `packages/db` + `packages/domain`'s structure-loading code
Decision: The JSON snapshot is the single source of truth, written once at commit; normalized `WorkoutDay`/`ExercisePrescription` rows are a derived, regenerated-never-edited projection of it.
Rationale: Guarantees historical reproducibility even as row-level schema evolves, while preserving queryability and structural diffing for history views.
Alternatives considered: Normalized rows only (schema drift risk to historical meaning); snapshot only (loses queryability).
Source: `04-database-schema.md`.
