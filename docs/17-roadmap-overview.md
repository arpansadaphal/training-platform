# 17 — Phased Implementation Roadmap (PART L)

Detailed, implementation-ready specs for each phase are in `phases/`. This document is the map: what each phase is for, in order, and why the boundaries fall where they do.

## Sequencing logic

Phases 0–9 deliver exactly the Final Freeze's MUST-SHIP MVP scope, in an order where each phase produces something the next one can build on and — just as importantly — something independently testable before the next phase starts. Phase 10 is explicitly optional and separated out so it can never be mistaken for MVP-blocking, matching the Final Freeze's own must-ship / should-ship-if-cheap distinction.

| # | Phase | Produces | Depends on |
|---|---|---|---|
| 0 | Foundation | A deployed, empty, auth-working skeleton | — |
| 1 | Domain Model & Database | Full schema, seed reference data, repository layer | 0 |
| 2 | Analysis Engine | `computeAnalysis`, pure, fully tested | 1 (types only) |
| 3 | Assessment Engine & Fit Score | `computeAssessment`, `computeFitScore`, pure, fully tested | 2 |
| 4 | Builder & Commit | Draft editing, live Analyze, manual Commit → immutable ProgramVersion | 1, 2, 3 |
| 5 | Simulation & Apply | `applyMutation`, `simulate`, stale-state handling, the shared mutation invariant proven end to end | 4 |
| 6 | Training Execution | TrainingBlock lifecycle, Session generation, logging | 4 |
| 7 | Review & Revision | Review aggregation, version history, Revise entry point, Identity/Progress landing screen | 5, 6 |
| 8 | AI Coach L0/L1 | Tool system, structured/evidence-tagged responses, human-only Apply | 5, 7 |
| 9 | Hardening & Launch | Security review, rate limiting, launch-gate checks, full E2E pass | 0–8 |
| 10 | *Optional* — Sharing, Block Report, anticipation cues | Should-ship-if-cheap extensions | 9 |

## Why this order and not the example order verbatim
The brief's own example (0–9) is followed closely, with one addition: an explicit **Phase 10**, kept separate from Phase 9's hardening work, specifically so the should-ship-if-cheap items (sharing, Block Report, anticipation cues) can never accidentally be treated as launch-blocking. This directly implements the Final Freeze §29's instruction: "SHOULD SHIP IF CHEAP (explicitly not MUST SHIP — do not silently promote these)."

## Gates, not dates
Per the Final Freeze §30's own philosophy, nothing beyond Phase 10 (a second Goal profile beyond what Phase 10 might add, AI L2, sharing at public scale, a second sport, trainer tooling) is scheduled here at all — those unlock on evidence (the North-star metric, retained users completing ≥1 TrainingBlock, real unprompted share-initiation), not on a calendar. This roadmap stops at "MVP + optional cheap extensions" deliberately.

## How to use a phase file
Each `phases/phase-NN-*.md` is self-sufficient: it restates the invariants relevant to that phase, so an implementing AI session does not need to have read every earlier phase's conversation — only `PROJECT_STATE.md` (current state), `DECISIONS.md` (frozen decisions), and the specific phase file. See `HANDOFF_TEMPLATE.md` for the exact handoff packet structure.
