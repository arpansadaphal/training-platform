# Phase 6 — Training Execution & Logging

## Objective
Implement the `TrainingBlock` lifecycle, on-demand `Session` generation from the active `ProgramVersion`, and fast logging of `PerformanceRecord`s and `Observation`s — matching the table-stakes UX bar set by Strong/Hevy/Boostcamp, since this is explicitly not a place to spend differentiation effort.

## Scope
Activation → TrainingBlock, Session generation, logging UI, Observation capture. No Review yet (that's Phase 7, which reads this phase's data).

## Prerequisites
Phase 4 complete (a committed `ProgramVersion` must exist to train against).

## Exact deliverables
- `packages/api/src/routers/training.ts`: `activateVersion(programVersionId)` — sets `Program.activeVersionId`, closes the prior `TrainingBlock` (if any) per the automatic-lifecycle rule in `08-training-execution-and-evidence.md`, opens a new one.
- `packages/api/src/routers/session.ts`: `getOrCreateNext(programId)` — the lazy generation logic, cycling through the active version's `WorkoutDay`s in order; `markStarted`, `markCompleted`, `markSkipped`.
- `packages/api/src/routers/performance.ts`: `logSet` and a `logBatch` variant for logging several sets in one call (minimizing round-trips during an actual workout).
- `packages/api/src/routers/observation.ts`: `create`, `listForBlock`, `listForSession`.
- `apps/web/app/train/`: today's/next Session view; `apps/web/app/train/session/[id]/`: the logging UI itself — large tap targets, minimal navigation between sets, matching or exceeding competitor logging speed.
- Program archival closing an open `TrainingBlock` as `ABANDONED` if it wasn't already `COMPLETED`.

## Files/modules expected to be created
`packages/api/src/services/trainingService.ts`, `packages/db/src/repositories/{trainingBlockRepository, sessionRepository, performanceRecordRepository, observationRepository}.ts`, the UI routes above.

## Database changes
None beyond Phase 1's migration — this phase begins writing `TrainingBlock`, `Session`, `PerformanceRecord`, `Observation` rows.

## API changes
`training.activateVersion`, `training.getCurrentBlock`, `session.getOrCreateNext`, `session.markStarted`, `session.markCompleted`, `session.markSkipped`, `performance.logSet`, `performance.logBatch`, `observation.create`, `observation.listForBlock`, `observation.listForSession`.

## Domain changes
None — this phase is orchestration and persistence over already-existing structural data; no new pure computation is introduced.

## UI changes
The full logging flow: today's session → per-exercise set logging → session completion → optional post-session Observation.

## Tests
- `activateVersion` correctly closes the prior block (status resolves to `COMPLETED` if ≥1 session was completed, `ABANDONED` otherwise) and opens a new one.
- `getOrCreateNext` cycles through WorkoutDays in the correct order and does not duplicate a Session already in progress.
- Authorization: a user cannot log a `PerformanceRecord` against another user's Session.
- Deviation honesty: logging a set with different reps/load than prescribed is stored as logged, not silently reconciled against the prescription.

## Acceptance criteria
- A user can activate a committed program version, get today's session, log a full workout including at least one deliberate deviation from the plan, and mark it complete — in production, at a logging speed competitive with the table-stakes bar.
- Archiving a Program with an open block correctly resolves that block's status.

## Explicitly NOT included
Review (reads this phase's data but is built in Phase 7). Any AI involvement in logging. Any offline/mobile-specific behavior (that's the future `12-mobile-strategy.md` phase, not this one — this phase is web-only).

## Handoff information to the next phase
Update `PROJECT_STATE.md`: confirm the TrainingBlock lifecycle test suite passes, and list the exact repository functions Phase 7's Review aggregation will read from (`sessionRepository.listForBlock`, `performanceRecordRepository.listForSession`, `observationRepository.listForBlock`).
