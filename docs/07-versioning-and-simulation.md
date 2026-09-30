# 07 — Versioning, Mutation & Simulation (PART E, part 3 of 3)

This document covers the single highest-priority invariant in the entire system: **simulation and application are not two implementations that are merely supposed to agree — they are the same mutation logic, one of which persists its result and one of which doesn't.** Everything below exists to make that literally true in code, not just true by convention.

## The mutation function

```typescript
// packages/domain/mutation/apply-mutation.ts — pure, no I/O
applyMutation(structure: ProgramStructure, mutation: MutationSpec): ProgramStructure
```

```typescript
type MutationSpec =
  | { op: 'ADD_WORKOUT_DAY'; day: WorkoutDayStructure }
  | { op: 'REMOVE_WORKOUT_DAY'; workoutDayId: string }
  | { op: 'ADD_EXERCISE_PRESCRIPTION'; workoutDayId: string; prescription: ExercisePrescriptionStructure }
  | { op: 'REMOVE_EXERCISE_PRESCRIPTION'; prescriptionId: string }
  | { op: 'MODIFY_EXERCISE_PRESCRIPTION'; prescriptionId: string; changes: Partial<ExercisePrescriptionStructure> }
  | { op: 'REORDER_EXERCISE_PRESCRIPTIONS'; workoutDayId: string; orderedIds: string[] }
  | { op: 'REPLACE_STRUCTURE'; structure: ProgramStructure };
```

**Why two "shapes" of mutation (atomic ops vs. `REPLACE_STRUCTURE`):** AI-proposed changes are naturally scoped and semantic ("add a chest day," "swap incline press for flat press") — atomic ops map to these directly and give a legible tool schema. A rich manual Builder UI, by contrast, is far more naturally implemented as "submit the edited state" than as tracking every keystroke as an atomic diff. Both are legitimate inputs to the same `applyMutation` function (it pattern-matches on `op`), so the invariant holds either way. The consequence — manual edits via `REPLACE_STRUCTURE` don't get a semantic label the way an AI's atomic op does — is fine, because "What Changed" (below) compares **Assessments**, not raw structural diffs; a structural diff for history-view display is computed after the fact by comparing two versions' normalized rows, not by having captured the edit operation.

