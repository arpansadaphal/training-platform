# ARCH-058 — Review adherence: join on row ids; not-done and unlogged deviations; session log

**Date:** 2026-10-21
**Status:** Accepted
**Supersedes:** none
**Superseded by:** none

## Context

`reviewService.ts` says the ReviewData contract must not change without a decision entry. This batch changes it, for two reasons.

1. **A latent bug.** `computeAdherence` matched PerformanceRecords and Sessions to prescriptions and workout days using the ids inside `ProgramVersion.structureSnapshot`. It assumed those ids equal the normalized `WorkoutDay` / `ExercisePrescription` row ids (its own comment says so). They do not. The Builder assigns client-local ids (`day-…`, `rx-…`), and the rows get database cuids at commit. So for every program built in the UI, no logged set ever matched a prescription and Review reported "No systematic deviations" no matter what happened. The unit tests passed because their fixtures used matching ids. The same mismatch made the dashboard's day-name lookup always fall back to "Workout".
2. **The diagnostic asked for skipped work to be counted.** That means sessions skipped, and exercises left unlogged in a completed session.

## Decision

- **Adherence joins on row ids.** Review, Block Report and the identity summary build the execution-side structure from the normalized rows (`findVersionWithStructure`), whose ids are the ones Sessions and PerformanceRecords reference. The snapshot remains the source for the assessment (ARCH-015); only the execution join moves.
- **Two new `DeviationKind`s:**
  - `EXERCISES_NOT_DONE`: every planned exercise of a SKIPPED session, one occurrence each.
  - `EXERCISES_UNLOGGED`: an exercise with zero PerformanceRecords in a COMPLETED session. `SETS_SKIPPED` now applies only when 1 to n−1 sets were logged, so a fully unlogged exercise is not counted twice.
- **The systematic threshold (≥2 per exercise and kind) is unchanged**, and both new kinds feed it.
- **`ReviewAdherence` gains `summary`:** `{ sessionsSkipped, exercisesNotDone, exercisesUnlogged }`. Review shows it at the top always, even below the systematic threshold, so the user sees "3 exercises not done this block".
- **`ReviewAdherence` gains `sessionLog`:** one entry per session, with sequence, day name, status, `startedAt`, `completedAt`, and duration in minutes when both timestamps exist. Review and Block Report show durations from it.

## Consequences

- Deviation counts change for existing blocks: they now reflect what was logged. This is a correction, not a regression.
- The engine and the assessment are untouched. `calibration.test.ts` does not read adherence.
- Consumers: `ReviewClient`, `BlockReportClient`, `blockReportService`. `packages/ai` does not read `ReviewData`.
