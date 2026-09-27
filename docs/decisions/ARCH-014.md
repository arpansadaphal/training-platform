### ARCH-014 — `ProgramDraft` is many-per-Program, not one
Date: 2026-09-20 | Status: FROZEN | Reversible: No (would silently break a named JTBD if reverted)
Decision: A Program can hold several concurrent, labeled Drafts.
Rationale: Master Blueprint job-to-be-done #4 ("compare two candidate structures side by side before committing") is explicitly unsatisfiable with a one-draft-per-program model. Checked against this JTBD deliberately, not assumed.
Source: `03-domain-model.md`, `07-versioning-and-simulation.md`.
