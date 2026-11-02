# Handoff: Engine-output Session D (2026-11-02)

## Session summary

Session D shipped all six missing-rule fixes: whole-program volume (A), session size (C), VOLUME High as information (S1), push:pull (S8), time budget (P2) and attendance (P2-1x). Engine **0.5.1 to 0.6.0**. **Coach parity 18/25 at the start, 19/25 after the one `expected.ts` change in step 0, 21/25 at the end.** **Expected 22-23; delivered 21. The gap is the brief's error, not implementation shortfall** (see "Where the brief's premises were wrong"). **No Fit band moved on any calibration program.** No schema change, nothing under `packages/ai`, no goal profile, per-muscle weight or goal selector, no existing threshold, no `/check`.

Two things to carry into the report, as decided with the founder:

- **PROGRAM_STRUCTURE axis added despite the brief's "no new axes" rule; required by invariant 8.** A finding Fit cannot see would break "Fit is derived from the same leverage roll-up", so each rule is a roll-up axis.
- **Attendance absorbs volume findings only.** Structural findings (region, pattern) survive; this preserves S5a/S5b's passes and reflects that "no pulling" is a different problem from "under-dosed".

## Repo state

- **Branch:** `engine-output-session-d`, from `main` (`7bc0ebc`). **Not pushed.** No PR.
- **Commits (oldest first):**
  1. `eb7c49c` step 0: C's expected match broadened, S1 marked E4-blocked, ratchet (19/25).
  2. `2d06e31` the `PROGRAM_STRUCTURE` axis: fixes 1, 2, 4, 5, 6.
  3. `f4d8343` fix 3: the informational `highVolume` block, its UI, e2e.
  4. `90bb9d2` the calibration harness learns the new axes (structural count 25 to 29, report lines, CHANGES diff, audit trail).
  5. version 0.6.0 and `calibration-before.txt` regenerated, as one commit.
  6. this documentation commit.
- **Uncommitted:** none.

## Coach parity

| Stage | Score | Change |
|---|---|---|
| Start of Session D | 18/25 | |
| Step 0 (`expected.ts`: C also accepts biceps/lats/triceps high) | **19/25** | + C, on the unchanged engine |
| After the PROGRAM_STRUCTURE rules | **21/25** | + A, + P2-1x |

**Pass (21):** A, B, C, D, E, F1, F2, G, J, P1, P2-1x, P3, PPLx3, PPLx6, S2, S3, S4, S5a, S5b, S6, S6b. By kind: A is a `lead` pass (whole-program volume); **P2-1x passes as `contained`** (attendance is the lead and contains the program-level under-dose it absorbs); S4 is still `contained`. No program that passed at 19 lost its pass.

**Fail (4), each for a principled reason, none a regression:**

