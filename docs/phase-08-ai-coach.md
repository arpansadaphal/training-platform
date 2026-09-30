# Phase 8 — AI Coach L0/L1

## Objective
Implement the AI Coach exactly as specified in `10-ai-coach-architecture.md`: L0 (Explainer) + L1 (Explorer), the tool system, structured evidence-tagged responses, and the confirmation boundary that makes "the AI never applies a change" an architectural fact rather than a prompted behavior.

## Scope
`packages/ai` in full, the Coach UI panel, wiring into the existing (Phase 5) simulate/apply machinery — reusing it, not reimplementing it.

## Prerequisites
Phases 5 (Simulation) and 7 (Review data, for context assembly) complete.

## Exact deliverables
- `packages/ai/src/provider/`: `ModelProvider` interface, `AnthropicProvider` implementation, `MockProvider` for tests.
- `packages/ai/src/context-builder.ts`: `buildCoachContext(userId, conversationId)`, exactly as specified — bounded and structured, `recentHistorySummary` present in the type but populated only when `L2_ENABLED` (Phase 8 ships this flag `false`).
- `packages/ai/src/tools/`: `lookupExercises`, `simulateProgramChange` (calls Phase 5's `simulate()` service function directly — the same one `simulation.simulate` calls), `prepareApplyConfirmation` (returns a render payload only, touches no mutating function), `noteConstraint`, `noteTemporaryConstraint`, `queryTrainingHistory` (implemented but excluded from the tools array passed to the model while `L2_ENABLED` is false).
- `packages/ai/src/orchestrator.ts`: the request loop — assemble context, call the provider with tools, execute requested tools, loop until a final structured response, persist.
- Structured output schema and validation for `AIMessageSegment[]` (per-claim `evidenceTag`), plus the numeric-grounding post-processing check described in `10-ai-coach-architecture.md`.
- `packages/api/src/routers/coach.ts`: `postMessage` (streaming), `listConversations`, `getConversation` — this router calls into `packages/ai`, never into `programVersionService`'s commit function directly.
- `apps/web/app/coach/` (and the persistent panel embedded in Program/Version views): chat UI, rendering `prepare_apply_confirmation` payloads as an explicit "Apply this change" button that calls `programVersion.commitFromSimulation` (Phase 5's existing client-side call) only on click.

## Files/modules expected to be created
Everything above, plus `packages/ai/src/__tests__/{grounding, confirmation-boundary, tool-authorization}.test.ts`.

## Database changes
None beyond Phase 1's migration — this phase begins writing `AIConversation`, `AIMessage`, `Constraint` (via `note_constraint`), and `TemporaryConstraint` rows.

## API changes
`coach.postMessage`, `coach.listConversations`, `coach.getConversation`, `constraint.list` (surfacing what the Coach has noted, visibly and editably, per the Final Freeze §17's requirement that `note_constraint` writes must never be silent).

## Domain changes
None new — this phase is orchestration over Phases 2, 3, and 5's existing pure functions.

## UI changes
Coach chat panel; Constraint list/edit view (so `note_constraint` writes are visible, not silent).

## Tests
Exactly the AI test suite specified in `13-testing-strategy.md`: tool invocation correctness with injected `userId`; grounding (a scripted out-of-context number fails validation); simulation consistency (the tool handler and the ordinary `simulation.simulate` procedure produce identical output for identical input); permission boundaries (a manipulated user-identifying tool argument from the model is ignored); structured output validation (every claim segment has a tag); failure-case graceful degradation. Additionally: a Playwright E2E asserting, via network inspection, that `commitFromSimulation` fires only after an explicit button click, never during message streaming.

## Acceptance criteria
- A user can ask "what if I changed X," see a grounded, evidence-tagged response with a Gain/Cost/Net simulation result, and explicitly apply it — producing a new `ProgramVersion` through the same path Phase 5 already proved correct.
- `packages/ai` has zero imports from `programVersionService`'s commit function (grep-checkable, and asserted by a dependency-boundary test if the toolchain supports it, e.g., an ESLint import-restriction rule).
- No AI response in the test suite ever contains a number absent from that turn's context/tool results.

## Explicitly NOT included
L2 (Historian) — `query_training_history` is implemented but not enabled. L3 — not implemented, not stubbed beyond a reserved interface name in a comment. Any population-level or cross-user data access.

## Risks
This phase carries the highest reputational/trust risk in the whole roadmap if the confirmation boundary is ever weakened "for convenience" under later product pressure — the Final Freeze names this exact failure mode explicitly (§36: "a future 'quick AI summary' shortcut that skips Assessment"). Treat any future PR that gives `packages/ai` a new import path toward a mutating function as requiring explicit, documented justification and a `DECISIONS.md` entry, not a routine code review approval.

## Handoff information to the next phase
Update `PROJECT_STATE.md`: confirm the confirmation-boundary test is in CI as a required check, list the tools implemented and which are currently enabled vs. reserved-but-gated (`query_training_history`), and confirm the `MockProvider`-based test suite runs without any real API key in CI.
