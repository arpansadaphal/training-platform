# Goal Selector — Design Brief (Session C2)

**Date:** 2026-10-31 · **Status:** working document, for founder and coach review · **No code, config or schema change.**

## 1. Summary

This brief fixes the v1 goals and a per-muscle VOLUME weight (HIGH / MEDIUM / LOW) for each, with a source and a confidence for every HIGH cell. It does not touch thresholds, severity maps or axis-level weights (Session C3 and E4). Its main finding is a limit. **Weights change which finding leads and how the Fit band reads. They never change which findings are shown.** So the goal selector alone cannot reproduce the coaches who said "fine as-is". A simulation of this matrix against the harness (Section 4) shows it.

## 2. Goals

**v1 (confirmed, with one condition):**

- **Build muscle.** The default; it reproduces today's HYPERTROPHY output exactly.
- **Aesthetic physique**, with a V-taper focus.
- **Get stronger**, with an SBD focus. **The condition:** Strength ships only if its copy says it is judged against muscle-growth ranges. Today every number it reads, the 6–20 set band and the 5–30 rep-range check, is a hypertrophy boundary. Without that copy, a 5/3/1 lifter is told "calves volume is low, under the 6–20 range the evidence supports". Two of five coaches called that program fine as written.

**Deferred:** returning after a break; cut / recomp.

## 3. Priority matrix (VOLUME weight per muscle)

| Muscle | Build muscle | Aesthetic | Strength |
|---|---|---|---|
| chest | HIGH | HIGH | HIGH |
| lats | HIGH | HIGH | MEDIUM |
| upper back | HIGH | MEDIUM | HIGH |
| side delts | HIGH | HIGH | LOW |
| rear delts | HIGH | HIGH | LOW |
| biceps | HIGH | MEDIUM | LOW |
| triceps | HIGH | MEDIUM | HIGH |
| quads | HIGH | MEDIUM | HIGH |
| hamstrings | HIGH | MEDIUM | HIGH |
| glutes | HIGH | MEDIUM | HIGH |
| calves | HIGH | HIGH | LOW |

**What a level does under today's tables.** A VOLUME Low is MAJOR severity.

| Weight | Leverage | Ranking | Fit band | Shown? |
|---|---|---|---|---|
| HIGH | HIGH | can lead | NEEDS WORK | yes |
| MEDIUM | HIGH | ranks after any HIGH-weight Low | NEEDS WORK | yes |
| LOW | MODERATE | ranks last | DECENT, if it is the worst finding | yes |

Two consequences follow:

- For a Low, HIGH and MEDIUM differ only in ranking, because MAJOR × HIGH and MAJOR × MEDIUM both give HIGH leverage.
- A Low is always shown. Attention areas are chosen by severity, not leverage.

## 4. Per-goal rationale

**Build muscle: all HIGH.** This is today's behaviour: every muscle resolves to the `VOLUME:` fallback, which is HIGH. Lowering any cell changes the default output and the calibration (L leads with calves), so it would need a version bump. Two cells are Contested (rear delts, calves) and go to coach review. They stay HIGH in C2.

**Aesthetic: shoulder width, back width, chest and calves first.** V-taper is width at the shoulders (side delts) and the back (lats). Every other muscle is MEDIUM, so it still has HIGH leverage when Low and is still shown; it only ranks behind those. Arms stay MEDIUM because a HIGH there would be Guessed: no coach flagged an arm deficit anywhere, while arm excess was flagged on S1 (all five), F1 (coaches 1, 2 and 5) and B (coach 5).

**Strength: the SBD prime movers first.** Quads and glutes drive the squat, glutes and hamstrings the deadlift, and chest and triceps the bench. Upper back is HIGH for bar position and the deadlift (Contested). Delts, biceps and calves are LOW: they are still shown when Low, with MODERATE leverage.

**What the matrix does to the contested programs.** This was simulated on the real engine with an in-memory copy of the config; no file was changed.

| Program | Build muscle (today) | Aesthetic | Strength |
|---|---|---|---|
| S2 | rear delts · NEEDS WORK | same | rear delts · **DECENT** |
| S3 | lower body (calves) | same | **upper body (upper back)** |
| S6 / S6b | calves / lower body | same | **upper body (upper back)** |
| P1 | calves · NEEDS WORK | same | calves · **DECENT** |
| S5b | no pulling | same | same |
| F2 | no lower body (quads) | lead muscle calves | same |

