### ARCH-017 — `Program.visibility` column added at Phase 1; `ProgramShare` table and all sharing logic deferred to Phase 10
Date: 2026-09-20 | Status: FROZEN | Reversible: N/A (both are additive)
Decision: The cheap, hard-to-retrofit schema piece (the enum column) ships early; the actual feature (table + logic + UI) does not ship until explicitly scheduled.
Rationale: Direct implementation of the Final Freeze's "architect now, build later" distinction for sharing — verified against §28's "do not expand the MVP" instruction.
Source: `04-database-schema.md`, `phases/phase-01-domain-and-database.md`, `phases/phase-10-optional-extensions.md`.