`applyMutation` validates all referenced ids exist in the base structure and throws a typed, catchable error otherwise (e.g., referencing an `exercisePrescriptionId` that isn't in the structure). Callers — both `packages/api` and `packages/ai` — must catch this and surface a clear message; it must never reach the user as a raw stack trace, and an AI-triggered invalid mutation must never crash the conversation.

## Composing the invariant: simulate vs. commit

```typescript
// Pure composition — packages/domain/mutation/simulate.ts
simulate(
  baseStructure: ProgramStructure,
  mutation: MutationSpec,
  goalProfile: GoalProfileDefinition,
  referenceData: ExerciseReferenceData
): SimulationResult {
  const baseAnalysis = computeAnalysis(baseStructure, referenceData);
  const baseAssessment = computeAssessment(baseAnalysis, goalProfile);
  const mutatedStructure = applyMutation(baseStructure, mutation);       // ← the shared function
  const mutatedAnalysis = computeAnalysis(mutatedStructure, referenceData);
  const mutatedAssessment = computeAssessment(mutatedAnalysis, goalProfile);
  return diffAssessments(baseAssessment, mutatedAssessment);             // Gain/Cost/Net + What Changed
}
```

```typescript
interface SimulationResult {
  baseAnalysis: Analysis;
  baseAssessment: Assessment;
  mutatedAnalysis: Analysis;
  mutatedAssessment: Assessment;
  gain: AssessedAxis[];
  cost: AssessedAxis[];
  net: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NO_MEANINGFUL_CHANGE';
  whatChanged: WhatChangedResult;
}

interface WhatChangedResult {
  meaningful: boolean;
  statusTransitions: Array<{ axisKey: string; from: string; to: string }>;
  membershipChanges: Array<{ set: 'STRENGTHS' | 'ATTENTION' | 'BIGGEST_OPPORTUNITY'; axisKey: string; change: 'ADDED' | 'REMOVED' }>;
  overallBandShift: { from: string; to: string } | null;
  tradeOffs: Array<{ improved: string; worsened: string }>;
}
```

Per the Final Freeze §15: a change is meaningful **iff** at least one of a status transition, a Strengths/Attention/Opportunity membership change, an overall band shift, or a genuine trade-off occurs. If none occur, `meaningful: false` and the UI must say so directly ("No meaningful change to your assessment") rather than displaying unchanged numbers.

**`Net` respects leverage, not raw counts** — a Gain on a low-weight axis does not offset a Cost on a high-weight one just because the two lists are the same length. `net` is computed from the leverage values of the gained/cost axes, never from `gain.length > cost.length`.

Orchestration layer (`packages/api`'s services and `packages/ai`'s tool handlers) calls `simulate()` for previews, and a separate `commitFromMutation()` — **defined once, in one service module, called from exactly two places** — for anything that persists:

```typescript
// packages/api/services/programVersionService.ts — orchestration, NOT pure
async function commitFromMutation(
  programId: string,
  mutation: MutationSpec,
  origin: { via: 'MANUAL_COMMIT' } | { via: 'AI_APPLIED_SIMULATION'; simulationId: string }
): Promise<ProgramVersion> {
  const current = await loadCurrentStructure(programId);       // packages/db
  const newStructure = applyMutation(current, mutation);        // ← the SAME shared function simulate() uses
  const analysis = computeAnalysis(newStructure, await loadReferenceData());
  const assessment = computeAssessment(analysis, await loadActiveGoalProfile(programId));
  return await persistNewVersion(programId, newStructure, analysis, assessment, origin); // packages/db, one transaction
}
```

The two call sites are: (1) the Builder's manual "Commit" button (`origin: MANUAL_COMMIT`), and (2) the client-triggered "Apply this change" button after a Coach-proposed simulation (`origin: AI_APPLIED_SIMULATION`). **There is no third path.** This is what makes "same mutation logic either way" verifiable by reading the code, not just by reading this document.

## Stale-state handling

Every `Simulation` row records the `baseVersionId` it was computed against. Before `commitFromMutation` executes the `AI_APPLIED_SIMULATION` path, it re-checks: is `simulation.baseVersionId` still equal to `program.activeVersionId`'s corresponding *latest committed version* for that program? If the Program has moved on since the simulation was run (a manual edit landed from another device, or a different simulation was applied first), the commit is **rejected** with a typed `StaleSimulationError`, and the client must re-run `simulate()` before offering Apply again. No diff is ever silently applied against structure it wasn't actually computed from.

## Draft vs. Simulation — two mechanisms, two jobs

Worth stating precisely because the source documents describe both without naming the distinction explicitly:

| | ProgramDraft | Simulation |
|---|---|---|
| Grain | Coarse — a whole candidate structure | Fine — one hypothetical tweak |
| Origin | User, editing in the Builder | Usually AI-proposed, sometimes a manual "try this one change" |
| Persistence | Mutable row, many per Program | Immutable record once created, references one base version |
| Job served | Master Blueprint JTBD #4 — compare two candidate *directions* side by side before committing | Final Freeze §13 — test one specific *tweak* against the current design |
| Path to becoming real | Explicit Commit | Explicit Apply (which is itself a `commitFromMutation` call) |

Both ultimately funnel into the same `commitFromMutation`. Neither ever mutates a persisted `ProgramVersion` in place.

## Commit and "set active" are separable operations, exposed as one action at MVP

`commitFromMutation` creates a new `ProgramVersion` and, by default, also sets it as the Program's active version — this is what the core loop diagram (Commit → Train) assumes as the common path. Under the hood these are two distinct domain operations (`createVersion`, `setActiveVersion`) composed together in the MVP's single "Commit" button. This costs nothing now and preserves a real future option — e.g., "save this as a version without switching what I'm training" — without a later refactor. See `ARCH-0XX` entries in `DECISIONS.md`.

## Historical reproducibility

A `ProgramVersion` from a year ago must remain understandable even after the schema evolves. Because `structureSnapshot` is the authoritative record (see `04-database-schema.md`) and `AssessmentSnapshot` freezes `engineVersion`/`thresholdsVersion` alongside its payload, reading an old version never depends on re-running new code against old data and hoping the interpretation hasn't drifted — see Final Freeze Appendix D's own instruction to "reconcile structurally... rather than requiring literal naming matches," which this design follows directly.

## Future forking

A fork (Round 2's "the social object is the evolution, not the current state") is architecturally just: copy a `ProgramVersion`'s `structureSnapshot` into a brand-new `Program` (new owner, `versionNumber` reset to 1, `createdVia: MANUAL_COMMIT`), optionally carrying a `forkedFromVersionId` pointer for provenance. Nothing in the versioning model above needs to change to support this later — it is not built now (sharing/forking is Phase 10 at earliest), but the reason it's cheap later is that `ProgramVersion` was never designed as something only one Program could ever reference.