In every row the number of findings shown is identical across the three goals.

- **Aesthetic matches today** on all five goal-dependent programs. That agrees with the coaches who would say these things to a physique lifter.
- **Strength never goes silent.** Two of five coaches said "fine as-is" for S6, S6b and P1. Strength instead leads S3, S6 and S6b with upper back, which no coach said.

## 5. Weight versus threshold

> Weight and threshold are separate questions, and the brief must be honest about this:
>
> - **Weight** affects *leverage* when a finding already fires. A muscle below the LOW band with HIGH weight produces HIGH leverage (biggest opportunity); the same muscle with LOW weight produces lower leverage.
> - **Threshold** determines what counts as "below" in the first place. A muscle at 6 sets is Adequate (6-20 band) regardless of its weight.
>
> Consequence for the coach review: Coach 2 said "chest at 7 and side delts at 6 are fine." Coach 3 said "chest and side delts are thin for an intermediate." Both are looking at the *same* values (7 and 6 sets) — this isn't a disagreement about priority, it's a disagreement about whether 6-7 sets is actually adequate. That is a threshold question, not a weight question, and the Freeze marks it [SCIENTIFIC INPUT REQUIRED].
>
> **The goal selector changes which muscles matter when a finding fires. It does not change when a finding fires. If real coaches disagree about whether 6 sets is fine, the fix is a threshold decision (E4), not a weight decision.**

**What the code adds.** S2 measures chest 7 and side delts 6, both Adequate. Its only finding is rear delts at 3.5. Weighting chest and side delts HIGH under Aesthetic changes nothing for S2, as the simulation confirms.

**Recommendation.** Ship the goal selector with these weights. Also flag to the founders that chest and side delts at 6–7 sets may need a threshold review, with real sports-science input, before those muscles are reported Adequate.

## 6. HIGH cells: reasoning and confidence

**About the coach counts.** C1's annotation says "3 of 5 agreed" on S2, S3, S6, S6b and P1. Read closely, each program splits about the same way: 1 unconditional agreement, 2 conditional on goal and 2 "fine":

- **The one unconditional agreement** is coach 1, who answered a one-word "Agree" on 17 of the 25.
- **The two conditional answers** are coaches 3 and 5: "if they're priorities", "if shoulder size is a goal", "for physique work".
- **The two "fine" answers** are coaches 2 and 4.
- **The exception:** on P1, coach 5 says "looks good" now and adds side delts and calves after 4–6 weeks.

That split is stronger evidence of goal dependence than "3 of 5", and weaker evidence for any single default.

**Build muscle**

| Cell | Reasoning and source | Confidence |
|---|---|---|
| chest, lats, upper back | Weekly volume per muscle is the best-supported driver (ACSM 2026; Pelland 2026; dose-response, Schoenfeld 2017). Pulling gaps were endorsed by all 5 coaches on S5 and S8. | Confident |
| side delts | S2: coaches 3 and 5 called side delts thin "for an intermediate focused on hypertrophy". RP gives side delts direct-work volume landmarks. | Confident |
| rear delts | S2's engine headline. Only coach 1 endorsed the fix; coaches 3 and 5 called face pulls "optional", and coaches 2 and 4 said fine. | **Contested** |
| biceps, triceps | Synergist volume counts at 0.5 (Pelland 2026). Coaches disputed arm excess (S1, F1, B), never that arm work matters. | Confident |
| quads, hamstrings, glutes | F2 (no legs): 5/5 agree. S4 (hamstrings): all agree, though coach 5 ranks it behind frequency. P3 (no hinge): all agree. | Confident |
| calves | S3: coach 3 "optional priorities depending on the client's goals", coach 4 "doesn't care about bodybuilding calves", coach 5 "if they matter to you". B: coach 5 "maybe trim a little arm/calf volume". | **Contested** |

**Aesthetic**

| Cell | Reasoning and source | Confidence |
|---|---|---|
| side delts | Shoulder width is the V-taper (bodybuilding consensus; RP). Coaches tie lateral work to the goal on S3 (3, 5), S6 (5: "glaring gaps for physique work") and P1 (3, 5). | Confident |
| lats | Back width is the V-taper (consensus). S5: coach 4, "terrible if your primary goal is upper body aesthetics". | Confident |
| chest | Upper-body physique consensus. The only coach evidence is S2's 3–2 split, which is threshold-shaped, so the priority question has not been asked. | **Contested** |
| rear delts | Coach 5 (S6) lists them among the physique gaps. Coaches 3 and 5 (S2) call face pulls optional. | **Contested** |
| calves | Coaches 4 and 5 tie calves to bodybuilding and physique, but the goal is framed as V-taper, which calves are not part of. | **Contested** (scope) |

