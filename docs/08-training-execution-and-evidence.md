# 08 — Training Execution, Evidence Model & Review

## Execution pipeline

```
Active ProgramVersion → TrainingBlock → Session → PerformanceRecord
                                      ↘ Observation
```

### TrainingBlock lifecycle (automatic, not a separate user action)
- **Opens:** the moment a `ProgramVersion` becomes a Program's `activeVersionId` (whether via manual "set active" or as part of a Commit).
- **Closes:** automatically, the moment a *different* version becomes active for that Program, or the Program is archived. Status resolves to `COMPLETED` if at least one Session was completed during the block, otherwise `ABANDONED`.
- **No explicit "end block" action is required.** This was a deliberate simplification: Review (below) is a read operation available for the *current, still-open* block at any time — showing whatever data exists so far — as well as for any past block. This single mechanism serves both a final post-block Review and Round 1's "lightweight mid-block check-in" idea without needing two code paths.

### Session generation
Sessions are generated **lazily**, one at a time ("get or create the next session"), from the active `ProgramVersion`'s `WorkoutDay` templates in `orderIndex` sequence, cycling as needed. They are **not** bulk-pregenerated for an entire block, because block length is informational (`TrainingBlock.plannedLengthWeeks`, nullable) rather than a hard constraint in this model.

### PerformanceRecord honesty
Deviations from the plan (fewer reps than prescribed, a different load, a skipped set) are recorded **as they happened**, never silently reconciled against the prescription. `ExercisePrescription` describes what was *planned*; `PerformanceRecord` describes what was *executed* — the gap between the two is exactly what Review exists to surface.

## The evidence model, concretely

| Category | Source table | Nature |
|---|---|---|
| **Planned** | `Analysis` / `Assessment` (via `ProgramVersion.structureSnapshot`) | Deterministic, design-time |
| **Executed** | `PerformanceRecord` | Hard data, but incomplete (no form, no external life factors) |
| **Observed** | `Observation` | Self-reported, useful but bounded in accuracy |
| **Interpreted** | AI Coach output beyond 1–3 | Always the most hedged, always visually distinct |

As established in `03-domain-model.md`, this categorization is **implicit by source table** everywhere except AI Coach output, where it must be an explicit, literal per-segment field (`10-ai-coach-architecture.md`). The RPE/RIR literature cited in the source strategy documents (Helms et al.; accuracy improves with familiarization; varies by exercise and proximity to failure) is the standing justification for why `Observation` data is never treated as ground truth by the deterministic engine or the AI — it is a real, bounded-accuracy signal, not noise, and not truth.

## Review

**Review is a read-only aggregation, not a stored entity.** It is computed on demand from data that already exists:

```typescript
interface ReviewData {
  trainingBlockId: string;
  assessmentSnapshot: AssessmentSnapshot;       // from Commit time — "what you saw when you started this block"
  adherence: {
    plannedSessions: number;                     // sessions expected so far, given elapsed time and template cadence
    completedSessions: number;
    systematicDeviations: DeviationSummary[];     // e.g. "bench press load consistently below prescription"
  };
  observations: Observation[];
  isPartial: boolean;                             // true if the block is still ACTIVE
}
```

`assessmentSnapshot` is read from the persisted snapshot (see `06-assessment-engine.md`'s rationale), **not recomputed live**, so Review always shows the Assessment the user actually saw and acted on when they committed to this block — with a clearly separate, opt-in "recompute with current thresholds" action available alongside it, never as the default.

Review deliberately requires no AI narrative to be valuable — Final Freeze §19 states this explicitly. The AI Coach may *discuss* a Review once L2 exists (post-MVP), but the screen itself is deterministic, already-collected data end to end.

## Revision, closing the loop

"Revise" is a UI entry point, not a new backend concept: it opens the Builder with a new `ProgramDraft` pre-populated from the just-reviewed `ProgramVersion` as its `baseVersionId`, carrying the Review's context (e.g., "Recovery was Excessive last block") into the next Build↔Analyze cycle. See `11-web-architecture.md` for the concrete flow.
