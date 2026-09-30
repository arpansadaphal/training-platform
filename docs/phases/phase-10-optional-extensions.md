# Phase 10 — Optional Extensions (Should-Ship-If-Cheap)

## Objective
Implement the Final Freeze's explicitly-optional "SHOULD SHIP IF CHEAP" bucket: single-recipient sharing, the Block Report, and basic anticipation cues. **This phase is not part of the MVP and must never be treated as launch-blocking.** It exists as a separate phase specifically so it can't accidentally get folded into Phase 9's definition of done — see `17-roadmap-overview.md`.

## Scope
Three independent, separately-gate-able features. A team may implement none, one, or all three of the sub-sections below; they do not depend on each other.

## Prerequisites
Phase 9 complete (launch-ready MVP).

---

## 10a. Single-recipient sharing

### Deliverables
- `ProgramShare` table migration (fully designed already in `04-database-schema.md`, deliberately withheld until now).
- `packages/api/src/routers/sharing.ts`: `createShare(programId, recipientEmail, canViewExecutionHistory)`, `listShares`, `revoke`.
- Authorization changes in every owner-scoped router per `09-api-architecture.md`'s "shared-scoped" rule: a valid, unrevoked share grants structure/Analysis/Assessment read access; `canViewExecutionHistory` additionally gates TrainingBlock/Session/Observation visibility.
- Minimal UI: "Share with someone" action on a Program, a shared-with-me list for the recipient.

### Tests
A recipient with `canViewExecutionHistory: false` can see structure/Assessment but not logged Sessions; revoking a share immediately removes access (tested, not just assumed from the `revokedAt` field existing).

### Explicitly NOT included
Public link sharing, forking, a discovery library — all gated further per `17-roadmap-overview.md`'s "gates, not dates" philosophy and not part of this sub-phase.

---

## 10b. Block Report

### Deliverables
- `packages/api/src/services/blockReportService.ts`: synthesizes what changed, what was logged, what differed from the previous block, and relevant Observations — entirely from already-collected, already-deterministic data (`AssessmentSnapshot`, `PerformanceRecord`, `Observation`). No new data collection.
- Templated, tested copy over real data as the baseline (per Final Freeze §21) — an AI-personalized framing layer is a legitimate later enhancement, not required here.
- Shareable via 10a's mechanism if that sub-phase shipped; otherwise viewable in-app only.
- Ends with an explicit invitation into the next Build→Analyze step, not a dead end.

### Tests
A Block Report for a block with no prior block to compare against degrades gracefully (first-block case); forbidden-language checks (`13-testing-strategy.md`'s pattern) applied to any templated copy that references trends.

---

## 10c. Anticipation cues

### Deliverables
- Purely informational, forward-looking surfacing of data the system already has: "N sessions remaining in this block, then your Review" on the `/app` landing screen and/or the Train view.
- No streaks, no login counts, no loss-aversion framing — per Final Freeze §26's explicit exclusion list.

### Tests
Verify the cue text is generated from real `TrainingBlock.plannedLengthWeeks`/session-count data, not a hardcoded or vague approximation.

---

## Explicitly NOT included (whole phase)
A second Goal profile (Strength) is deliberately **not** included in this phase's scope as written, even though the Final Freeze lists it in the same should-ship-if-cheap bucket — adding it is a repeat of Phase 3's pattern (a new `goal-profiles/strength.ts` module + a new seeded `GoalProfileDefinition` row) and is better run as its own small, separately-scoped phase once real sports-science input for Strength's thresholds exists, rather than bundled here. Any public sharing, discovery, trainer tooling, second sport, or AI L2/L3 — all remain gated per `17-roadmap-overview.md`.

## Risks
The main risk of this phase is scope drift within it — e.g., "sharing" quietly growing a comment thread or a notification system. Each sub-phase's deliverables list above is the actual boundary; anything not listed is a new phase, not an addition to this one.

## Handoff information to the next phase
There is no fixed "next phase" after this one — per `17-roadmap-overview.md`'s gating philosophy, what comes next (AI L2, a second Goal profile, public sharing) unlocks on evidence from real usage, not from this roadmap. Update `PROJECT_STATE.md` to reflect exactly which of 10a/10b/10c were implemented, and record real usage data once available against the Final Freeze §30 gates, to inform what gets proposed as a genuinely new phase next.
