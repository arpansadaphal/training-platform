# ARCH-056 — Day picker rotation semantics

**Date:** 2026-10-21
**Status:** Accepted
**Supersedes:** none
**Superseded by:** none

## Context

Sessions rotate through the active version's WorkoutDays in order (`sessionService.getOrCreateNext`). A lifter who wanted Legs when the rotation said Pull had one workaround: "Skip session", which is unconfirmed, terminal, and takes one press per day skipped.

## Decision

`/train` shows a day picker that defaults to the rotation's suggested day. **Picking a different day marks the skipped day(s) as SKIPPED and starts the picked day. The rotation then advances from the picked day.** Adherence counts the skipped days.

`session.startSpecificDay(programId, workoutDayId)`:

1. The **suggested day** is the day of the block's pending Session (PLANNED or IN_PROGRESS) if one exists; otherwise the day after the latest Session's day (wrapping); otherwise the first day.
2. If the picked day *is* the suggested day, behave like `getOrCreateNext`: return the pending Session, or create one.
3. Otherwise, walk forward in rotation order from the suggested day to the day before the picked day, wrapping:
   - The suggested day's pending Session, if any, is closed: PLANNED becomes SKIPPED; IN_PROGRESS is auto-closed per ARCH-057 (COMPLETED if it has records, otherwise SKIPPED).
   - Every other day passed over gets a new Session created directly as SKIPPED.
   - Then a PLANNED Session is created for the picked day. `sequenceIndex` stays contiguous.
4. Because the picked day's Session is now the latest, the next `getOrCreateNext` suggests the day after it.

**Rationale.** It reflects what happened: if you skip Pull and do Legs, you skipped Pull.

**Picking "backwards" wraps.** If Legs is suggested and the user picks Pull in a Push/Pull/Legs split, Legs and Push are both marked skipped. The rotation is a cycle, so going back to Pull means passing over the rest of the cycle. The picker shows how many days will be marked skipped before the user confirms.

## Alternatives rejected

- **Create the session without advancing the rotation:** confusing. The user trains Legs three times and the app keeps insisting on Pull.
- **The picked day becomes a new rotation start:** overkill for MVP.

## Consequences

- Skipped days are visible in Review (ARCH-058) as sessions skipped and exercises not done.
- No schema change: SKIPPED Sessions are ordinary Session rows with status SKIPPED.
