# 05 — Deterministic Analysis Engine (PART E, part 1 of 3)

Covers: Analysis computation. Assessment, Simulation, and Mutation are in `06-assessment-engine.md` and `07-versioning-and-simulation.md` — this split follows the Final Freeze's own layering (Analysis = goal-agnostic "Metric" layer; Assessment = goal-specific interpretation).

## Placement and purity

Everything in this document lives in `packages/domain/analysis/`. **No function here imports Prisma, HTTP, or any framework.** Every function takes plain data in and returns plain data out — this is what "framework-independent core" (Final Freeze §31) means concretely, and it's what makes the entire engine testable with in-memory fixtures and zero database.

```typescript
computeAnalysis(structure: ProgramStructure, referenceData: ExerciseReferenceData): Analysis
```

`ExerciseReferenceData` is Exercise + MuscleGroup + ExerciseMuscleInvolvement data, loaded by the caller (a `packages/api` or `packages/ai` service) and passed in — the domain layer never fetches it itself.

## Analysis axes

Five axis types, per the Final Freeze §10 table. Volume and Frequency are **per-muscle-group** (one `AnalysisAxisResult` instance per tracked muscle group); the other three are single, program-wide axes.

```typescript
type AxisType =
  | 'VOLUME'
  | 'FREQUENCY'
  | 'EXERCISE_SELECTION_BALANCE'
  | 'PROGRESSION_SOUNDNESS'
  | 'RECOVERY_COST';

interface AnalysisAxisResult {
  axisType: AxisType;
  scopeKey: string | null;      // muscleGroupId for VOLUME/FREQUENCY, null otherwise
  metricValue: number | string; // e.g. 6 (sets/week), or a qualitative summary
  status: string;                // band name — set differs per axisType, see below
}

interface Analysis {
  programVersionId: string | null;  // null for a live Draft/Simulation preview not yet committed
  axisResults: AnalysisAxisResult[];
  computedAt: string;
}
```

| Axis | Scope | Status bands (given by the Final Freeze, not invented here) | How it's computed |
|---|---|---|---|
| Volume | per muscle group | Low / Adequate / High / Excessive / N/A | Sum of `targetSets × involvementFactor` across all ExercisePrescriptions touching that muscle group, per week |
| Frequency | per muscle group | Low / Adequate / High / N/A | Count of distinct WorkoutDays per week whose prescriptions touch that muscle group (with a minimum involvement threshold, itself part of the GoalProfile config) |
| Exercise selection balance | program-wide | Balanced / Gaps present | Movement-pattern coverage check across all prescriptions — resolvable from structural logic alone, no external validation needed |
| Progression scheme soundness | program-wide | Sound / Issue found | Internal consistency check of prescribed progression logic (e.g., a load scheme referencing a percentage of 1RM with no way to establish 1RM) — fully resolvable deterministically |
| Recovery cost | program-wide | Low / Moderate / High / Excessive | Aggregate fatigue signal — see open item below |

**Open item, flagged rather than resolved:** unlike Volume/Frequency (whose *formula* is fully structural — sum sets, count days), Recovery Cost's formula itself is not just missing thresholds; it plausibly needs inputs beyond ProgramVersion structure (training age, bodyweight, sleep) that this domain model doesn't currently capture. This document does not invent that formula. `computeRecoveryCost` is implemented behind a swappable interface (below) with a structural-only placeholder (total weekly volume × intensity distribution) explicitly marked provisional, pending the same sports-science review as the numeric thresholds. See `18-architecture-sanity-check.md`.

## Status-band thresholds: how they're represented without inventing them

```typescript
interface AxisBandDefinition {
  status: string;
  // Both bounds are `null | number`. A config with `validated: false` and
  // no real bounds is a legitimate, loadable configuration — it simply
  // cannot produce a "confident" Assessment (see 06-assessment-engine.md).
  lowerBound: number | null;
  upperBound: number | null;
}

interface GoalProfileConfig {
  goalProfileKey: string;
  axisWeights: Record<string, AxisWeight>;         // keyed by `${axisType}:${scopeKey ?? ''}`
  statusBands: Record<AxisType, AxisBandDefinition[]>;
  validated: boolean;      // false until sports-science sign-off — see launch gate below
  sourceNote: string;      // e.g. "UNRESOLVED — SCIENTIFIC INPUT REQUIRED, see Final Freeze §10/Appendix C"
}
```

No file in this codebase should ever contain a plausible-looking placeholder number (e.g., "10–20 sets/week") for these bounds — a value like that risks being mistaken for a real recommendation by a future contributor or an implementing AI that doesn't carry this document's context. The seed config for `HYPERTROPHY` ships with `lowerBound: null, upperBound: null` and `validated: false` for every band that the Final Freeze marks `[SCIENTIFIC INPUT REQUIRED]`, and `computeAnalysis` returns a `status: 'UNVALIDATED'` for any axis whose bounds are null, rather than guessing.

**Launch gate, made concrete, not just aspirational:** CI includes a check that greps all registered `GoalProfileConfig`s for `validated: false` and fails a `production` deploy if any goal profile intended to be live still has one. This is the literal implementation of Final Freeze §36's "Hard gate: `[SCIENTIFIC INPUT REQUIRED]` items require sign-off before launch."

## GoalProfile plug-in architecture

Adding a second goal profile (Strength, per the Final Freeze's "should-ship-if-cheap") must never require touching the orchestration code that calls `computeAnalysis`/`computeAssessment`. This is enforced by a registry pattern:

```typescript
interface GoalProfileDefinition {
  key: string;                              // 'HYPERTROPHY', 'STRENGTH', ...
  relevantAxes: AxisType[];                 // which axes this goal profile evaluates
  loadConfig(): GoalProfileConfig;          // reads from GoalProfileDefinition table or a versioned config file
}

// packages/domain/goal-profiles/registry.ts
class GoalProfileRegistry {
  register(profile: GoalProfileDefinition): void;
  get(key: string): GoalProfileDefinition;
}
```

Each concrete profile (`goal-profiles/hypertrophy.ts`, later `goal-profiles/strength.ts`) is a self-contained module implementing this interface and registering itself. `computeAssessment` (see `06-assessment-engine.md`) only ever talks to the registry's interface — it has no `if (goalKey === 'HYPERTROPHY')` branching anywhere. This directly satisfies the Final Freeze §10's requirement that shipping a second profile be additive, not a re-architecture.

## Engine independence from the UI

`packages/domain` has no concept of a "screen." It returns `Analysis` objects; `packages/api`'s services shape those into whatever a specific tRPC procedure's response contract promises; `apps/web` renders that. The Metric → Assessment → Action screen structure (Final Freeze §9) is a UI concern, described in `11-web-architecture.md`, not baked into the engine's return types.

## Testability

Because `computeAnalysis` is pure, its test suite is entirely fixture-based: hand-built `ProgramStructure` objects (e.g., "6 sets of flat bench + 4 sets of incline press, once a week" → expect a specific Chest volume axis result) with no database, no HTTP, no mocking. The Final Freeze's own worked example (§9: Chest=Low/Major/High, Back=Adequate, Quads=High/Medium, Recovery=Excessive/Moderate) is used as a literal fixture-based test case in Phase 2 — see `phases/phase-02-analysis-engine.md`.
