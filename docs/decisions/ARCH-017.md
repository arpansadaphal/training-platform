### ARCH-017 — `Program.visibility` column added at Phase 1; `ProgramShare` table and all sharing logic deferred to Phase 10
Date: 2026-09-20 | Status: FROZEN | Reversible: N/A (both are additive)
Decision: The cheap, hard-to-retrofit schema piece (the enum column) ships early; the actual feature (table + logic + UI) does not ship until explicitly scheduled.
Rationale: Direct implementation of the Final Freeze's "architect now, build later" distinction for sharing — verified against §28's "do not expand the MVP" instruction.
Source: `04-database-schema.md`, `phases/phase-01-domain-and-database.md`, `phases/phase-10-optional-extensions.md`.


## Addenda

### 2026-10-02 — 10a deferred; ProgramShare remains unbuilt

*The original decision above stands unchanged. This addendum records new operational detail.*

Phase 10's chosen scope was 10b (Block Report) + 10c (anticipation cues). Single-recipient sharing (10a) was explicitly deferred. `ProgramShare` remains unbuilt; `Program.visibility` remains `PRIVATE`-only in practice; no shared-scoped read path exists in any owner-scoped router. Invariant 11 therefore stands unqualified: cross-user data access is unbuilt.

New target: the first phase that ships on evidence of demand for sharing, per `17-roadmap-overview.md`'s "gates, not dates" discipline — not a calendar-scheduled phase.

## Addenda

### 2026-10-02 — 10a deferred; ProgramShare remains unbuilt

*The original decision above stands unchanged. This addendum records new operational detail.*

Phase 10's chosen scope was 10b (Block Report) + 10c (anticipation cues). Single-recipient sharing (10a) was explicitly deferred. `ProgramShare` remains unbuilt; `Program.visibility` remains `PRIVATE`-only in practice; no shared-scoped read path exists in any owner-scoped router. Invariant 11 therefore stands unqualified: cross-user data access is unbuilt.

New target: the first phase that ships on evidence of demand for sharing, per `17-roadmap-overview.md`'s "gates, not dates" discipline — not a calendar-scheduled phase.

## Addenda

### 2026-10-02 — 10a deferred; ProgramShare remains unbuilt

*The original decision above stands unchanged. This addendum records new operational detail.*

Phase 10's chosen scope was 10b (Block Report) + 10c (anticipation cues). Single-recipient sharing (10a) was explicitly deferred. `ProgramShare` remains unbuilt; `Program.visibility` remains `PRIVATE`-only in practice; no shared-scoped read path exists in any owner-scoped router. Invariant 11 therefore stands unqualified: cross-user data access is unbuilt.

New target: the first phase that ships on evidence of demand for sharing, per `17-roadmap-overview.md`'s "gates, not dates" discipline — not a calendar-scheduled phase.