**Strength**

| Cell | Reasoning and source | Confidence |
|---|---|---|
| quads, glutes | Squat and deadlift prime movers: training specificity, coaching consensus (Stronger by Science), and the structure of 5/3/1 and Starting Strength in the harness. | Confident |
| chest, triceps | Bench press prime mover and lockout (same sources). | Confident |
| hamstrings | Deadlift and hip extension contributor. Coach 3 (S6) called the existing leg curls "useful assistance" in 5/3/1. | Confident |
| upper back | Coaches 1 and 3 add upper-back pulling to Starting Strength. Coaches 4 and 5 call it fine "for strength". It makes S3, S6 and S6b lead with upper back (Section 4). | **Contested** |

No HIGH cell is Guessed. Where a HIGH would have been Guessed (Aesthetic arms), the cell is MEDIUM.

## 7. Send to coach before C2 builds

1. **Strength × upper back.** Does a 5/3/1 or Starting Strength lifter need more upper-back volume, or is it fine for strength? This one decides S3, S6 and S6b's Strength headline.
2. **Build × rear delts.** Is 3.5 weekly sets with no face pulls (S2) worth the headline for a general muscle-building lifter?
3. **Build × calves.** Default on or default optional?
4. **Aesthetic × chest.** Ask the priority question on its own: is chest a first-line muscle for a V-taper goal?
5. **Aesthetic × rear delts.** First-line, or behind side delts and lats?
6. **Aesthetic × calves.** Does "aesthetic" include lower-leg proportion, or only the V-taper?
7. **Strength × side delts, rear delts, biceps, calves at LOW.** Coaches 2 and 4 should know that LOW still shows the finding, just ranked last. Is that acceptable, or must they be silent?

**Separately, to the founders, not a coach:** the chest and side-delt threshold at 6–7 sets (S2) needs a sports-science review (E4).

## 8. Open design questions

1. **Silence needs more than weight.** "Fine as-is" for a strength lifter means not showing the finding. That needs a per-goal severity map or materiality threshold, which is C3 and E4 territory. Should C2 wait for it, or ship knowing Strength will still list delts and calves?
2. **Three levels act as two for Lows.** HIGH and MEDIUM give the same leverage and differ only in rank. Is a ranking-only difference enough, or should a band change carry the distinction (C3)?
3. **Strength reads hypertrophy rules.** That covers the 6–20 set band, the 5–30 rep-range check and the near-failure check. %1RM templates at 1–5 reps can fail the rep-range check. Is weight-only Strength honest enough for v1, given the copy condition in Section 2?
4. **"Aesthetic" is not one goal.** A V-taper puts glutes at MEDIUM, while a glute-focused physique goal wants them HIGH. Is it one goal or two?
5. **Out-of-scope movers.** Front delts (bench), adductors and spinal erectors (squat, deadlift) are not relevant muscle groups. Should the Strength matrix get them?
6. **Per-goal `musclePriority`** (tie-break key 5). Derive it from the matrix, or keep one list?
7. **Mechanics to verify before building.** Per-muscle keys (`VOLUME:<name>`) already resolve, because `scopeKey` is the muscle name. The E14 comment in `hypertrophy.ts` saying they cannot be added looks stale; confirm it and remove the comment.
8. **Parity.** The goal-dependent entries in `expected.ts` need an expected headline per goal. C1's S2 rationale ("3 of 5 agreed with the engine's finding") should be corrected: only coach 1 endorsed the rear-delt finding.

**Outside this brief.** Coach 3 disagreed with "solid, nothing to fix" on PPLx3 and PPLx6: weekly volume is high (about 34 push, 30 pull and 34 leg sets). Coaches 1, 2 and 4 agreed, and coach 5 said "mostly solid, monitor recovery". Those are two of today's empty passes; this is a parity question, not a weight question.

**Deferred goals:** returning after a break (P1's persona) and cut / recomp are out of v1. Neither is designed here.
