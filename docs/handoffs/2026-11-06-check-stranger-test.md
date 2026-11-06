# Handoff: /check stranger test, lifter role-play (2026-11-06)

## Session summary

A diagnostic walk-through of the public Program Checker (`/check`, `/check/[hash]`, `/check/about`) as a stranger lifter who has never seen the app. **Nothing was fixed or changed in source.** No source was read; every finding is what appears on screen. Only the two programs from the brief were used, verbatim.

**Verdict: not impressive enough yet. The tester would not sign up.**

| Step | Rating |
|---|---|
| 1. First impression | 5/10 |
| 2. Parse confidence | 6/10 (program 1), 4/10 (program 2) |
| 3. Assessment | 5/10 |
| 4. Sign-up motivation | 3/10 |

The "damn" moment did not happen for program 1. The closest it came was program 2 (see Section 2 below).

## Repo and environment state

- No tracked files changed. Nothing was committed or pushed. Branch was `main`, clean, at the start.
- The dev server was **not** running although the brief said it was. It was started with `pnpm --filter web dev` and is **still running on :3000** (background task); stop it when done.
- `apps/web/.next` was deleted before starting (git-ignored; the stale-`.next` trap from the Session E status note). `CHECK_PUBLIC=true` was confirmed present in `apps/web/.env.local`.
- The Playwright MCP server failed to connect (CONNECT_TIMEOUT), so pages were driven with the `@playwright/test` install in `apps/web` via throwaway scripts kept in the session scratchpad, outside the repo. Screenshots are in that scratchpad and are not committed.
- The Next.js dev badge ("N", bottom-left) was ignored, and all timings are dev-server timings.
- On the sign-up page the tester only looked; nothing was filled in or submitted. No `/app` or authenticated feature was touched.

## Method caveat that matters

On the first program 2 run, the automation clicked the pre-highlighted "Yes" on every question, including "Incline 3x8 → Did you mean 'Incline Curl'?". That run's assessment counted an Incline Curl (arms 3 sets, press 4 vs pull 7), which is wrong. The program was re-run the way a careful lifter would answer (Incline Dumbbell Press, "Bro Split" line deleted). The findings below use the careful run, except Problem 6, which describes what the default does to a careless run.

## What a stranger sees, step by step

1. **Landing.** A white form titled "Program Checker" with the line "The result is a structural read, labeled provisional." No example result, no promise of what the user gets, and "Training Platform" as the only brand. Mobile at 390px has no horizontal scroll.
2. **Paste and parse (program 1).** Correct structure: 3 days, sets × reps right, and OHP and RDL recognised without asking. It then asks four "Did you mean…?" questions on Bench, Row, Curl and Squat. All "Yes" buttons are already green, yet "Check my program" stays disabled ("Answer or remove 4 lines before checking."). After four Yes clicks it is still disabled ("Confirm the reading above to continue."): the "Looks right" button above is a second, easy-to-miss gate. On a phone the step is about 2400px of buttons.
3. **Assessment (program 1).** About 2.8s on a bare "Reading your program" state, then:
   - A top amber banner: "Thresholds are evidence-graded, not human-validated… Tier 4 is engine-derived."
   - Overall: "Provisional fit: NEEDS WORK", "5 strengths · 1 thing to look at. Biggest opportunity: Whole-program volume."
   - Strengths: biceps, lats and triceps volume "Adequate" at 6 sets/week (range 6–20); "Exercise selection: Balanced, 6 of 6 patterns"; "Effort & rep ranges: Sound, No issues… pass the engine's checks".
   - Biggest opportunity: "Under-dosed: 24 hard sets per week… A general floor is around 40."
   - Action (single block): "Start with: Add 4 sets of Cable Lateral Raise on Push → side delts 5.5 sets/week. Add 4 sets of Face Pull on Push → rear delts 5.5 sets/week. The Adequate range starts at 6."
   - Cross-muscle balance: press 9 / pull 9, arms 6 / legs 6, quads 3 / hamstrings 3 (all "1 to 1").
   - "Details" panels show only `Metric / Weight / Severity / Leverage`. The evidence panel is blunt: some thresholds are "a product decision" and "no expert has yet signed off the profile as a whole".
