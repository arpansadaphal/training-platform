# ARCH-061 — Rest days: a flagged WorkoutDay in the rotation, outside the analysis and adherence

**Date:** 2026-10-24
**Status:** Accepted
**Supersedes:** none
**Superseded by:** none

## Context

A program is a rotation of workout days. A lifter who trains Push, Pull, Legs with a rest day between them had no way to say so: the rotation offered the next training day straight away, and an empty day added in the Builder would have been analysed and counted like any other.

## Decision

- **One additive column:** `WorkoutDay.isRestDay Boolean @default(false)` (migration `workout_day_is_rest_day`). NOT NULL with a default, so existing rows are training days and nothing is rewritten. `WorkoutDayStructure.isRestDay?` mirrors it in the structure snapshot. No other table or column changes.
- **A rest day has no prescriptions.** The structure schema rejects a rest day that carries exercises.
- **It sits in the rotation.** `resolveRotation` and the day picker treat it as any day; the picker labels it "(rest day)". When the user reaches it, the session screen says "Rest day — no training scheduled." and one action, "Continue to next day", closes the session as SKIPPED. A rest day is never started, logged or completed, so it adds nothing to completed-session counts, "last trained", Progress or the summary.
- **It is not analysed.** Callers strip rest days (`withoutRestDays`) before `computeAnalysis`: the preview router, commit, review recompute and `simulate`. `analysis/`, `assessment/` and `goal-profiles/` are not edited. As a second layer, the engine already reads zero from a day with no prescriptions on every axis; a test asserts the full analysis and assessment are identical with and without rest days.
- **It is not adherence.** `computeAdherence` drops sessions whose day is a rest day (they count as neither skipped nor in the session log), and the expected sessions per week uses training days only. The anticipation cue's sessions per week does the same.
- **The day picker's skip warning** leaves rest days out of the list of days that "will be marked as skipped".

## Consequences

- Passing over a rest day, or walking through it, never lowers adherence. A real skipped training day still does.
- Rest-day sessions exist as SKIPPED rows. Anything new that counts SKIPPED sessions must exclude rest days the way `computeAdherence` does.
- The Builder's rest-day card has no exercise list. Its name is editable (default "Rest").
- Calibration is unaffected: no engine file is touched and no calibration program contains a rest day.
