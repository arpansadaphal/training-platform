# Handoff: Engine-output Session B (2026-10-29)

## Session summary

Session A measured the engine against 25 programs and shipped the fixes that do not change calibration. This session shipped the three that do (ARCH-063 B1, B2, B3) and the measurement that proves them: a coach-parity test that scores the engine's headline against a coach-written headline for each program. **Score: 6/25 before any change, 16/25 after.** Engine version 0.4.0 to 0.5.0; `calibration-before.txt` regenerated; **no Fit band moved on any calibration program**. ARCH-063 is Accepted. The public `/check` page is not built (Session C). No schema change, nothing under `packages/ai`.

## Repo state

- **Branch:** `coach-parity-session-b` (local only, no upstream), from `coach-parity-session-a` (`1f659ae`). 37 commits ahead of `main`.
- **Commits (oldest first):** `4d8dcd0` coach-parity measurement (the "before" score, no engine file touched); `1a5593b` B1; `8291e9e` B2 engine; `02f0b6a` B2 web; `c9f9d02` B3; `d807738` e2e expectation; `85b79f0` **Session B: calibration regeneration (0.5.0)**; then this documentation.
- **Uncommitted:** none from this session. `.gitignore` was committed in Session A (`1f659ae`).
- **Local data:** the e2e runs left `example.test` users in `training_platform_dev`. Nothing else.

## What shipped

1. **Coach-parity test** (`packages/domain/scripts/coach-parity/`, `pnpm coach-parity:score`). `programs.ts` defines the 26 programs once (the four print scripts loop over it; their output is byte-identical to before). `expected.ts` holds 25 coach-written entries: the coach's line, a structured `match` (`{subject, direction}` pairs, read as OR, from a closed vocabulary) and a `rationale`. `matcher.ts` compares structure, not prose. `parity.test.ts` pins the matcher's rules and the exact set of passing programs.
   - **A program passes with zero findings only if the coach found nothing to fix** (E, PPLx6). B has two coach observations the engine does not surface, so B fails by design.
   - Containment is one-way (a region contains its muscles, never the reverse). A pass is labelled `lead` or `contained`.
   - **S4: PASS (contained). Hamstrings sits inside a lower-body finding led by calves. It is not a direct hit.** Without it the score is 15.
2. **B1, rank the headline by deficit.** `classifyAxes` ranks by leverage, axis weight, axis type, deficit, `musclePriority`, original order. Starting Strength leads with lats at 0 (then "No pulling exercises" once B2 landed); F2 with quads, not calves.
3. **B2, one finding per problem.** `assessment/findings.ts`, `copy/findingSentence.ts`, `actionForFinding`. A region at 0 sets is one finding; a missing pattern group that explains Low muscles is one; several Lows in a region are one; a FREQUENCY "no exposure" axis is dropped when the muscle already has a VOLUME Low; a gap that explains no Low (no overhead press) is one Exercise-selection finding. A whole missing pattern group raises the Exercise-selection severity to MODERATE (Tier 3). Named actions name each finding, and propose a new day for a region with no training. `Assessment.findings` is optional; `biggestOpportunity`/`attentionAreas` are the leads; `allAssessedAxes` is untouched. **A: 18 surfaced findings to 3. F2: 9 to 3.**
4. **B3, near-failure check.** `NEAR_FAILURE`: more than `maxShareAtFailure` (0.5, Tier 4; Refalo 2023, Robinson 2024) of sets at RIR 0. **J: PROGRESSION Sound to Issue found, 100% of sets at RIR 0.** C (51.6%) and K (52.9%) flip too. The finding says which check failed.

## Coach-parity progression

| Stage | Score | Newly passing |
|---|---|---|
| Before any change | **6/25** | D, E, P1, PPLx6, S2, S3 |
| After B1 | 9/25 | + P3, S6, S6b |
| After B2 | 14/25 | + F1, F2, S4 (contained), S5a, S5b |
| After B3 | **16/25** | + G, J |

The brief's stop rules held at every gate: baseline at least 4 and not 7 or more (6); after B2 above 13 (14); after B3 15 or more (16). The audit guessed about 4 by hand; the measured 6 counts E and PPLx6 as clean passes (a coach who finds nothing to fix, an engine with nothing to say).

