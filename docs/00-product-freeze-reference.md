# 00 — Product Freeze Reference

This is a condensed, engineering-oriented restatement of the **Final Frozen Product & Architecture Specification**. It is not a replacement for that document — it exists so an implementing engineer or AI agent can keep the load-bearing facts in view without re-reading the full product spec on every phase. If anything here ever seems to conflict with the Final Freeze, the Final Freeze wins; flag the conflict rather than silently resolving it.

## Thesis (one line)
A program-design intelligence system: users build a training Program, get it evaluated transparently against a stated Goal with reasoning shown (never a black box), train it, and revise it using an honestly-labeled record of what the design predicted vs. what actually happened.

## Core loop
```
BUILD (edit structure) ⇄ ANALYZE (deterministic Metric→Assessment→Action)
        → COMMIT (new immutable ProgramVersion)
        → TRAIN (log Sessions) → OBSERVE (subjective notes)
        → REVIEW (Assessment vs. execution) → REVISE (back to BUILD)
```
Build↔Analyze can cycle many times before a Commit. "Experiment" is not a separate stage.

## Non-negotiable invariants (the ones a refactor must never break)
1. **Deterministic engine is the sole source of quantitative truth.** The AI explains and proposes; it never invents or overrides a number the engine didn't produce.
2. **Simulate and Apply share one mutation function.** They differ only in whether the result is persisted. No second, divergent "real" mutation path may ever exist.
3. **ProgramVersion is immutable once committed.** Every edit after that produces version N+1, never an in-place change.
4. **Goal is never baked into ProgramVersion.** Assessment = f(ProgramVersion, Goal); Goal is a separate, selectable parameter.
5. **Applying a change is a distinct, explicit, human-triggered action.** Never inferred from conversational agreement, and never something the model can trigger on its own.
6. **Stale-state is detected, not silently overwritten.** If the base ProgramVersion changed between simulate and apply, re-simulation is required.
7. **Every AI claim beyond the raw Analysis/Assessment payload carries an evidence tag**: Planned / Executed / Observed / Interpreted.
8. **Fit Score is derived from the same leverage roll-up as the qualitative Assessment** — never an independently computed number that could disagree with the narrative.
9. **No outcome-guarantee language, ever** ("this will build X% more muscle," "this is objectively optimal") — forbidden regardless of framing.
10. **The AI never diagnoses pain, injury, or medical conditions** — always redirects to a professional.
11. **Cross-user data access is unbuilt and reserved** for a hypothetical, independently-justified future L3 — not a current capability under any framing.

## MVP scope boundary
| Bucket | Contents |
|---|---|
| **MUST SHIP** | Program builder, deterministic Analysis (goal-agnostic), Assessment for Hypertrophy only, versioning, full logging, minimal Review, AI Coach L0+L1, identity/history landing surface |
| **SHOULD SHIP IF CHEAP** | A second Goal profile (Strength), single-recipient sharing, anticipation cues, Block Report |
| **DEFERRED (not built, architecturally anticipated)** | Public sharing/library/fork, AI L2, trainer tooling, a second sport |
| **OUT OF SCOPE (not just deferred)** | Native nutrition database, native step/activity tracking, any population-level AI (L3) without independent justification, manufactured social presence |

## Explicit non-goals (do not build these under any framing)
General fitness social network · native food/nutrition database · native step tracking at any stage · manufactured "friends training now" presence · population-level AI prediction without methodological justification · streaks/login-count as the hero mechanic · AI-generated programs as the primary workflow · opaque AI scoring · a premature trainer marketplace · one blended popularity+quality ranking number · a feature-dashboard home screen · multiple sports in the initial build.

## Unresolved items inherited from the Final Freeze (do not invent values for these)
- **Numeric thresholds** for Volume, Frequency, Recovery Cost bands, per goal profile — `[SCIENTIFIC INPUT REQUIRED]`.
- **Goal weights per axis, per goal profile** — `[SCIENTIFIC INPUT REQUIRED]`.
- **North-star metric measurement window** ("within one block length," not operationalized) — `[UNRESOLVED DECISION]`.
- **Whether Fit Score has previously-named bands to preserve** — assumed no (generic Low/Adequate/High/Excessive/N/A) pending the actual Assessment Redesign source text.
- **This document's own provenance gap**: neither the Final Freeze nor this architecture pass had the actual "Assessment Redesign" or "Forge" source texts — only the Final Freeze's description of their contents.

This architecture plan preserves every one of these as an open configuration surface (see `05-analysis-engine.md` and `06-assessment-engine.md`) rather than filling them in. Nothing below should be read as resolving them.

## Terminology disambiguation (worth stating once, precisely)
The product glossary overloads "session" — a workout **Session** (an executed instance of a WorkoutDay) is a completely different thing from an AI **conversation session**. The Final Freeze's `TemporaryConstraint` is scoped to the latter (a Coach conversation), never the former. This document set always says "workout Session" or "Coach conversation" explicitly to avoid the ambiguity — see `03-domain-model.md`.
