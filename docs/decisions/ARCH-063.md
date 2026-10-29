# ARCH-063 — Engine output improvements (rank by deficit, consolidation, near-failure check)

**Date:** 2026-10-28
**Status:** Accepted (Session B shipped 2026-10-29). Session A (2026-10-28) shipped the five changes that leave calibration alone; Session B shipped the three that change it, with engine version 0.5.0, a regenerated calibration baseline and a coach-parity test. Branches `coach-parity-session-a` and `coach-parity-session-b`.
**Supersedes:** none
**Related:** ARCH-051 (config and scope), ARCH-052 (axis rebuild), ARCH-053 (breadth-aware Fit), ARCH-054 (evidence-graded thresholds)

## Context

The 2026-10-28 engine audit (the "Part 1" report; harness in `packages/domain/scripts/coach-parity/`) ran the real engine on 25 programs and compared each headline with what a coach would say first. The verdict: the per-muscle arithmetic is right; the output layer is not. Eight problems were found. Five change presentation only and shipped in Session A. Three change what the engine surfaces, and therefore change calibration output; they wait for Session B so they can ship with a version bump, a regenerated baseline and a parity test.

## Shipped in Session A (no calibration change)

Verified: `calibration.test.ts` 22/22 with every program "no change", `calibration-before.txt` untouched, and all 26 coach-parity harness runs identical except one reworded action.

1. **`AnalysisContext`** (`daysPerWeek`, `trainingAgeMonths`, `equipment`, `minutesPerSession`) accepted on `ComputeAnalysisOptions.context`. No calculator reads it yet. Passing it, an empty object or nothing yields a byte-identical Analysis and Assessment (tested). Never stored.
2. **Named, equipment-aware actions** (`assessment/namedActions.ts`). A post-step beside `computeAssessment`, not inside it: the persisted Assessment is unchanged. Every VOLUME Low action becomes "Add 3 sets of Leg Curl on Day 2 → 7.5 sets/week." The after-number is read from the mutated Analysis of `simulate()` for an `ADD_EXERCISE_PRESCRIPTION` (invariants 1 and 2). Exercise choice is a curated per-muscle preference list (`PREFERRED_ADDITIONS`, Tier 3/4) filtered to equipment already in the program; with nothing eligible the template sentence stands. Used by Builder preview and Review's opt-in recompute; the persisted COMMIT snapshot keeps the sentences the lifter saw.
3. **Cross-muscle ratios** (`analysis/ratios.ts`, carried as optional `Analysis.ratios` and `Assessment.ratios`): push:pull, arms:legs, quads:hamstrings. Tier 3, informational, outside the roll-up and the Fit band. **Deviation from the brief's wording:** each credited set is counted once per group by primary mover or movement pattern, not summed from per-muscle VOLUME. A VOLUME sum credits a row 2.5 muscle-sets and a bench press 1.5, so 4 sets of bench against 4 of rows read 0.6; counted once it reads 1.0. Front delts are not a goal-relevant group, so a vertical press is recognised by its pattern.
4. **Label:** user-facing "Progression & effort" is now "Effort & rep ranges". The internal axis type `PROGRESSION_SOUNDNESS`, its root-cause key and its calibration identity are unchanged. The action "Align progression schemes across prescriptions." now reads "Review effort targets and rep ranges across prescriptions."
5. **Constraints page copy** no longer claims constraints shape "every future assessment". They do not: only the Coach reads them.

## Shipped in Session B (2026-10-29, engine 0.5.0)

Seven commits on `coach-parity-session-b`: the coach-parity measurement, B1, B2 (engine, then web), B3, an e2e expectation, and the calibration regeneration. No schema change; `packages/ai` untouched; `/check` not started.

### Coach-parity measurement (taken before any engine change)

`packages/domain/scripts/coach-parity/`: `programs.ts` (the 26 harness programs defined once), `expected.ts` (25 coach-written headlines), `matcher.ts`, `parity.ts` (`pnpm coach-parity:score`), `parity.test.ts` (matcher rules and a ratchet on the exact passing set). The audit scored the engine at about 4 of 25 by hand; the real measurement of the unchanged engine was **6/25**.

- Each expected entry carries the coach's line and a `match`: `{subject, direction}` pairs read as OR, written when the sentence is written, from a closed vocabulary. A `rationale` says why each match reads as it does. All lines are audit-authored and await a real coach; entries with no audit line say "Derived".
- **A program passes with zero findings only if the coach found nothing to fix** (`none`): E and PPLx6. Every program whose coach line names a problem fails until the engine produces that problem; B fails by design. Containment is one-way (a region contains its muscles, never the reverse), and a pass is labelled `lead` or `contained`.
- The matcher was never loosened to turn a FAIL into a PASS.