**The nine that still fail, and why (none fixable by B1-B3):**

| Program | Why | Type |
|---|---|---|
| A | Coach: "12 sets a week in total". No program-level volume finding exists; the engine now says "lower-body volume is low". | missing rule |
| B | Side delts 7.5 is inside the Adequate band; "thinnest muscle" is relative; "least valuable session" has no rule. | ambiguous (threshold) |
| C | Session size (audit F8). | missing rule |
| S1 | VOLUME High is information-only, so "biceps 24.5" is never a finding. The headline is now "Recovery cost High". | missing rule |
| S7 | Coach: a novice program is fine. No training age (novice bands are `[SCIENTIFIC INPUT REQUIRED]`). | missing input |
| S8 | Push:pull is informational and outside the roll-up; "no vertical pull" alone is not a whole-pattern gap. | missing rule |
| P2 | Needs `minutesPerSession`. | missing input |
| P2-1x | Needs attendance / `daysPerWeek`, and a program-level volume finding. | missing input and rule |
| PPLx3 | The engine reads 3 listed days as the week; needs `daysPerWeek`. | missing input |

Four of the nine need `AnalysisContext` (accepted, read by nothing). That is the largest lever for Session C.

## Calibration changes (A-L)

`calibration.test.ts` 22/22. **No FIT line in the CHANGES list: no Fit band moved**, so there was nothing to check against the audit and no regression. Re-running against the regenerated baseline reports "no change" for every program.

| Program | Change | Reason |
|---|---|---|
| A | biggest VOLUME:biceps to VOLUME:calves; attention areas 17 to 2; actions 18 to 3; stays **NEEDS_WORK** | B1; B2 (three region findings; the 11 Lows are still in the roll-up) |
| C | biggest biceps to lats; PROGRESSION Sound to Issue found, NONE/NONE to MINOR/LOW | B1 (36 vs 36, lats first by priority); B3 (51.6%) |
| D | biggest FREQUENCY:chest to FREQUENCY:quads | B1 (five tied; quads first) |
| F1 | biggest null to EXERCISE_SELECTION_BALANCE; actions 0 to 1; ESB MINOR/NONE to MODERATE/LOW | B2c (the hidden gap) |
| F2 | biggest calves to quads; attention areas 8 to 2; actions 9 to 3; ESB MINOR/NONE to MODERATE/LOW | B1, B2 |
| J | biggest RECOVERY_COST to PROGRESSION_SOUNDNESS; attention 0 to 1; actions 1 to 2; PROGRESSION Sound to Issue found; ESB to MODERATE/LOW | B3, B1, B2c |
| K | PROGRESSION Sound to Issue found, NONE/NONE to MINOR/LOW | B3 (52.9%) |

## Known limitations (carry these forward)

- **J's Fit band remains STRONG** because MINOR severity from PROGRESSION doesn't cross the breadth floor (MODERATE). Unblocked by E4 (graded severity) or a decision to raise PROGRESSION severity from MINOR to MODERATE; both are separate ARCHs. Until then J's headline reads "near-failure", but the band label understates the problem. The action is the generic Session A wording ("Review effort targets and rep ranges across prescriptions."): per-check action copy (audit F6) is not done. A test pins the STRONG so a change is deliberate. `/check` must still not lead with the band.
- **S4 is a "contained" pass**, not a direct hit (see above).
- **Branch stack debt.** None of these branches is merged to `main`: `phase-a2-friction-fixes` → `phase-a3a-progress-summary` → `phase-a3a1-session-ux` → `product-depth-week1-project1` → `product-depth-project4` → `coach-parity-session-a` → `coach-parity-session-b`. `main` is 37 commits behind this branch, and Session B has no remote branch at all. **Before Session C (the `/check` build), the whole stack needs to be merged to `main` so production runs the current code.** Not solved here.
- **Every expected headline is audit-authored.** `expected.ts` awaits real coach review; six entries are "Derived" (E, S5b, S6b, P2-1x, PPLx3, PPLx6). The score measures agreement with those lines, not with a certified coach.

## Deviations from the brief, and why