4. **Sign-up.** CTA "Want to track whether this is working? Create an account." leads to `/signup?from=check`: a bare email and password form, no header, no price, no description of the app, only "Sign up to save the program you just checked as your first program."
5. **Program 2 (bro split, careful run).**
   - Parse: the "Bro Split" title line is listed under "Could not parse" with a Delete button. After Delete the error card disappears but the text stays in the box.
   - "Incline 3x8" defaulted to "Incline Curl".
   - The disabled-button message read "Add 3 more recognized exercises to check a program" although 4 exercises were pasted. The 2026-11-03 handoff says the button needs 3 *resolved* exercises, so the message likely counts only the already-resolved ones. That is an inference, not verified.
   - Assessment: "2 strengths · 3 things to look at. Biggest opportunity: Hinge · exercise selection."
   - Strengths: chest 7 sets (Adequate) and "Effort & rep ranges: Sound".
   - Attention: 15 sets total vs about 40, and "No vertical pushing or vertical pulling exercise".
   - Biggest opportunity: "No hinge exercises: hamstrings 0 and glutes 2 hard sets a week."
   - Actions: RDL and Hip Thrust (lands hamstrings 4, glutes 6, "Adequate starts at 6"); then "Start with: Add 4 sets of Lateral Raise on Chest… Add 6 sets of Dumbbell Row on Chest → upper back 5 sets/week"; then "Add an overhead or shoulder press and a pulldown or chin-up, about 3 sets each."
   - Balance: press 7 / pull 4, "Your arms get none", "your hamstrings get none".
6. **Share link and About.** Program 1's result link opens cold in a fresh browser and shows the full assessment with the CTA. The URL is 336 characters. `/check/about` is a short, plain page ("tested against 24 test programs, reviewed by 5 coaches. 21 match the headline the coaches gave"), with a "Continue to the checker →" button.

## Section 2: The "damn" moment

It did not happen for program 1. The closest was program 2: "No hinge exercises: hamstrings 0 and glutes 2 hard sets a week", followed by "Add an overhead or shoulder press and a pulldown or chin-up, about 3 sets each." That is plain, specific and coach-like, and the tester only got it by flawing the program on purpose.

For program 1 the one non-obvious fact (side and rear delts get about 1.5 sets/week) appears only inside the action text and is never called out as a finding. To get the "damn", the result must lead with the sharpest true thing, in plain words. For program 1 that is "every muscle is trained once a week, and chest, quads and hamstrings get only 3 sets." It says none of this.

## Specific problems, ranked by damage to a stranger's trust

