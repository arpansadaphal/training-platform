# Phase 11 (CANDIDATE — NOT AUTHORIZED) — Jev-Assisted Coach Routing Prototype

**This phase has no standing authorization.** It exists only so that *if* the benchmark plan in `19-jev-integration-review.md`§G is actually run and clears its adoption bar, there's a ready-made, correctly-scoped spec to hand to an implementing AI — instead of that decision being improvised in the moment. Do not begin this phase because it "looks easy" or because Jev seems interesting; begin it only when the trigger condition below is met.

## Trigger condition (must be true before this phase starts)
Phase 8 (AI Coach) has shipped and is in production with real conversation volume; the dataset and baselines described in `19-jev-integration-review.md`§G have been built and run; the result clears the "Adopt" decision rule stated there — not "Limited experimentation," not "Deferral." If any of this isn't true, this phase does not start, regardless of how much time has passed.

## Objective
Add an optional, feature-flagged, shadow-mode-first `DecisionProvider` (Jev-backed) as an advisory pre-classifier in front of the existing Phase 8 Coach loop — strictly a cost/latency optimization, never a new capability, never a new authority.

## Scope
`packages/ai/src/decision/` only. Zero changes to `packages/domain`, `packages/db`'s schema, or the mutation/simulation invariant. Zero changes to any confirmation or constraint-checking logic, which remain exactly as deterministic as they already are.

## Prerequisites
Phase 8 complete and in production. The `19-jev-integration-review.md` benchmark plan run to completion with results clearing the adoption bar.

## Exact deliverables
- `packages/ai/src/decision/DecisionProvider.ts` — the interface from `19-jev-integration-review.md`§E, verbatim.
- `packages/ai/src/decision/NullDecisionProvider.ts` — the default in every environment.
- `packages/ai/src/decision/JevDecisionProvider.ts` — the concrete implementation, with a pinned model version string in `packages/config`.
- `packages/ai/src/decision/ScriptedDecisionProvider.ts` — test double.
- `JEV_ROUTING_ENABLED` feature flag, default `false`.
- Orchestrator change in `packages/ai/src/orchestrator.ts`: an optional `decide()` call before the existing Claude tool-calling loop, whose result is logged unconditionally and only used to skip a planning step when confidence clears a documented, config-driven threshold — never to skip confirmation, never to bypass a tool call's normal validation.

## Database changes
None.

## API changes
None — this is entirely internal to `packages/ai`'s orchestration; no new tRPC procedure is needed for the Coach's existing contract to keep working.

## Domain changes
None. `packages/domain` is not touched by this phase, by design.

## UI changes
None required for the flag to function; optionally, a debug/observability view of routing decisions for the developer's own benchmarking, not a user-facing feature.

## Tests
Every test already required in `13-testing-strategy.md`'s AI test suite, plus: a test asserting `JEV_ROUTING_ENABLED=false` produces byte-for-byte identical Coach behavior to Phase 8's original implementation (the flag must be provably inert when off); a test asserting the orchestrator never skips confirmation or tool validation regardless of `decide()`'s output; a shadow-mode test asserting logged decisions never influence the response when the phase is run in logging-only mode.

## Acceptance criteria
- With the flag off, Coach behavior is unchanged from Phase 8, verified by test.
- With the flag on in shadow mode, decisions are logged but never acted on, verified by test.
- Removal test: deleting `JevDecisionProvider.ts` and flipping the flag's default requires no change anywhere else in the codebase.

## Explicitly NOT included
Any change to constraint-violation checking, trade-off detection, or the confirmation-required decision — all three stay exactly as deterministic/invariant as before this phase, per `19-jev-integration-review.md`'s explicit "Do not use" and "Not relevant" classifications. Any L2/L3 usage of Jev — that's a separate, even-later-gated evaluation, not part of this phase.

## Risks
The main risk of this phase, if it's ever run, is scope drift from "advisory pre-classifier" into something the confirmation boundary quietly starts to depend on. Treat any PR in this phase that gives `JevDecisionProvider` (or any `DecisionProvider`) an import path toward `commitFromMutation` as an automatic rejection, not a review comment — this is the one thing `ARCH-011`/`ARCH-018` in `DECISIONS.md` exist to prevent, and this phase is exactly the kind of "quick shortcut" Final Freeze §36 names as the highest-priority failure mode to guard against.

## Handoff information to the next phase
There is no defined next phase after this one. If this phase ships, update `PROJECT_STATE.md` with real production metrics (not the benchmark-stage numbers) and let those inform whether `JEV_ROUTING_ENABLED` is ever flipped from shadow-mode-only to actually influencing behavior — that flip is itself a decision requiring a new, explicit `DECISIONS.md` entry, not an assumed continuation of this phase.
