# Handoff: /check Session F (2026-11-08)

## Outcome

**Not ready to launch. Do not recommend launch.** Five fixes shipped, all tests green. The fresh independent audit scored the assessment **5/10** (flat against 5 before) and sign-up **4/10** (3 before), answer **Maybe** (No before). The founder's rule (assessment 7+ AND sign-up 6+ AND Yes/Maybe) is not met; under 6 on both. Branch `check-session-f` is **unpushed**; no PR.

## Fixes as shipped (one commit each, on `check-session-f`, from `check-parser-real-world`)

1. `7bfef17` **Days a week (ARCH-067).** Selector "How many days a week do you train?" (1-7; default = days parsed) travels as `/check/<hash>?d=N` (only when different from listed; hash unchanged). `check.analyze` takes `daysPerWeek?`, passes `AnalysisContext.daysPerWeek` to `computeAnalysis` and `nameActions`. Optional `context` added to `simulate` and `nameActions` so action after-numbers are in the same week; rotation advice withheld once the lifter answered it. 3-day PPL: "Under-dosed, 24 hard sets" + "run twice a week" at 3; at 6, neither appears (e2e). Split tab: selector defaults to "As the split lists it" (a split is one click; deviation from the brief). Options are 1-7, not 2-7.
2. `414fbcc` **Sign-up page.** Heading "Save your N-exercise program." / "Save your program." (from /check) / "Create your account." (direct; the brief's header would promise a program that does not exist). Lead says free, no credit card, export anytime; three bullets (each exists in the app); "Already have an account? Sign in →". Result CTA: "Free — save your program and check it again after edits." `&n=` validated 1-105. Inputs 44px, scoped. The real path is `apps/web/app/(auth)/signup/`, not `app/signup`.
3. `e2ecea6` **Example assessment** above the paste box, labelled Example. Faded by background and dashed border, **not CSS opacity** (would dim text and fail axe). Numbers tied by test to the profile bands and `ratioLines`. Paste box still on screen at 375x812.
4. `5f68e6a` **About.** Founder's wording: "Tested against 24 sample programs. 21 match our prediction of what a strength coach would say; 3 are documented exceptions awaiting real coach input. Real coach review is ongoing..." The brief's "5 coaches reviewed" was dropped: the real 5-coach review covered 6 of 25 programs, the rest of `expected.ts` is audit-authored. Second "signed them off" sentence removed. **No mailto** (founder chose to publish no address), so the invitation has no way to reply.
5. `1a1fdbf` **List labels.** `1a.`, `23.`, `a.`, `B.`, `(1)`, `(1a)` stripped. `1a. Barbell Row / 1b. Lat Pulldown / 2. Seated Row` = 3 exercises, 0 questions.
6. `2f410c2` ARCH-067, README row, PROJECT_STATE. (ARCH-066 is cited in `routineParser.ts` but has no file.)

No engine, config, schema, calibration or `packages/ai` file changed (`git diff a26c638..HEAD`). Coach parity 21/24, same pass set. `simulate.ts` and `namedActions.ts` changed (optional argument, identical output when absent).

## Tests

- Typecheck 15/15 tasks, lint clean. Domain 830, api 230, ai 61, db 9, config 4.
- `check.spec.ts` 30/30 (days selector, sign-up copy/flow, example, About, 1a., 375px, axe).
- Full e2e at 2 workers: 47 passed, 2 skipped, **3 failed** (`regression`, `progress-mobile`, `session-ux`). `regression` was `ERR_CONNECTION_REFUSED` after one "approaching the used memory threshold, restarting"; all three **pass in isolation at 1 worker** (5/5). Known dev-server memory flake; not caused by these changes.
- Negative control: `namedActions` context test fails when the context is dropped.

## Independent audits (fresh agents, browser only; scripts/screenshots in the session scratchpad `audit/runA`, `audit/runB`)

**Caveat on Run A:** the verbatim prompt was used, but the original programs were never saved, so both were **reconstructed** from the 2026-11-06 report (3-day PPL: Bench, OHP, Pushdown / Row, Pull-Up, Curl / Squat, RDL, 3 sets each = 24 sets; bro split: Chest Bench 4x8 + Incline 3x8, Back Row 4x8, Legs Squat 4x8, with a "Bro Split" title). Not byte-comparable; the comparison is approximate. Run B used the ChatGPT 5-day fixture as Program 1 and the same bro split as Program 2. I cannot prove the agents never read the repo; they were forbidden to and their reports contain only browser observations.

| | Original | My re-audit (biased) | Previous independent | **Run A (now)** | Run B (ChatGPT 5-day) |
|---|---|---|---|---|---|
| First impression | 5 | 6 | 5 | **6** | 6 |
| Parse | 6 / 4 | 7 | 7 | **8 / 6** | 8 / 6 |
| Assessment | 5 | 7 | 5 (PPL 5, bro 6) | **5 / 6** | 4 / 7 |
| Sign-up | 3 | 6 | 3 | **4** | 3 |
| Would sign up | No | Maybe | No | **Maybe** | Maybe |

Honest read: the fixes moved first impression, parse and the sign-up page's trust (free/no card removed the "paywall or dead product" worry), and the verdict moved from No to Maybe. They did **not** move the assessment, and the assessment is what drives sign-up: both agents said nothing in it made them want to track anything.

## What the auditors said is still wrong (ranked by frequency across both runs)

1. **Frequency is nearly invisible** ("No muscle gets 2 or more hard sets on more than one day" reads like a mistake). Both programs, both runs. (ARCH-065 deliberately did not make it a finding.)
2. **The headline is not what a coach says first**: bro split leads with "Hinge · exercise selection"; PPL leads with "under-dosed" and "run it twice".
3. **Contradicting numbers**: arms "none" vs triceps 3.5 / biceps 2 (known, by design: VOLUME credits synergists, ratios count direct sets). Run B also reports hamstrings 12 vs 9 and arms 12 vs biceps 13 / triceps 13 on the 5-day program.
4. **Run B, unverified by me:** a good program gets "STRONG, nothing flagged" with no biggest opportunity and no action; chest, delts, calves and abs do not appear in the cards, and "7 strengths" does not match six cards shown. Needs checking against the engine before acting (likely the 10-set strength rule and the Adequate-only cards, but not confirmed).
5. **Provisional language** (banner, "See evidence" tier wording, About) still reads as "unproven". The "Bro Split" title shows as an error; pre-green "Yes" looks answered. Back from a result loses the pasted text.
6. The sign-up pitch is generic; no one said what it does beyond a spreadsheet or Hevy.
7. About: "21 match our prediction" is the tool grading itself; the invitation has no address.

## Decision

Not launch. This is a **Session G** problem, not another cosmetic cycle: items 1-4 are about what the assessment leads with, which needs an engine/ranking or display-rollup design decision (frequency as a finding vs a stated fact; what a strong program shows; per-muscle table; one consistent counting rule). Founder calls needed: frequency finding vs not (ARCH-065 item 4), whether to keep "Provisional" in so many places, a feedback address for About, a product name.

## State

- Branch `check-session-f`, unpushed. Dev server stopped, `apps/web/.next` removed. `CHECK_PUBLIC=true` in `.env.local` unchanged.
- Scratchpad holds the audit prompt template, the three program files and screenshots (not committed).
