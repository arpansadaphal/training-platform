# Handoff: /check Session G (2026-11-11)

Branch **`check-session-g`** (from `check-session-f`), **unpushed**, working tree clean after the final commit. No engine, config, schema, `packages/ai` or calibration change; engine stays 0.6.1; coach parity 21/24, same pass set (S1, S7, S8 fail).

## Commits, oldest first (all on `check-session-g`)
1. `baf4983` once-a-week "Program observation" (ARCH-068): unscored note, three variants, `muscleExposures` extracted from the FREQUENCY axis (identical output)
2. `9375835` + `17b2a26` whole-program volume action proposes a training day when the note fires (`addDay`, default off; type-error fix in a test)
3. `870b5d8` Variant B scoped to volume ("for volume specifically ... rather than cram more sets into your current days")
4. `d81fa7b` Fix 3, Fix 4, D2
5. the docs commit (ARCH-069, PROJECT_STATE, this file)

## 1. Fix 2 investigation (headline ranking): no change
Bro split, real library:

| Finding | Lead axis | Severity | Weight | Leverage |
|---|---|---|---|---|
| Hinge (hamstrings 0, glutes 2) | VOLUME:hamstrings | MAJOR | HIGH | HIGH |
| Whole-program volume (15 sets, floor 40) | PROGRAM_STRUCTURE:total-volume | MODERATE | HIGH | HIGH |
| Exercise selection gaps | EXERCISE_SELECTION_BALANCE | MODERATE | LOW | LOW |

Leverage and weight tie; `compareRanked` then breaks the tie by axis-type order (VOLUME before PROGRAM_STRUCTURE), so hinge leads. Whole-program volume is not mis-leveraged and not absorbed by the note: it is the first Attention area. Neither (a) nor (b) of the brief fit exactly, and the rule (change ranking only if leverage is wrong) says leave it. Verified in the screenshot: Overall (summary line names Hinge) → the note → Attention areas (whole-program volume first) → Biggest Opportunity (hinge) → Actions. **The summary line still says "Biggest opportunity: Hinge · exercise selection".** Letting total volume win ties is an engine ranking change (calibration and parity) and was not made.

## 3. Fix 3 as shipped
On `/check`, cross-muscle balance renders only when nothing is flagged (`checkMode && things > 0` hides it). Builder and Review keep it. Screenshot: `scratchpad/shots/observation-375.png` (bro split, no balance section). **Known limit:** where nothing is flagged the contradiction survives. On the STRONG ChatGPT 5-day program the balance reads hamstrings 9 and arms 12 beside cards reading hamstrings 12 and biceps/triceps 13 (direct sets vs synergist credit). Run B flagged exactly this.

## 4. Fix 4 as shipped (with claims checked)
When `findings.length === 0`, the sign-up block's heading is "Your program looks solid. Here's what tracking would give you:" with three bullets and one button, "Create account and try it" (same handoff as before). Screenshot: `scratchpad/shots/tracking-375.png`.

| Brief's claim | In the app | Shipped |
|---|---|---|
| a target every session, from your last | ARCH-062: **none for a lift with no history** ("First time — find your starting weights") | "From a lift's second session on, a target weight and reps, worked out from your last session" |
| progress view, first-vs-now on every lift | `firstVsNow`: baseline after 1 session, comparison from 2 | "...updates after each session, with your first top set next to your latest on every lift you log" |
| after 4 weeks a review says whether it is working | **Not true.** Blocks are not tied to weeks; Review reports a block's adherence and outcomes. What exists: a per-lift trend (3+ sessions, reads the last 4, estimated 1RM, threshold 5%) | dropped; replaced by "After 3 sessions of a lift, a trend: whether its estimated 1RM is rising, flat or falling over your last 4" |

"[See how it works]" is dropped: no page explains tracking (the landing page covers building, reasoning and the Coach). A test asserts the block never says "4 weeks", "working" or "no guessing". Bro split: no block, generic sign-up unchanged.

## 5. D2, D3, D4
- **D2:** user-visible "provisional" on `/check` was four (intro, banner, "Provisional fit:", About). Removed the intro sentence and the word in the `/check` Fit line (now "Fit:"; the banner is directly above). Now exactly two: the banner on a result and About. Tested by counting the word on landing (0), paste (0), result (1), About (1). Builder and Review still say "Provisional fit:".
- **D3 (mailto on About): not done.** The brief had `[FOUNDER EMAIL]` and the founder chose to skip. Sentence ready: "If you've spotted something wrong, email <address>." About still invites feedback with no way to send it.
- **D4 (product name): deferred.** "Training Platform" is a placeholder; noted in PROJECT_STATE. It appears in `apps/web/app/layout.tsx` (title), the landing page and `CheckNav.tsx`. No name was given, so nothing was renamed.

## Tests
- Typecheck and lint clean (15/15 and 20 tasks). Domain 846, api 238, ai 61, db 9, config 4. Calibration 22/22 unchanged.
- New: e2e for Fix 3 (no balance with findings, balance when none), Fix 4 (block only with zero findings, three bullets, forbidden claims absent, button carries the program, 375px), D2 (provisional count), Variant B string pins updated in domain, api and e2e.
- `check.spec.ts`: 40 passed (incl. axe with the note on screen, 375px). "Provisional fit" selectors in `check.spec.ts` and `rate-limit.spec.ts` became "Fit:".
- Full e2e at 2 workers: 57 passed, 2 skipped, **3 failed** (`journal`, `progress-mobile`, `session-ux`), all logged-in app specs, with one "approaching the used memory threshold, restarting" in the log. All three **pass in isolation at 1 worker** (5/5). Same known dev-server memory flake as Session F.

## Not done / open
Cross-muscle contradiction on programs with nothing flagged; the summary line naming Hinge; the "Provisional" wording in the banner and the evidence panel's tier jargon; D3; D4; the rest of the audit list (what a STRONG program shows beyond strengths, a per-muscle table). A third independent audit has not been run since Session F's (assessment 5, sign-up 4, Maybe); Session G's changes are unmeasured by a stranger.
