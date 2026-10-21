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

---

## Addenda — 2026-10-21, cascade only forward

*The original text above stands, except where this addendum clarifies the cascade.*

The original text said picking a different day marks the skipped days and advances the rotation. That was ambiguous, and its "backwards picks wrap" paragraph is withdrawn. Clarified: **the cascade applies only when the picked day is AHEAD of the current rotation position** (a higher day index than the day the rotation would train next). Picking a day BEHIND the current position creates an extra session for that day and does NOT move the rotation pointer.

**Rationale.** "I want to do Push today" when the rotation says Pull is not a decision to skip Pull and Legs. It is a decision to do Push today. The rotation stays where it was, and the next visit shows Pull again.

**Consequence.**
- To actually skip days (say, back from holiday and jumping from Pull to Legs), pick Legs while the rotation is at Pull; Pull is marked SKIPPED.
- To do extra work or redo a day, pick an earlier day. It counts as a session, but the rotation does not change.

**Mechanism (no schema change).** The rotation pointer is no longer "the day after the latest Session". It is replayed from the block's closed Sessions in sequence order:
- a Session on the pointer's day, or ahead of it, moves the pointer past it;
- a Session behind the pointer is an extra and leaves it unchanged.

A pending PLANNED Session with no records that the picker supersedes is deleted rather than marked skipped (ARCH-057 addendum). The exception is when it sits on the pointer's day and the user picks ahead: then it is the day being skipped, and it is recorded as SKIPPED.