| Stage | Score | Newly passing |
|---|---|---|
| Before any change | 6/25 | D, E, P1, PPLx6, S2, S3 |
| After B1 | 9/25 | + P3, S6, S6b |
| After B2 | 14/25 | + F1, F2, S4 (contained), S5a, S5b |
| After B3 | **16/25** | + G, J |

**S4 passes as "contained", not as a direct hit:** hamstrings sits inside a lower-body finding led by calves. The headline does not state the quad-to-hamstring ratio the coach named. Without S4 the score is 15.

### B1. Headline ranked by deficit

`classifyAxes` ranks every not-good axis by one lexicographic key: leverage, axis weight, axis type, deficit (distance to the nearest band the profile calls good, read from the profile's own bounds), `musclePriority`, original order. Biggest opportunity and attention areas follow it. Deficit is a tie-break key, never a threshold: it creates and moves no band, severity or leverage.

- **Tier 3 addendum, `musclePriority`** (hypertrophy.ts): quads, chest, lats, upper back, hamstrings, side delts, rear delts, glutes, biceps, triceps, calves. Names, not ids. A coaching convention a coach should review.
- **Deviation from the brief, confirmed by the founder:** the brief said "among tied leverage, deficit then priority". Ties across axis *types* (PROGRESSION and RECOVERY against FREQUENCY and SELECTION, all LOW) needed a rule, so axis weight comes before axis type. Consequence: a MINOR-severity PROGRESSION or RECOVERY axis can now outrank MODERATE-severity FREQUENCY findings as the headline (S1 leads with "Recovery cost High"; J leads with near-failure). The Fit integration test in `fit-score.test.ts` asserted `surfaced` equal to the counted findings; it now asserts the invariant it guards (every counted finding is surfaced) and records 4 and 3, because the headline can be a MINOR axis. The Fit band itself is unchanged.

### B2. Consolidation, de-duplication, whole-pattern gaps

`assessment/findings.ts` composes the ranked axes into findings, in this order: (A) a region whose every in-scope muscle is at 0 sets is one "No lower-body training" finding and absorbs the pattern groups that explain only its muscles; (B) a whole missing pattern group that explains Low muscles is one finding ("No pulling exercises: lats and upper back get 0 hard sets a week."); (C) two or more remaining Lows in a region are one finding; (D) a missing group that explains no Low is one Exercise-selection finding naming every missing pattern; (E) a FREQUENCY "no exposure" axis for a muscle that already has a VOLUME Low is dropped; (F) everything else is one finding per axis. `allAssessedAxes` is untouched (invariant 8). `Assessment.findings` is optional; `biggestOpportunity` and `attentionAreas` are the findings' lead axes, so every older consumer and snapshot works. One action per finding.

- **2b detail.** Only a zero-exposure FREQUENCY axis is dropped. A FREQUENCY Low above zero cannot co-occur with a VOLUME Low (volume under 6 needs one session), so "under-distributed" findings always remain; a zero-exposure axis with Adequate volume remains too.
- **2c, the severity bump (Tier 3).** While a whole pattern group is absent (pull = horizontal and vertical pull both missing; hinge; squat; vertical push), the Exercise-selection severity is raised to **MODERATE**, whatever the band. This is an exception to the claim "one missing pattern is tolerated": a program that reads Balanced (5 of 6 patterns) but has no overhead press now surfaces a finding. Done in `rollup.ts`, so Fit reads it (invariant 8); on a LOW-weight axis MODERATE is LOW leverage, and it counts toward the breadth floor like any MODERATE finding. A single missing pattern outside these groups (rows but no pulldown) stays silent. The claim is recorded in the evidence block (Tier 3, no sources).
- **Tier 3 addenda, config (hypertrophy.ts):** `regions` (upper: chest, lats, upper back, side delts, rear delts; lower: quads, hamstrings, glutes, calves; arms: biceps, triceps; core: none in scope), `wholePatternGaps` (the four groups, each with the muscles it explains and its action text), `patternPhrases` (how each missing pattern reads). **Deviation:** the brief said `regionOf(name)` "in the config"; the config is pure data, so the map is data (`regions`) and `regionOf(config, name)` is a helper.
- **Named actions** (`namedActions.ts`) now name a region or pattern finding with one addition per absorbed muscle (each sentence says which muscle its number belongs to, one "The Adequate range starts at 6." at the end), and a region with no training with a **new day** through one `simulate(ADD_WORKOUT_DAY)`, so its after-numbers are the engine's and not a sum of guesses. A muscle the equipment cannot serve is said plainly ("Add weekly volume for calves."). Unchanged: after-numbers for separate additions are each that change alone.
- Web: `AssessmentDisplay` renders `findings` when present through `FindingCard`; a snapshot saved before 0.5.0 has none and renders axis by axis as before.
- **Counts:** Program A, 18 surfaced findings to 3 (upper, arms, lower; attention areas 17 to 2). Program F2, 9 to 3 (lower body with no training, chest frequency, no overhead press). A stays NEEDS_WORK.

### B3. Near-failure check

`PROGRESSION_SOUNDNESS` gets a fifth check, `NEAR_FAILURE`: it fails when **more than** `maxShareAtFailure` (default **0.5**, `progressionRules`) of SETS are prescribed at RIR 0 (RPE 10, from `targetRpe` or an RPE-based load scheme). Sets with no stated effort are not counted. **Tier 4** (an engine boundary; no study gives a share), with the direction at Tier 3-4 and the sources already in the config: **Refalo 2023, Robinson 2024**. The calibration programs bracket the cutpoint without pinning it: J is 100%, K 52.9%, C 51.6%, every other program 0%, so any value from 0 up to about 0.51 gives the same flips on A-L. The evidence claim is pinned in `evidence.test.ts` (Tier 4, those two sources).

- The axis result carries `facts.failedChecks` (id, share, detail), so the finding says which check failed: "100% of your sets are to failure. Growth doesn't need failure — leave 1–2 reps in reserve on most sets." The other four checks have sentences too. All copy passes the forbidden-copy lint and never says safe, injury or prevent.
- Program J now reads "Issue found" on PROGRESSION (was "Sound"), and no longer lists effort as a strength.

### Calibration changes (A-L; `calibration-before.txt` regenerated, 0.4.0 to 0.5.0)

**No Fit band moved on any program** (the CHANGES list has no FIT line), so no flip needed checking against the audit and none is a regression. Checked against the audit's coach lines: the headline changes on F1, F2 and J move toward what the coach says (no overhead press or pulldown, no lower body, all sets to failure). The changes on A, C and D are tie-break reorderings inside the same kind of finding; the coach's point there is something the engine still cannot say (A's program-level volume, C's session size, D's whole-program frequency pattern).

| Program | Change | Reason |
|---|---|---|
| A | biggest VOLUME:biceps to VOLUME:calves; attention areas 17 to 2; actions 18 to 3; stays NEEDS_WORK | B1, B2: three region findings; the 11 VOLUME Lows are still in the roll-up |
| C | biggest VOLUME:biceps to VOLUME:lats; PROGRESSION Sound to Issue found, NONE/NONE to MINOR/LOW | B1 (lats and biceps tie at 36; lats first by priority); B3 (51.6% of sets at RIR 0) |
| D | biggest FREQUENCY:chest to FREQUENCY:quads | B1 (five tied at 0.5; quads first by priority) |
| F1 | biggest null to EXERCISE_SELECTION_BALANCE; actions 0 to 1; ESB MINOR/NONE to MODERATE/LOW | B2c: no overhead press or pulldown, once hidden |
| F2 | biggest VOLUME:calves to VOLUME:quads; attention areas 8 to 2; actions 9 to 3; ESB MINOR/NONE to MODERATE/LOW | B1, B2 |
| J | biggest RECOVERY_COST to PROGRESSION_SOUNDNESS; attention areas 0 to 1; actions 1 to 2; PROGRESSION Sound to Issue found, NONE/NONE to MINOR/LOW; ESB MINOR/NONE to MODERATE/LOW | B3 (100% at RIR 0), B1 (weight-first tie-break), B2c |
| K | PROGRESSION Sound to Issue found, NONE/NONE to MINOR/LOW | B3 (52.9%) |
| B, E, G, H, L, G-pct, J(probe) | no change beyond the new FINDINGS line (J(probe) as J) | |

Re-running the calibration test against the regenerated baseline reports "no change" for every program.

### Known limitations (not fixed here)

- **J's Fit band stays STRONG.** PROGRESSION "Issue found" is MINOR severity, below the breadth bar (MODERATE), and the base band is the worst single leverage (LOW reads STRONG). J's headline and action now name the near-failure problem, but the band label understates it. Unblocked by graded severity (E4) or a decision to raise PROGRESSION from MINOR to MODERATE; both are separate ARCHs. Pinned in a test so a change is deliberate. The checker (Session C) must still not lead with the band.
- **Nine of the 25 coach-parity programs still fail**, none fixable by B1-B3: **missing rules**: A (a program-level "12 sets a week in total" finding), C (session size, audit item F8), S1 (VOLUME High is information-only, so "biceps 24.5" is never a finding), S8 (push:pull is informational and outside the roll-up; "no vertical pull" alone is not a whole-pattern gap), P2-1x; **missing inputs** (`AnalysisContext` is accepted and not read): S7 (training age), P2 (minutesPerSession), P2-1x and PPLx3 (daysPerWeek); **ambiguous**: B (side delts 7.5 is inside the Adequate band; "thinnest muscle" is a relative remark).
- Per-check *action* copy (audit F6) is not done: the PROGRESSION action is still "Review effort targets and rep ranges across prescriptions."

### Deviations from the plan as proposed

- The baseline is regenerated in its own commit; the version constant is the one engine-file change in that commit (metadata, as the Session B brief placed it). The earlier line "regenerate in the same commit as the change" is overridden: the baseline is never in an engine commit.
- `calibration.test.ts`: no assertion changed. The logging now records attention-area count, action count, the findings and the axis facts, with an audit-trail note tying each change to B1, B2 or B3. `dedup.test.ts`, `namedActions.test.ts`, `fit-score.test.ts` (the integration test) and `e2e/builder.spec.ts` carry audit notes where their premise changed by design.

## Proposed for Session B (each changes calibration; shipped, see "Shipped in Session B")

**B1. Rank the headline by deficit.** `biggestOpportunity` is the first axis with the highest leverage, in axis order, and production loads muscle groups sorted by name, so among tied Lows the headline is alphabetical ("biceps" for Starting Strength, which has no pulling at all; "calves" for a program with no leg day). Change: among equal leverage, rank by distance below the band's lower bound, then by a configured muscle priority (Tier 3).
*Changes calibration because:* the BIGGEST OPPORTUNITY column is expected to change for programs such as A and C (it is the first muscle by name today); `overallSummary` and the action order follow it.

**B2. Consolidate missing muscles and restore de-duplication.** ARCH-052 gave frequency its own root-cause key, so one missing muscle yields a VOLUME card and a FREQUENCY "no exposure" card, and a program with no legs yields nine cards. Change: group Low findings by body region into one finding ("No lower-body training: quads, hamstrings, glutes and calves get 0 sets"), suppress the FREQUENCY zero-exposure card when the same muscle already has a VOLUME Low, and surface a whole missing movement pattern (no pulling, no hinge), which today is computed and then hidden (MINOR x LOW weight = NONE leverage).
*Changes calibration because:* attention-area and action counts change (Program A: 18 findings down to a handful), strengths and `overallSummary` change, and the Fit breadth count (which counts findings) can move.

**B3. A near-failure check.** The effort check runs one way: a program with every set to failure (Program J) reads "Progression & effort: Sound" and STRONG. Change: add a fifth check, share of sets prescribed at 0 reps in reserve above a threshold (Tier 4 cutpoint, to be set with the sources already cited in the config: Refalo 2023, Robinson 2024).
*Changes calibration because:* `PROGRESSION_SOUNDNESS` metric and band change for J and any program with many RIR-0 sets; J's biggest opportunity and the "strengths" list change.

## What had to happen for Session B (all done; status in "Shipped in Session B")

- Bump `ASSESSMENT_ENGINE_VERSION` (0.4.0 to 0.5.0): persisted snapshots change for the same input.
- Add a coach-parity test: for each of the 25 harness programs, assert the headline against a coach-written expected headline (ideally checked by one or two real coaches). The 2026-10-28 audit scored the current engine at about 4 of 25.
- Regenerate `packages/api/calibration-before.txt` in the same commit as the change, and record every flipped band in the handoff.
- Pin the new check's evidence tier in `goal-profiles/evidence.test.ts` (a new tier needs its own entry; a regrade needs a decision entry, not a test edit).
- Keep the Fit band unchanged in this ARCH. Graded severity (E4) is a separate decision; until then the checker (Session C) should not lead with the band.

## Not in this ARCH

`AnalysisContext` has no effect yet. Making `daysPerWeek` matter (the same PPL reads STRONG as 6 days and NEEDS WORK as 3, because the listed days are the week), novice bands (a `[SCIENTIFIC INPUT REQUIRED]` item), and attaching sources to the Adequate-band claim are later decisions.

## Freeze check

Invariant 1 holds for all of it: every number shown is an engine output. Invariant 8 holds: no Fit input changes in Session A, and B changes Fit only through the existing roll-up. Invariants 9 and 10: copy states sets per week and counts, never outcomes, causes or posture claims (lint-tested).
