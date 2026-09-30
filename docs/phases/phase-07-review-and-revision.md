# Phase 7 — Review, Revision Loop & History

## Objective
Build the Review screen (Assessment vs. execution, side by side), the Revise entry point back into the Builder, version history, and the Identity/Progress landing screen that Round 2's research identifies as the single highest-leverage, zero-new-scope response to "does this feel like a training home."

## Scope
Review data aggregation, version history UI, Revise flow, `/app` landing screen redesign.

## Prerequisites
Phases 5 (Simulation, for the Revise → Builder handoff) and 6 (Training data to review) complete.

## Exact deliverables
- `packages/api/src/routers/review.ts`: `get(trainingBlockId)` returning the `ReviewData` shape from `08-training-execution-and-evidence.md` — reading the persisted `AssessmentSnapshot` (never live-recomputing by default), aggregating adherence (planned vs. completed sessions, systematic deviations) and Observations.
- `packages/api/src/services`: extend `AssessmentSnapshot` persistence to also write a `reason: BLOCK_END` snapshot when a `TrainingBlock` closes (per `06-assessment-engine.md`'s rationale) — actually reads the *existing* Commit-time snapshot if the version hasn't changed since commit, avoiding a redundant recompute when nothing about the design changed between commit and block-end.
- `apps/web/app/review/[blockId]/`: the Review UI — Assessment (as it was) next to execution summary and Observations, with a clearly separate, opt-in "recompute with current thresholds" action.
- `apps/web/app/programs/[id]/history/`: version history — the Revision list, "your story" framing (Round 2 §4's "History" lobby component, already implied by the versioned model, now surfaced as a first-class view).
- "Revise" action on the Review screen: creates a new `ProgramDraft` with `baseVersionId` set to the reviewed version, carrying forward the Review's Biggest Opportunity/Attention context as a UI hint into the Builder.
- `apps/web/app/(app)/page.tsx` (the `/app` landing route): current Program, active version status, today's session or an open Review as the primary call to action, headline accumulated stats — replacing any feature-grid placeholder from earlier phases.

## Files/modules expected to be created
`packages/api/src/routers/review.ts`, `packages/api/src/services/reviewService.ts`, the UI routes above.

## Database changes
None beyond what Phase 1 already created.

## API changes
`review.get`, `program.getIdentitySummary` (or equivalent — the landing screen's data needs).

## Domain changes
None new.

## UI changes
Review screen, version history screen, landing screen redesign — the three biggest UI deliverables in this phase.

## Tests
- `review.get` for a still-`ACTIVE` block returns `isPartial: true` and whatever data exists so far, without error — proving the "no separate end-block action required" design works for a genuinely in-progress block, not just a completed one.
- `review.get` for a `COMPLETED` block returns the Commit-time `AssessmentSnapshot`, not a live recompute, by default.
- Revise creates a Draft correctly pre-populated from the reviewed version.
- Landing screen E2E: a returning user with an active program and a completed session lands on `/app` and sees their current status as the primary content, not a feature grid.

## Acceptance criteria
- A user can review a training block (complete or still in progress), see design-vs-execution side by side with zero AI involvement required, and move directly into revising the program from that screen.
- The `/app` landing screen is the Identity/Progress surface, not a navigation grid — verified against Round 2 §4/§36's named risk.

## Explicitly NOT included
Any AI narrative on the Review screen (deliberately deterministic per Final Freeze §19). Block Report (Phase 10). Anticipation cues (Phase 10).

## Handoff information to the next phase
Update `PROJECT_STATE.md`: confirm the landing screen decision is implemented (not just planned), and note that Phase 8's Coach panel will need to read the same `AssessmentSnapshot`/Review data this phase's `review.get` already assembles — reuse, don't reimplement.
