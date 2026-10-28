# ARCH-063 — Engine output improvements (rank by deficit, consolidation, near-failure check)

**Date:** 2026-10-28
**Status:** Proposed. The three changes under "Proposed for Session B" are not in effect. The section "Shipped in Session A" records code already written on branch `coach-parity-session-a`, none of which changes calibration.
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

## Proposed for Session B (each changes calibration)

**B1. Rank the headline by deficit.** `biggestOpportunity` is the first axis with the highest leverage, in axis order, and production loads muscle groups sorted by name, so among tied Lows the headline is alphabetical ("biceps" for Starting Strength, which has no pulling at all; "calves" for a program with no leg day). Change: among equal leverage, rank by distance below the band's lower bound, then by a configured muscle priority (Tier 3).
*Changes calibration because:* the BIGGEST OPPORTUNITY column is expected to change for programs such as A and C (it is the first muscle by name today); `overallSummary` and the action order follow it.

**B2. Consolidate missing muscles and restore de-duplication.** ARCH-052 gave frequency its own root-cause key, so one missing muscle yields a VOLUME card and a FREQUENCY "no exposure" card, and a program with no legs yields nine cards. Change: group Low findings by body region into one finding ("No lower-body training: quads, hamstrings, glutes and calves get 0 sets"), suppress the FREQUENCY zero-exposure card when the same muscle already has a VOLUME Low, and surface a whole missing movement pattern (no pulling, no hinge), which today is computed and then hidden (MINOR x LOW weight = NONE leverage).
*Changes calibration because:* attention-area and action counts change (Program A: 18 findings down to a handful), strengths and `overallSummary` change, and the Fit breadth count (which counts findings) can move.

**B3. A near-failure check.** The effort check runs one way: a program with every set to failure (Program J) reads "Progression & effort: Sound" and STRONG. Change: add a fifth check, share of sets prescribed at 0 reps in reserve above a threshold (Tier 4 cutpoint, to be set with the sources already cited in the config: Refalo 2023, Robinson 2024).
*Changes calibration because:* `PROGRESSION_SOUNDNESS` metric and band change for J and any program with many RIR-0 sets; J's biggest opportunity and the "strengths" list change.

## What must happen for Session B

- Bump `ASSESSMENT_ENGINE_VERSION` (0.4.0 to 0.5.0): persisted snapshots change for the same input.
- Add a coach-parity test: for each of the 25 harness programs, assert the headline against a coach-written expected headline (ideally checked by one or two real coaches). The 2026-10-28 audit scored the current engine at about 4 of 25.
- Regenerate `packages/api/calibration-before.txt` in the same commit as the change, and record every flipped band in the handoff.
- Pin the new check's evidence tier in `goal-profiles/evidence.test.ts` (a new tier needs its own entry; a regrade needs a decision entry, not a test edit).
- Keep the Fit band unchanged in this ARCH. Graded severity (E4) is a separate decision; until then the checker (Session C) should not lead with the band.

## Not in this ARCH

`AnalysisContext` has no effect yet. Making `daysPerWeek` matter (the same PPL reads STRONG as 6 days and NEEDS WORK as 3, because the listed days are the week), novice bands (a `[SCIENTIFIC INPUT REQUIRED]` item), and attaching sources to the Adequate-band claim are later decisions.

## Freeze check

Invariant 1 holds for all of it: every number shown is an engine output. Invariant 8 holds: no Fit input changes in Session A, and B changes Fit only through the existing roll-up. Invariants 9 and 10: copy states sets per week and counts, never outcomes, causes or posture claims (lint-tested).
