# ARCH-055 — Set editing scope

**Date:** 2026-10-21
**Status:** Accepted
**Supersedes:** none
**Superseded by:** none

## Context

The lazy-lifter diagnostic (2026-10-21) found that a mistyped set (14 kg logged for 140 kg) could not be corrected. The bad set stayed in the record permanently, counted toward the prescribed set total, and will distort anything later built on logged loads. The honesty requirement (08-training-execution-and-evidence.md, `performanceService.ts`) says a PerformanceRecord stores what happened; it does not say a typo is what happened.

## Decision

Logged sets can be **edited or deleted while their Session is `IN_PROGRESS`**. Once the Session is `COMPLETED`, or `SKIPPED`, its records are frozen: no editing, no deletion.

- `performance.updateSet(sessionId, recordId, { actualReps?, actualLoad?, actualRpe? })`
- `performance.deleteSet(sessionId, recordId)`
- Both reject with `PRECONDITION_FAILED` unless the Session is `IN_PROGRESS`.
- Both use the same ownership check as `logSet`. A record or session belonging to another user is `NOT_FOUND` (ARCH-040). So is a record that does not belong to the named Session.
- Edits are validated the same way `logSet` validates input: shape and non-negativity only, never against the prescription.

**Rationale.** A completed session is what happened, so the frozen record honours "logs what happened". Mistakes are noticed during the session, so that is when correction is allowed.

No migration and no new fields.

## Alternatives rejected

- **Always editable, with `editedAt` tracking:** needs a migration and weakens the "frozen record" principle.
- **Always editable, by replacement:** dishonest; history silently changes after the fact.

## Consequences

- A user who notices a typo after marking the session complete cannot fix it. This is accepted. ARCH-057's auto-close makes this case slightly more likely, because a session can now be completed without the user pressing "Mark complete".
- Deleting a set can leave gaps in `setIndex`. Nothing reads `setIndex` as a dense sequence (Review counts records), so gaps are harmless.
