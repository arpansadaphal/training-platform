# 06 — Assessment Engine & Fit Score (PART E, part 2 of 3)

Covers: Metric → Assessment → Action, the leverage roll-up, Strengths/Attention/Biggest Opportunity, Fit Score. Lives in `packages/domain/assessment/`, pure, same purity rules as `05-analysis-engine.md`.

## Core function

```typescript
computeAssessment(analysis: Analysis, goalProfile: GoalProfileDefinition): Assessment
```

## Types

```typescript
type Severity = 'NONE' | 'MINOR' | 'MODERATE' | 'MAJOR';
type Weight = 'LOW' | 'MEDIUM' | 'HIGH';
type Leverage = 'NONE' | 'LOW' | 'MODERATE' | 'HIGH';

interface AssessedAxis extends AnalysisAxisResult {
  severity: Severity;
  weight: Weight;
  leverage: Leverage;     // derived: severity × weight, see below
}

interface ActionSuggestion {
  relatedAxis: AssessedAxis;
  description: string;    // deterministic, template-generated — not AI-authored
}

interface Assessment {
  programVersionId: string | null;
  goalId: string;
  overallSummary: string;               // one plain-language sentence
  strengths: AssessedAxis[];
  attentionAreas: AssessedAxis[];
  biggestOpportunity: AssessedAxis | null;
  actions: ActionSuggestion[];
  thresholdsValidated: boolean;         // false ⇒ UI must show a "provisional" indicator
}
```

## The roll-up: leverage, not averaging

This is the single most important rule in the whole engine, restated from the Final Freeze §9 as a literal algorithm:

1. For every `AnalysisAxisResult`, look up its **Weight** from the active `GoalProfileConfig` (keyed by `${axisType}:${scopeKey}`).
2. Map its **Status** to a **Severity** (a status-to-severity table, also part of `GoalProfileConfig` — e.g., "Low" volume for a high-weight axis is more severe than "Low" for a low-weight axis; this mapping is itself part of what needs sports-science input, so it inherits the same `validated` flag).
3. `leverage = severityWeightTable[severity][weight]` — a small lookup table (not a multiplication of arbitrary numbers, to avoid smuggling in invented numeric weights disguised as "just multiplying"). This table's *shape* (Severity × Weight → Leverage) is fixed by this architecture; its *cell contents* remain a config concern reviewed alongside the thresholds.
4. **Biggest Opportunity** = `argmax(leverage)` among axes **not** in a "good" status. A high-leverage axis that is already in good status is a Strength, never the Biggest Opportunity — Biggest Opportunity is specifically about room for improvement.
5. **Strengths** = high-weight axes with good status.
6. **Attention areas** = axes whose severity clears a materiality threshold (small, normal-variance deviations are not surfaced as issues — this threshold is also part of the config, not hardcoded in the engine).
7. **Actions** = one deterministic, template-generated suggestion per Attention Area and per Biggest Opportunity — templates keyed by `(axisType, status, goalProfileKey)`, not AI-authored. The AI Coach may *phrase* these more naturally in conversation (L0), but it never originates the underlying suggestion — see `10-ai-coach-architecture.md`.

**Invariant enforced by construction:** no screen shows a Metric without a paired Assessment, and no Assessment item appears without at least one candidate Action unless the axis is already in-range (whose implicit Action is "nothing needed here"). This is enforced by `computeAssessment`'s return shape itself — there is no code path that returns an `AssessedAxis` without it being classified into Strengths, Attention, or neither, and no Attention/Opportunity axis without a corresponding `ActionSuggestion`.

## Duplicate root causes

If several axes point at the same underlying structural issue (e.g., a missing chest day depresses both Chest Volume and Chest Frequency), `computeAssessment` does not display two redundant Actions. Actions are deduplicated by a `rootCauseKey` derived from the mutation each Action implies (e.g., "add a chest-focused exercise" collapses volume-and-frequency-driven suggestions into one), keeping the Action list a set of *distinct available changes*, not a mirror of the axis list.

## Fit Score — guaranteed consistent by construction

```typescript
interface FitScore {
  band: string;                        // coarse, e.g. 'NEEDS_WORK' | 'DECENT' | 'STRONG' — no invented numeric cutoffs presented as validated
  derivedFromAssessmentComputedAt: string;
}

computeFitScore(assessment: Assessment): FitScore
```

The **only** input to `computeFitScore` is an already-computed `Assessment`. There is no alternate code path that reads `Analysis` directly to produce a number. This is a structural guarantee, not a testing convention: it is impossible for the Fit Score and the qualitative narrative to disagree, because the score has no independent access to the underlying data — it can only ever be a coarse projection of the leverage roll-up that already produced the narrative. This directly implements the Final Freeze §12's "never a separately-computed number that could disagree with the words next to it," which the source documents identify as a real, previously-documented competitor credibility failure.

Named bands are deliberately generic (`NEEDS_WORK` / `DECENT` / `STRONG`) rather than invented specific names, per the Final Freeze §12's explicit instruction to preserve named bands *if the source Assessment Redesign specifies them* and not invent replacements otherwise. If that source text is ever obtained, only the band-name strings and their cutoff mapping change — the "derived only from Assessment" guarantee does not.

## Why AssessmentSnapshot is persisted at Commit and Block-End (cross-reference)

See `04-database-schema.md` for the full rationale — repeated here only as a pointer because it's directly relevant to this engine's output: a persisted snapshot captures `thresholdsVersion` and `engineVersion` alongside the payload, so a historical Assessment is always reproducible even after the engine or its config evolves, and the Review screen (`08-training-execution-and-evidence.md`) reads the snapshot rather than recomputing by default.

## Testability

Same fixture-based approach as the Analysis engine. The Final Freeze's worked example is the canonical test: Chest (Low/Major/High → High leverage), Back (Adequate → None), Quads (High/Medium → Low leverage), Recovery (Excessive/Moderate → Moderate leverage) must produce Biggest Opportunity = Chest, Attention = Recovery, Strength = Back, exactly as specified. This fixture is checked into Phase 3's test suite verbatim — see `phases/phase-03-assessment-engine.md`.
