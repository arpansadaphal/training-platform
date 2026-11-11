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

## Third independent audit (2026-11-11, after Session G; fresh agents, browser only)

Run A: the verbatim prompt with the same reconstructed programs as Session F's Run A (3-day PPL, 24 sets; bro split, 15 sets), so it is the comparable run, but approximate for the same reason (the originals were never saved). Run B: the ChatGPT 5-day plus the same bro split. **Run A and Run B ran at the same time** on one dev server (the founder's instruction); rate limiting fails open locally, so no interference is expected. Each score is one agent's single read, so a point either way is within noise. Scripts and screenshots: scratchpad `audit/run3A`, `audit/run3B` (not committed).

| | Original | Mine (biased) | Prev. independent | Run A, Session F | **Run A, now** | Run B, Session F | **Run B, now** |
|---|---|---|---|---|---|---|---|
| First impression | 5 | 6 | 5 | 6 | **7** | 6 | **6** |
| Parse | 6 / 4 | 7 | 7 | 8 / 6 | **7 / 6** | 8 / 6 | **9 / 7** |
| Assessment | 5 | 7 | 5 | 5 / 6 | **6 / 5** | 4 / 7 | **5 / 7** |
| Sign-up | 3 | 6 | 3 | 4 | **4** | 3 | **4** |
| Would sign up | No | Maybe | No | Maybe | **Maybe** | Maybe | **Maybe** |

**Decision: not launch.** Neither run reaches assessment 7 or sign-up 6. Run A's assessment is flat (PPL 5 to 6, bro split 6 to 5; average 5.5 both times) and sign-up is flat at 4. Run B moved one point on each (STRONG program 4 to 5, sign-up 3 to 4). The tracking block and the once-a-week note did not move the score a reader gives.

### What the readers said (ranked by how many of the four Session F/G reports raise it)
1. **Biggest opportunity is "Hinge" on the bro split** (all four). Session G investigated and left ranking alone because both findings are HIGH leverage and axis-type order breaks the tie; the audits keep saying the headline is wrong. Both readers found the once-a-week note but called it easy to skim ("grey italic") and below the headline. **This is now a founder call, not a bug:** the engine ranks as configured, and the readers disagree with the configuration.
2. **A per-muscle table with every muscle and its sets** (all four, unprompted). Run B (twice) and Run A say chest, shoulders, calves, abs or arms never appear on a result ("is it fine or not checked?"). Run A: no triceps or biceps mention for a PPL with pushdowns and curls. Cause not yet verified (likely the "earned strength" 10-set rule and Adequate-only cards hide muscles that are fine but under 10).
3. **Numbers still contradict on a STRONG program** (Run B, twice): hamstrings 12 in the cards vs 9 in the balance line; arms 12 vs biceps 13 / triceps 13. Predicted in ARCH-069: suppressing balance only when findings exist leaves it where nothing is flagged.
4. **The added day ends under its own floor** (both): "...the week then has 27 hard sets; the general floor is 40" reads as a dead end. This is Session G's own sentence. For the PPL, the rotation (48) is the real fix and the day option (36) trails it.
5. **The yellow "no expert has signed them off" banner and About's "awaiting real coach input"** read as unfinished (both). The Tier 4 / "engine-derived" / "calibration" wording in the evidence panel reads as developer notes. About's "21 match our prediction" reads as a self-test.
6. **The sign-up pitch is generic.** Both asked for it tied to the finding ("fix this and see it update"), not a feature list. Run B: the button label differs between programs ("Create account and try it" vs "...save this program"), which reads as inconsistent. The tracking block for the STRONG program reads as features, not tied to anything found.
7. **Parse screen:** pre-highlighted "Yes" looks answered; "Bro Split" title listed as "Could not parse"; "Incline Curl" offered. (Unchanged since Session F; the bro title and Yes highlight were deferred then.)
8. **A good program teaches nothing.** "Looks solid / Nothing flagged" reads as flattery; both want one specific weakest point even on a strong program.

### Where this leaves Session G
Shipped and read as intended: the once-a-week note (both readers quoted it as the line a coach would say) and the day-based action. Not enough on its own, because of items 1-3: where it sits and what leads, the missing per-muscle view and the contradictory counts. Suggested next work, in order: a per-muscle weekly-sets view (answers 2 and 3 together by showing one number per muscle), a founder call on promoting the note above or into the headline (1), then the banner and evidence-panel wording (5). A fourth audit should follow whatever ships; with one agent per run, expect a point of noise.
