# Handoff: Engine-output Session C1 (2026-10-30)

## Session summary

Session C1 shipped two of the three parts of its brief and deferred the third. **Part 1:** `expected.ts` was corrected against a real five-coach review (B is fine; five programs are goal-dependent). **Part 2:** `AnalysisContext.daysPerWeek` is now read by VOLUME and FREQUENCY, so PPLx3 reads as PPLx6. **Part 3 (`minutesPerSession`) is deferred and not shipped**: no code, no tests, no copy. **Score: 16/25 before, 18/25 after.** Engine version 0.5.0 to 0.5.1. **Calibration A-L: no change on any program; `calibration-before.txt` untouched.** No schema change, nothing under `packages/ai`, no `/check`, no threshold, weight or config change. ARCH-063 is extended with a "Shipped in Session C1" section.

## Repo state

- **Branch:** `coach-parity-session-b` (the same branch as Session B; no new branch).
- **Commits (oldest first):** `4359c1a` Part 1 (`expected.ts` + `parity.test.ts` ratchet); `dc7b2ba` Part 2 (`runsPerWeek.ts` + the context read + PPLx3's context); `19ce224` version 0.5.1; then this documentation commit (PROJECT_STATE, this handoff, ARCH-063, the decisions index).
- **Pushed:** no. `origin/coach-parity-session-b` is at `38ed785`, Session B's tip; the four C1 commits are local only.
- **Uncommitted:** none from this session.

## What shipped

1. **Real coach review in `expected.ts`.** The 25 programs were reviewed by five coaches.
   - **B is fine (5/5).** B's `match` is now `[none]` and its note reads "Real coach review (5/5) is unanimous that this program is fine. The audit was stricter than real coaches. B passes honestly." The audit had invented two minor findings (a 9-set arm day, side delts at 7.5). **B is an "empty" pass: the engine says nothing, and that is correct because 5 of 5 coaches said the program is fine.** Same class as E and PPLx6. No matcher change; nothing was loosened. 16 to 17.
   - **`goalDependent`** (new boolean on `ExpectedHeadline`, default false) on **S2, S3, S6, S6b and P1**. See "The goal-dependent programs". Annotation only; scoring is unchanged.
   - Test changes in `parity.test.ts`: the ratchet pins B; "a substantive expectation fails on an empty headline" now uses A (B is no longer one); `none` is expected by B, E, S7, PPLx3 and PPLx6; `goalDependent` is pinned to exactly P1, S2, S3, S6, S6b; a note may now begin "Real coach review" instead of "awaiting real coach review".
2. **`daysPerWeek` is read** (`analysis/runsPerWeek.ts`, a structural read, not a threshold change). When `AnalysisContext.daysPerWeek` is a positive finite number that differs from the listed training days (rest days are not counted), the structure is a repeating cycle and `runsPerWeek = daysPerWeek / listedDays`.
   - VOLUME multiplies each muscle's weekly sets by it. FREQUENCY multiplies the weekly dose by it and takes `floor(listedExposures x runsPerWeek)` exposures: three sessions run 1.5 times are four exposures, not 4.5.
   - Absent, non-positive, non-finite or equal-to-listed `daysPerWeek` reads as 1 and changes nothing.
   - PPLx3 supplies `{ daysPerWeek: 6 }` on its `expected.ts` entry (new optional `context` field; `withContext` helper). `scoreAll` passes it to the engine; the four print scripts do not, so their output is unchanged. VOLUME and FREQUENCY for PPLx3 with the context equal PPLx6's (tested). 17 to 18.
   - `computeVolumeAxis` and `computeFrequencyAxis` gained an optional `runs` parameter (default 1); both are exported from `index.ts`, so existing callers are unaffected.
3. **Version 0.5.1** in `assessment/version.ts` only, with a changelog entry.

## Coach-parity progression

| Stage | Score | Newly passing |
|---|---|---|
| Entering C1 (Session B's result) | **16/25** | |
| After Part 1 (B settled by coach review) | 17/25 | + B |
| After Part 2 (`daysPerWeek`) | **18/25** | + PPLx3 |

The brief gave the starting score as 6 and the first target as 7. 6 was Session B's *pre-change* score; the measured baseline entering C1 was 16. The brief's later checkpoints (18 after PPLx3, 19 after P2) only fit 16, so the work proceeded on 16. P2 was the 19th and did not move (Part 3, below).

### The 18 that pass

- **Lead (13):** D, F1, F2, G, J, P1, P3, S2, S3, S5a, S5b, S6, S6b. The engine's first-ranked finding names a problem the coach named.
- **Empty (4):** **B, E, PPLx3, PPLx6.** The coach found nothing to fix and the engine's headline is empty. **B is the only one of the four backed by real coaches (5/5).** E, PPLx3 and PPLx6 expect `none` on audit-derived lines, so those three are agreement with the audit, not with a coach.
- **Contained (1):** S4. Hamstrings sit inside a lower-body finding led by calves; not a direct hit. Without it the score is 17.

Weakest passes, in order: S4 (contained), then the three audit-derived empty passes (E, PPLx3, PPLx6), then B (coach-backed but still agreement by silence).

### The 7 that fail, classified

| Program | Coach's problem | What is missing |
|---|---|---|
| A | "12 sets a week in total" | **Missing rule:** a whole-program volume finding. The engine now says "lower-body volume is low". |
| C | Every session is about 32 sets | **Missing rule:** session size (audit item F8). |
| S1 | Biceps at 24.5 / curls on top of rows | **Missing rule:** VOLUME High is information-only, never a finding. The headline is "Recovery cost High". |
| S8 | Press 15 vs pull 6; no vertical pull | **Missing rule:** push:pull is informational and outside the roll-up, and "no vertical pull" alone is not a whole-pattern gap. |
| P2 | "Close to what you can fit" in 45 minutes | **Missing input and missing rule, both needed:** `minutesPerSession` (input) and a program-level rule. See "Part 3 is deferred". |
| P2-1x | One session a week cannot cover a week | **Missing input and missing rule:** attendance (input) and the program-level volume rule (the same one as A). |
| S7 | A good first program for a novice | **Missing input:** training age. The novice bands are `[SCIENTIFIC INPUT REQUIRED]`, so this also needs a science decision, not only code. |

## The goal-dependent programs

**S2, S3, S6, S6b and P1** are flagged `goalDependent`. For these, **3 of 5 coaches agreed with the engine's finding and 2 of 5 said "fine, optional accessory work."** The disagreement tracks whether the lifter cares about aesthetic priorities (calves, delts), not anything wrong with the program. The engine's findings (rear delts, calves, side delts) are a defensible reading for a hypertrophy goal and an over-reach for a lifter who does not chase contour. All five still pass, so the score does not depend on the flag. **Session C2 (a goal selector) is when this gets resolved**: the selector decides whether those findings are surfaced, so the parity entries can then expect a different headline per goal. S6b carries the flag because it is the RPE-6 variant of S6 (derived).

## Part 3 is deferred: `minutesPerSession` is NOT shipped

Not implemented, not tested, not described as shipped anywhere. The brief's rule was: estimate session length at 2.5 minutes a set; if it exceeds the budget, cap the "add X sets" actions to the top two by deficit and change the header. Before building it, a probe on P2 (a 45-minute budget) found it does not move P2 as written:

- **The trigger does not fire.** P2's sessions are 11 sets = 27.5 minutes, under 45. The week is 55 minutes, but that compares a weekly total with a per-session budget.
- **P2 has 3 actions today, not 15.** The 15 is the audit-era count; Session B's consolidation cut it.
- **The matcher scores the headline, and an action cap does not touch it.** P2 expects `time-budget/none`. `headlineOf` emits no `time-budget` subject for anything, and the headline (`region:lower/low`) is the same however many actions are shown. Passing P2 needs an engine rule that says something about the budget, not a cap, or a matcher change (which the brief forbids as loosening).
- **The header has no home.** `NamedAction[]` has no header field for "About N sets fit in your M-minute budget".

Whether Session D's program-level volume rule alone moves P2 is **not proven**: P2's expected subject is `time-budget`, not `global-volume` (that is A's and P2-1x's). Treat the P2 rule as a design question for Session D, with these open: trigger on per-session length or on headroom (budget minus current length); whether a program under budget should be told it fits; where the header lives; and a `time-budget` subject in `headlineOf`.

## Calibration

`calibration.test.ts` 22/22. **Every program, A-L plus the G-pct and J probes, reads "no change"**; `calibration-before.txt` was not touched (0 diff lines). Nothing outside `/check` supplies `AnalysisContext`, and a missing or equal `daysPerWeek` reads as 1, so the existing programs are byte-identical. The version bump does not alter any output.

## Known limitations (carry these forward)

- **RECOVERY_COST and the cross-muscle ratios do not scale by `runsPerWeek`.** A 3-day cycle run twice reads half the recovery cost and half the push and pull totals of its 6-day listing. No parity program is affected (PPLx3's recovery cost is lower than PPLx6's, never higher), but the numbers are inconsistent with the scaled VOLUME beside them.
- **Three of the four empty passes are audit-derived** (E, PPLx3, PPLx6). A real coach review of those would settle them.
- **J's Fit band remains STRONG** (carried from Session B): PROGRESSION is MINOR, below the breadth floor; needs E4 or a decision to raise it. `/check` must still not lead with the band.
- **Per-check action copy (audit F6)** is not done.
- **S4 is a contained pass**, not a direct hit.

## Deviations from the brief

- **The starting score.** The brief said 6 (then 7 after B); the measured baseline was 16 (then 17, then 18). See "Coach-parity progression".
- **Part 3 was deferred**, by the founder's decision after the probe above, not by the brief.
- **Session A's context-invariance test was edited.** `ratios.test.ts` asserted that a "full" context (`daysPerWeek: 4`) changes nothing; `daysPerWeek` is no longer inert, so that test now sets it to the listed day count. The other three fields are still read by nothing, and `runsPerWeek.test.ts` covers the differing case.
- **Part 1 and Part 2 are separate commits that each pass on their own.** To keep them self-contained, Part 1 carries no `context` field and Part 2 carries PPLx3's.

## Test results

- Vitest: **78 files, 830 tests** (was 77 / 812): api 23 / 221, domain 42 / 536 (was 41 / 518), db 4 / 9, config 1 / 3, ai 8 / 61. New: `runsPerWeek.test.ts` 15; `parity.test.ts` 14 to 17.
- `calibration.test.ts` 22/22, A-L "no change". `pnpm typecheck` and `pnpm lint` exit 0.
- The coach-parity scripts are outside `tsc` (domain's tsconfig includes `src` only); a throwaway config that includes them type-checked clean, and eslint passes.
- Playwright was not rerun: no web code changed.

## Branch stack (as of the last fetch)

The Session B handoff said seven branches were unmerged, that `main` was 37 commits behind, and that Session B had no remote branch. All three are superseded:

- **Merged to `origin/main`:** `phase-a2-friction-fixes` and `phase-a3a-progress-summary` (PRs #24, #25, #26).
- **Unmerged to `origin/main` (five), commits ahead of `origin/main`:** `phase-a3a1-session-ux` 6, `product-depth-week1-project1` 14, `product-depth-project4` 18, `coach-parity-session-a` 24, `coach-parity-session-b` 38 (34 pushed, plus the four local C1 commits). All five are on the remote; `coach-parity-session-b` is pushed only to `38ed785`.
- **`origin/main` has three commits this branch lacks:** the merge commits of PRs #24, #25 and #26. The content is already in the stack, so they should merge cleanly, but they are not ancestors of HEAD.
- **Local `main` (`ad2b227`) is 9 commits behind `origin/main` (`f46ad7a`).** Fast-forward it before anything else.
- Three older branches are also unmerged and are not part of the stack: `phase-10-2-config` (1), `phase-10-4-docs` (1), `test/sentry-server-verification` (7). Not touched.
- **Before Session C (the `/check` build), the five stack branches need to reach `origin/main`** so production runs the current code. Not solved here.

## Manual actions pending (founder)

1. Push `coach-parity-session-b` (four unpushed C1 commits) and merge the five-branch stack; fast-forward local `main`.
2. Have the coaches review E, PPLx3, PPLx6 and S7 if the five-coach pass did not cover them; those `none` entries are audit-derived.
3. Decide the P2 design questions above before Session D picks up `minutesPerSession`.
4. Carry over from Session B: review the Tier 3 content (`musclePriority`, `regions`, `wholePatternGaps`, `patternPhrases`, `PREFERRED_ADDITIONS`, the 0.5 `maxShareAtFailure`), and decide whether to raise PROGRESSION to MODERATE or take up E4.

## Session D candidate list

In rough order of how much each unblocks:

1. **A program-level volume rule** ("you do 12 sets a week in total"): A, and half of P2-1x (and possibly part of P2).
2. **Session-size rule** (audit F8): C. D's coach also names its 31-set day; D passes today on frequency.
3. **VOLUME High as a finding**: S1.
4. **Push:pull in the roll-up, and "no vertical pull" as a gap**: S8 (and P3's push:pull clause).
5. **`minutesPerSession` and a `time-budget` rule**: P2, with the design questions above.
6. **Attendance input**: P2-1x. **Training age and novice bands**: S7 (needs a science decision first).
7. **Scale RECOVERY_COST and the ratios by `runsPerWeek`** for consistency with VOLUME and FREQUENCY.
8. Carry-overs: graded severity (E4) so J's band stops understating it; per-check action copy (F6).

Session C2 (the goal selector) is separate and resolves the five goal-dependent programs. Session C (`/check`) comes after the stack is merged.

## What the next session should start with

"Read ARCH-063 and this handoff. The stack is merged to `origin/main`. Then do **Session D**: start with the program-level volume rule (A, P2-1x), then the session-size rule (C). Do not start `minutesPerSession` until the P2 design questions in this handoff are answered." The seven parity failures are the work list.

## Where to look if something seems wrong

- A volume or frequency number looks doubled or halved → `analysis/runsPerWeek.ts` (the factor), `volume.ts` and `frequency.ts` (where it is applied); then the `context` on the program's `expected.ts` entry.
- A parity result looks wrong → `pnpm coach-parity:score` prints both headlines and what each side said; `scripts/coach-parity/matcher.ts` has the rules; `expected.ts` has a `rationale` per entry and the `goalDependent` and `context` fields.
- A passing program should not pass → `parity.test.ts` pins the exact set and the contained set; the `none` programs pass only on an empty headline.
- Everything from Session B still applies: headline ranking in `compareRanked`, consolidation in `assessment/findings.ts`, named actions in `assessment/namedActions.ts`, the near-failure check in `analysis/progressionSoundness.ts`.
