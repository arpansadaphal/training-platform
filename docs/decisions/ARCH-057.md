# ARCH-057 — Session auto-close on stale start

**Date:** 2026-10-21
**Status:** Accepted
**Supersedes:** none
**Superseded by:** none

## Context

Users forget to press "Mark complete". Before this decision, a session left IN_PROGRESS stayed open indefinitely. The next "Start training" reopened it, so a new day's sets would have been logged into an old session. The data already shows what happened, and forcing the user to close the session manually is user-hostile.

## Decision

When a user **starts a new session** (`getOrCreateNext` creating one, or `startSpecificDay`), any older session in IN_PROGRESS that the new start supersedes is **auto-closed before the new one begins**:

- **≥1 PerformanceRecord:** status = COMPLETED, `completedAt` = the latest record's `completedAt`.
- **0 records:** status = SKIPPED, `completedAt` = the moment of auto-close.

**Which IN_PROGRESS sessions are superseded.** This clarifies the founder's text, which said "any IN_PROGRESS session". Read literally, that would also close the session a user is deliberately resuming (the diagnostic's mid-session "come back and continue" path).

1. **Any IN_PROGRESS session of the same user in another TrainingBlock** is superseded by starting training anywhere.
2. **In the same block, an IN_PROGRESS session is superseded when:**
   - it is **stale**, meaning no activity for **6 hours** or more (activity is the latest record's `completedAt`, or else `startedAt`); or
   - the user explicitly picks a different day (ARCH-056).
3. **A non-stale IN_PROGRESS session in the same block is resumed, not closed.** This is the "continue" path. The landing screen and `/train` offer "Continue [day]" only for a non-stale session. A stale one is shown as finished-pending, and the next start closes it.

The 6-hour window is a product boundary, not a measurement. A normal session fits well inside it, and a session continued the next day does not.

**Effect on block resolution (ARCH-039).** A block whose only session was stale but had logged sets now resolves to COMPLETED, not ABANDONED. That is the correct outcome.

## Alternatives rejected

- **Leave sessions open until the user closes them:** the status quo, rejected for the reason above.
- **Close every IN_PROGRESS session on any start:** breaks resuming a session after a short break.

## Consequences

- Records in an auto-closed COMPLETED session are frozen (ARCH-055), as for a manually completed one.
- No schema change and no migration.