| Program | Why it still fails |
|---|---|
| **S1** | **E4-blocked, documented.** The engine now lists biceps at 24.5 under "What's trending high", but a High band is severity NONE and the leverage table has no level between NONE and MINOR, so it cannot be a finding. MINOR on VOLUME (weight HIGH) is MODERATE leverage, not NONE as the brief said, and would put every program with a High muscle at DECENT. `expected.ts` carries `blockedBy: "E4"` and the ratchet pins S1 as a permanent fail-for-now. |
| **S8** | **Threshold boundary.** The engine counts press 20 and pull 10 (each set counted once; the audit's 15 vs 6 counts compounds differently). The rule "ratio above 2 and more than 10 on each side" does not fire at exactly 2.0 with pull = 10. It fires on **no** harness program. Even if it did, LOW leverage cannot outrank S8's HIGH lower-body headline. |
| **P2** | **`time-budget/none` is unproducible.** P2's sessions are 11 sets, 27.5 minutes, inside 45, so the time-budget check correctly says nothing, and "no finding" cannot match an expected `time-budget/none`. `expected.ts` now supplies `context: { minutesPerSession: 45 }`. The engine also calls P2's 22-set week under-dosed overall (below). |
| **S7** | Needs training age (a missing input and a `[SCIENTIFIC INPUT REQUIRED]` item). Unchanged. Its headline is now "under-dosed overall: 24 hard sets" instead of "lower-body volume is low". |

## Where the brief's premises were wrong

Found by reading the real engine output before building; the founder was shown these and decided on the first two.

- **PPL sessions are 17 / 15 / 17 sets, not 34.** Session-size never fires on PPLx3 or PPLx6, so they do not become DECENT. Both stay `none` passes.
- **Session-size at more than 28 would have fired on J (30) and F1 (29)**, outranked their near-failure and missing-pattern headlines, and cost both their passes. **The founder chose more than 30, MODERATE.** It fires on C (32) and D (31) only.
- **C's headline does not become session-size.** C's Excessive volume findings are HIGH leverage and outrank a MODERATE one. C passes via its broadened expected match.
- **VOLUME High as MINOR is MODERATE leverage, not NONE.** The founder chose the informational block (Option 1).
- **Push:pull fires on no harness program** (S1 is 46:43, S8 exactly 2.0, P3 1.5). So S1 does not flip to DECENT.

## What shipped

**One new axis type, `PROGRAM_STRUCTURE`**, with five scopes, each a roll-up axis so Fit reads it (invariant 8). Opt-in by `config.programStructure` (thresholds), so every config and fixture without it is untouched. Band names are unique per scope so the per-axis severity map works; the scoped weight gives the leverage.

| Fix | Scope | Fires when | Severity x weight = leverage |
|---|---|---|---|
| #6 | `attendance` | training days (`context.daysPerWeek`, else listed non-rest days) fewer than 2 | MODERATE x HIGH = **HIGH** |
| #1 | `total-volume` | fewer than 40 credited hard sets a week (scaled by `runsPerWeek`) | MODERATE x HIGH = **HIGH** |
| #2 | `session-size` | a session of more than 30 credited sets | MODERATE x MEDIUM = **MODERATE** |
| #4 | `push-pull` | pressing more than 2 to 1, with more than 10 sets on each side | MINOR x MEDIUM = **LOW** |
| #5 | `time-budget` | only with `minutesPerSession`: longest session (sets x 2.5 min) more than 5 minutes over | MODERATE x MEDIUM = **MODERATE** |

**Composition** (`assessment/findings.ts`, step P, after the absent-region and missing-pattern steps and before the region step): attendance or total-volume absorb the remaining per-muscle VOLUME Lows (and, through the existing de-duplication, their zero-exposure FREQUENCY axes); when attendance fires it also absorbs the total-volume finding. Session-size, push-pull and time-budget are independent and absorb nothing. `allAssessedAxes` keeps every per-muscle axis (invariant 8). **Ranking:** attendance outranks every other axis of equal leverage and weight (`computeAssessment.ts`); the other program-level scopes rank by axis type, last, so a VOLUME-led structural finding wins a tie against total-volume (this keeps S5a and S5b passing).

**Fix 3** (`Assessment.highVolume`): every VOLUME axis in the High or Excessive band with its band name and set count, highest first. A fact: no leverage, no finding, no Fit input, absent when empty. **I chose the `highVolume` block over a "What you're doing right" finding** because a finding at any severity above NONE gives VOLUME's HIGH weight a non-NONE leverage. Rendered as "What's trending high" below Attention areas (Excessive muscles are also a finding of their own). Checked at 375px (e2e, screenshot reviewed).

**Copy** (`copy/findingSentence.ts`, `copy/highVolumeLines.ts`), the founder's wording; every sentence is lint-tested. **Actions** (`actionTemplates.ts`): one per scope, root cause `programStructure:*`, never shared with a per-muscle key. **Web:** `labels.ts` (names, metric lines, meaning lines).

**Matcher** (`scripts/coach-parity/matcher.ts`): `headlineOf` learned the new axes, **mappings only; no match rule changed and nothing was loosened.** Attendance maps to `attendance` (lead) plus a contained `global-volume/low`. `attendance` joined the closed vocabulary. Pinned in `parity.test.ts`.

## Calibration changes (A-L, G-pct, J probe)

**No Fit band moved on any program** (the CHANGES list has no FIT line). Audit trail with fix numbers is in `calibration.test.ts`.

| Program | Change | Fix |
|---|---|---|
| A | total-volume Under-dosed, MODERATE/HIGH (12 sets vs 40). Biggest opportunity `VOLUME:calves` to `PROGRAM_STRUCTURE:total-volume`; attention 2 to 0; actions 3 to 1; findings: the three region findings become the one program finding. Stays NEEDS_WORK. | #1 |
| C | session-size Long session, MODERATE/MODERATE (32). Attention 9 to 10, actions 10 to 11. Headline stays `VOLUME:lats`. Stays NEEDS_WORK. | #2 |
| D | session-size Long session (31, Legs). Biggest opportunity `FREQUENCY:quads` to `PROGRAM_STRUCTURE:session-size`; attention 4 to 5; actions 5 to 6. Stays DECENT. | #2 |
| C, F2, J, K (+ J probe) | "What's trending high" is new: every High or Excessive muscle. Nothing else changed because of it. | #3 |
| B, E, F1, G, H, L, G-pct | no change | |

Push:pull, time-budget and attendance fire on no calibration program (balanced press/pull, no stated budget, every program lists two or more days). J (30 sets) and F1 (29) are not flagged by session-size.

**Fit flips a coach would disagree with: none**, because none flipped. Headline changes checked against a coach's line: A's "12 sets a week in total" is now the headline (the coach's words), and D's "leg day is 31 sets" is now the headline (the coach's second point). A rerun against the regenerated baseline reads "no change" for every program.

## Threshold flags for E4 (flags, not fixes)

- **The 40-set floor fires on two-session programs** (P2 at 22, S7 at 24), where a coach said "close to what you can fit" and "a good first program". Is 40 too high for someone who trains twice a week? Genuinely unknown: **[SCIENTIFIC INPUT REQUIRED]**.
- **S3 sits exactly at 40 (not under), and S6b credits about 42.** The floor sits on the boundary for real programs, so a one-set edit flips them.
- **Push:pull at "more than 2 and more than 10"** excludes S8 (exactly 2.0, pull 10). If S8 should fire, the boundary becomes at-least; that is a threshold decision, not made here.
- Time-budget is MODERATE (founder-confirmed), the same as session-size.

## Known limitations and consequences

- **An under-dosed program loses its named additions.** A used to get "Add 4 sets of Hip Thrust on Mon → glutes 6 sets/week"; it now gets one program-level action ("Add hard sets across the program, starting with the muscles furthest below the 6-20 range"). That is the brief's design (one finding replaces the per-muscle Lows), but it costs actionability. The per-muscle numbers are still in the axis details.
- **One-day drafts in the Builder now read "One training session a week..."** as the headline. Correct per the rule, a visible change for an empty-ish draft.
- **P2's real week (22 sets) is called under-dosed overall** while a coach says it fits. See the threshold flags.
- **The cross-muscle ratios do not scale by `runsPerWeek`**, and push-pull reads them, so a cycle run twice reads half the press and pull totals (carried from C1; PPLx3's ratio is the same as PPLx6's either way).
- **Nothing outside `/check` supplies `minutesPerSession`**, so the time-budget axis does not exist in production yet.
- **S1, S8, P2, S7 remain FAIL** (above). J's Fit band is still STRONG (carried from Session B; needs E4).
- **A coach has not reviewed the new content:** the five thresholds, the weights, the copy, and the "attendance absorbs volume only" reading. Tier 4 throughout, with the evidence block saying so.

## Deviations from the brief

- **Gate on `config.programStructure`, not `statusBands.PROGRAM_STRUCTURE`.** One band list per axis type cannot hold five different metrics (days, sets, a ratio, minutes), so the thresholds live in a small `ProgramStructureConfig`. The effect the founder asked for (fixtures without it stay unchanged) is the same. `statusBands` became `Record<CoreAxisType, ...> & Partial<Record<AxisType, ...>>`.
- **Five rules in one commit, not five.** They share one axis, one composition step and one parity ratchet, and an intermediate commit would have regressed D (an unmapped finding leading its headline).
- **Attendance ranks first of all** (a `typeOrder` of -1) so it outranks the VOLUME-led pattern finding in P2-1x; total-volume ranks last so S5a and S5b keep "no pulling". Chosen to match the composition the founder described.
- **The goal-selector brief has no "7 fails" section.** The classification used is in the Session C1 handoff.
- **The brief named `2026-10-29-engine-output-session-c1.md`; the file is `2026-10-30-...`.**
- **Session A's context-invariance test** (`ratios.test.ts`) no longer sets `minutesPerSession`, which is now read (as C1 did for `daysPerWeek`).
- **`namedActions.test.ts` runs against the profile without `programStructure`** (audit note in the file): its programs are under 40 sets, so the new finding would absorb the per-muscle actions it tests. The program-level action is tested in `programStructure.findings.test.ts`.
- **P2's `expected.ts` entry gained `context`** (the 45 minutes in its title), the same mechanism as PPLx3. No expected headline was edited beyond C's match and the S1 annotation, both the founder's.

## Test results

- Vitest: **80 files, 888 tests** (was 78 / 830): api 23 / 221, domain 44 / 594 (was 42 / 536), db 4 / 9, config 1 / 3, ai 8 / 61. New: `analysis/__tests__/programStructure.test.ts` (24: every threshold on both sides), `assessment/__tests__/programStructure.findings.test.ts` (28: absorption, ranking, leverage, Fit, copy, `highVolume`), `parity.test.ts` +6 (four matcher mappings, `blockedBy`, the failing set pinned).
- `calibration.test.ts` 22/22; a rerun against the new baseline reads "no change" on every program. `pnpm typecheck` and `pnpm lint` exit 0 (one pre-existing warning in `invariant.test.ts`). The coach-parity scripts, outside `tsc`, type-check clean with a throwaway config.
- Playwright: `builder.spec.ts` 2/2 (the existing test gained the attendance assertions; a new one checks "What's trending high" at 375px). Other specs were not rerun: no other web code changed.

## What the next session should start with

"Read ARCH-063 and this handoff. Branch `engine-output-session-d` is unpushed: push it and merge the stack before Session C (`/check`)." Candidates: the threshold flags above for E4; the P2 `time-budget/none` design (an engine fact that says "fits" would make it producible); S7 needs training age and a science decision; scale RECOVERY_COST and the ratios by `runsPerWeek`; per-check action copy (F6); Session C2 (the goal selector).

## Where to look if something seems wrong

- A program-level finding is missing or unexpected: `analysis/programStructure.ts` (the five triggers), then `assessment/findings.ts` step P (absorption).
- A headline is ordered oddly: `compareRanked` and the attendance `typeOrder` in `assessment/computeAssessment.ts`.
- A threshold: `HYPERTROPHY_PROGRAM_STRUCTURE` in `goal-profiles/hypertrophy.ts` (Tier 4, with rationale).
- A parity result: `pnpm coach-parity:score`; `matcher.ts` for the mappings; `expected.ts` for `blockedBy` and `context`.