- **Weight before axis type in the ranking key.** The brief said "among tied leverage: deficit, then muscle priority". Ties between axis *types* needed a rule, and the founder confirmed weight-first. It makes J lead with near-failure, and it also lets a MINOR PROGRESSION/RECOVERY axis outrank MODERATE FREQUENCY findings as the headline (S1 now leads with "Recovery cost High"). The `fit-score.test.ts` integration test asserted `surfaced` equal to the counted findings; it now asserts the invariant it guards (every counted finding is surfaced) and records 4 and 3.
- **`regionOf` is data plus a helper**, not a function in the config (`regions` in `hypertrophy.ts`, `regionOf(config, name)` in `assessment/patternGaps.ts`); the config is pure data.
- **The whole-pattern bump applies whatever the ESB band.** A program at 5 of 6 patterns reads Balanced but now surfaces "no overhead press". It is an exception to "one missing pattern is tolerated", recorded in ARCH-063 and the evidence block.
- **A multi-muscle named sentence labels the muscle** (`→ hamstrings 4 sets/week`). This broke the Session A e2e regex (`→ N sets/week`); `builder.spec.ts` was updated with an audit note, same intent.
- **The version constant is in the calibration commit**, as the brief placed it; the baseline is never in an engine commit (this overrides ARCH-063's earlier "same commit as the change").

## Test results

- Vitest: **77 files, 812 tests** (was 74 / 726): api 23 / 221, domain 41 / 518, db 4 / 9, config 1 / 3, ai 8 / 61. New: `parity.test.ts` 14, `ranking.test.ts` 18, `findings.test.ts` 32.
- `calibration.test.ts` 22/22. Domain, api and web `tsc` clean (`pnpm typecheck`, 9 tasks). `pnpm lint`: 0 errors (the pre-existing `invariant.test.ts` warning).
- Playwright: `builder.spec.ts`, `builder-simulate.spec.ts`, `review.spec.ts` pass. The rest of the e2e suite was not rerun; the only UI change is the assessment display.
- The coach-parity scripts are outside `tsc` (domain's tsconfig includes `src` only); I type-checked them with a throwaway config. Vitest and eslint cover them.

## Manual actions pending (founder)

1. **Merge the stack to `main`** before Session C (see branch stack debt), and push `coach-parity-session-b`.
2. Review the Tier 3 content: `musclePriority`, `regions`, `wholePatternGaps` (and their action text), `patternPhrases`, `PREFERRED_ADDITIONS`, and the 0.5 `maxShareAtFailure`.
3. Have a real coach (or two) read `expected.ts`, ideally blind. Change a line there on purpose; the ratchet in `parity.test.ts` will say what moved.
4. Decide whether to raise PROGRESSION to MODERATE, or to take up E4 (graded severity), so J's band stops understating it.

## What the next session should start with

"Read ARCH-063 and this handoff. The stack is merged to `main`. Then do **Session C**, the `/check` page: ask days per week, training age, minutes per session and equipment, and read them (`AnalysisContext`); do not lead with the Fit band; show strengths collapsed and last." The nine parity failures are the work list: four need `AnalysisContext`, four need a rule (program-level volume, session size, VOLUME High as a finding, push:pull in the roll-up), one is a threshold disagreement.

## Where to look if something seems wrong

- A headline looks wrong → `compareRanked` in `assessment/computeAssessment.ts` (the key, in order), `musclePriority` in `goal-profiles/hypertrophy.ts`.
- A finding groups too much or too little → `assessment/findings.ts` (steps A to F in the header), `regions` and `wholePatternGaps` in `hypertrophy.ts`.
- A "no X exercises" finding appears for a muscle that has work → `wholePatternGaps[].muscles`, `rollup.ts` (the severity bump), `absentPatternGaps` in `assessment/patternGaps.ts`.
- A named action looks wrong → `assessment/namedActions.ts` (`nameMemberAction`, `nameNewDayAction`, `PREFERRED_ADDITIONS`).
- The near-failure check fires or not → `analysis/progressionSoundness.ts`, `progressionRules.maxShareAtFailure`.
- A parity result looks wrong → `pnpm coach-parity:score` prints both headlines and what each side said; `scripts/coach-parity/matcher.ts` has the rules; `expected.ts` has a `rationale` per entry.
- Run the whole reference set: `pnpm coach-parity` (prints) and `pnpm coach-parity:score` (scores).
