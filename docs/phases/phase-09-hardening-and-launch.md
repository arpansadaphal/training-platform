# Phase 9 — Production Hardening & Launch Readiness

## Objective
Close the gap between "the MVP loop works" (Phases 0–8) and "this is safe and reliable to put in front of real users." No new product surface area — this phase hardens what already exists.

## Scope
Security review, rate limiting, the scientific-threshold launch gate, performance pass, full E2E regression, accessibility pass, monitoring verification.

## Prerequisites
Phases 0–8 complete.

## Exact deliverables
- Rate limiting applied per `14-security-and-data-ownership.md`: stricter limits on `coach.postMessage` than on ordinary CRUD, implemented at the edge.
- A full authorization audit pass: every owner-scoped procedure re-verified against the authorization test suite from `13-testing-strategy.md`, including any procedure added in Phases 4–8 that wasn't covered by that suite's original scope.
- **The scientific-input launch gate, made operational, not just designed:** confirm the CI check introduced in Phase 3 (fail a `production`-flagged deploy if any `GoalProfileConfig.validated === false`) actually blocks a real deploy attempt in a staging rehearsal — this phase does not resolve the `[SCIENTIFIC INPUT REQUIRED]` items (that requires actual sports-science sign-off, outside this document's scope), it verifies the gate holding them back is real and cannot be silently bypassed. **If launch must proceed before that sign-off exists, this phase's job is to make that decision visible and explicit** (e.g., a deliberately-flipped, logged, dated override — never a quiet removal of the check).
- Full Playwright regression suite covering every acceptance criterion from Phases 4–8 in one continuous run (build → analyze → commit → train → log → review → revise → simulate via Coach → apply).
- Sentry alerting thresholds configured (not just error capture — actual alert routing for a solo developer, e.g., email/Slack on a new error type).
- A basic accessibility pass on the Builder, logging, and Review screens (keyboard navigation, semantic markup, color contrast) — not a full WCAG audit, but not skipped either.
- Backup/recovery verification: confirm Neon's point-in-time recovery is actually configured and its retention window is documented.
- `.env.example` and a deployment runbook finalized and accurate against the real, as-built system (not the Phase 0 plan).

## Files/modules expected to be created
No new product code modules expected; this phase's artifacts are configuration, CI rules, test suite consolidation, and documentation (a `docs/LAUNCH_CHECKLIST.md` is a reasonable deliverable here, separate from this architecture set).

## Database changes
None expected. If any are needed (e.g., an index added after a performance finding), they must be small, targeted migrations with a clear rationale logged in `DECISIONS.md`.

## API changes
None expected beyond rate-limiting middleware, which doesn't change any contract.

## Domain changes
None.

## UI changes
Accessibility fixes only, no new screens.

## Tests
The full regression suite described above, run against a staging or production-mirror environment, not just against a local/CI test database — this phase is specifically about catching gaps the per-phase test suites, run in isolation, wouldn't surface.

## Acceptance criteria
- The full end-to-end regression suite passes against a production-like environment.
- The scientific-threshold launch gate is confirmed to actually block a deploy in a staging rehearsal.
- Rate limiting is verified to actually engage under a simple load test against `coach.postMessage`.
- Sentry alert routing is confirmed with a manually-triggered test error.

## Explicitly NOT included
Any new product feature. Sharing, Block Report, anticipation cues, a second Goal profile — all Phase 10, not this phase, even if "cheap."

## Risks
The temptation in a hardening phase is scope creep in the other direction — quietly fixing "one small UX thing" that's actually a new feature. Treat any change proposed during this phase that isn't traceable to an existing acceptance criterion from Phases 0–8 as out of scope, to be logged as a future phase candidate instead.

## Handoff information to the next phase
Update `PROJECT_STATE.md`: mark the MVP as launch-ready (or explicitly not, with the specific blocking item named — most likely the scientific sign-off). This is the natural point to decide, as a product/business call outside this document's scope, whether Phase 10 is pursued before or after the initial launch.