1. **The action contradicts itself.** Program 1: adding 4 sets of lateral raises gives "side delts 5.5 sets/week" while the same line says "The Adequate range starts at 6". Program 2 repeats it (hamstrings 4, side delts 4, upper back 5, all under 6). "Add 6 sets of Dumbbell Row → upper back 5 sets/week" is unreadable to someone who already does 4 sets of rows. *Fix:* recommend changes that reach the target they cite, and make the arithmetic readable.
2. **"Start with" is not the biggest opportunity.** Program 2 headlines Hinge but puts "Start with:" on lateral raises and dumbbell rows (on the chest day, which a coach would not do). Program 1 headlines total volume (24 vs about 40) but the action only adds delt isolation, so doing it still leaves 32 sets. *Fix:* the first action fixes the headline problem.
3. **The strengths are filler.** Biceps, lats and triceps are "strengths" at the very bottom of the range. "Effort & rep ranges: Sound" praises effort data the user never entered (the page says it assumed RPE 8). In program 2 that line is the only strength of a 4-exercise program. "NEEDS WORK" next to "5 strengths · 1 thing to look at" does not add up. *Fix:* fewer, earned strengths; no praise for the absence of problems.
4. **It misses the first thing a coach would say: frequency.** A bro split and a once-a-week PPL both train each muscle once a week. Neither assessment mentions it, although the evidence panel lists "Frequency" as a graded area. Program 1's chest, quads and hamstrings (3 sets each) are not flagged; quads and hamstrings appear only as bland "1 to 1" balance bullets. Program 2's "Your arms get none" is a small bullet at the bottom, not a finding.
5. **The confirmation step is too much friction.** Pre-green "Yes" buttons look answered but are not; there is a second hidden gate ("Looks right"); each question carries about six buttons including odd options (Belt Squat, Meadows Row); the step runs about 2400px on a phone; and the most common lifts are questioned. *Fix:* auto-accept the obvious lifts, use the day's context, keep one gate, make "Yes" look unselected, fix the "Add 3 more recognized exercises" message.
6. **A wrong default silently corrupts the result.** "Incline" on a Chest day under Bench defaulted to "Incline Curl", a biceps exercise. A tired lifter clicks the big green button and the whole assessment is wrong. One visible mistake like this would make the tester distrust everything else.
7. **The trust messaging is jargon-heavy and placed first.** The amber banner says "not human-validated… Tier 4 is engine-derived" before any value is shown. "Details" shows `Metric / Weight / Severity / Leverage` with no explanation of which exercises counted. About says "reviewed by 5 coaches" while the result page says "not human-validated", which reads as a contradiction. The About page also says "This engine" and talks about "severity gradation… per-program buckets".
8. **Smaller issues.**
   - The "Bro Split" title shows as "Could not parse", and Delete leaves the text in the box.
   - Result URLs are about 336 characters.
   - The loading state is bare text for about 2.8s.
   - The sign-up page has no header, no price and no explanation of the app.

## Would they sign up?

**No.** The deciding factor: nothing in the assessment made the tester want to track anything. It is a one-time diagnosis, and the CTA ("Want to track whether this is working?") never shows what tracking looks like. The sign-up page is a bare form with no price or "free" label, so a paywall or a dead product cannot be ruled out.

## About page

It is honest and does not erode trust, but it does not build it either. The 21/24 figure is the strongest trust statement on the site and is buried behind a small link at the bottom of `/check`, phrased in engineering language. The tester would share the checker with a curious friend but would not share the About link, and would share a result link only if the result were surprising or flattering. "NEEDS WORK" plus the caveat banner is neither. Rating: about 5/10.

## What to fix before public launch (tester's top five)

1. **Make actions match the diagnosis and stop contradicting themselves.** The first action fixes the biggest opportunity, targets reach the stated threshold, and the numbers read sensibly.
2. **Say the coach's sentence first.** Name once-a-week frequency and the muscles at 3 sets or fewer in plain words. Drop the filler strengths (including "effort sound" with no effort data) and reconcile the "NEEDS WORK" headline with the strengths count.
3. **Cut the confirmation friction.** Auto-accept Bench, Squat, Row and Curl; use the day's context so Incline on a Chest day never becomes Incline Curl; make "Yes" look unselected; remove the second gate; fix the "Add 3 more" message.
4. **Rework the trust messaging.** Put "24 programs, 5 coaches, 21 matches" up front in lifter language; shorten the amber banner and move it below the results; remove "engine", "Tier 4" and the `Metric / Weight / Severity / Leverage` table from lifter-facing text; make "Details" explain which exercises counted.
5. **Give people a reason to sign up and a landing page that earns the paste.** Show a sample result on `/check`; show what tracking looks like on the result page and say whether it is free; give the sign-up page a header and a sentence about the app.

## Not done / open

- No fixes were attempted (diagnostic only). The tester proposed no code.
- Mobile was checked only at the paste and confirm step (390×844), not the assessment page.
- Timings are dev-server timings; production behaviour was not measured.
- The first-load compile delay (about 9.6s for the first `/check` hit) is a dev-mode effect and is not counted as a finding.
- This report is the stranger's view only. It does not say which findings are engine, copy, or parser issues; that triage is the next step.
