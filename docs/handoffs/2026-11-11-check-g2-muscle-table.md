# Handoff: /check "Weekly sets per muscle" (2026-11-11)

Branch **`check-session-g2`** (from `check-session-g`), **unpushed**, working tree clean after the final commit. No engine, config, schema, `packages/ai` or calibration change; coach parity 21/24, same pass set.

## What shipped (ARCH-070)
A table on `/check` of every muscle the engine counted: muscle, weekly hard sets, the band name, and a bar over 0-30 sets with the 6-20 range shaded. 11 rows, chest to calves, after Actions. `muscleVolumeView` (`packages/domain/src/copy/muscleVolumeRows.ts`) reads the VOLUME axes the assessment already holds, so the numbers are the finding cards' numbers (triceps 3.5 in both). `MuscleVolumeTable.tsx` renders it; `AssessmentDisplay` shows it only in `checkMode`, and drops the per-muscle volume strength cards there (the table says the same, for every muscle).

## Why muscles were "missing" (verified)
A muscle appeared on a result only inside a finding (Low) or as an earned strength (`displayStrengths`: 10+ sets). One at 6-9 sets was Adequate, which is a pass, so it appeared nowhere. Abs is not in the library's muscle groups at all, so it is not listed. The reports' "chest, shoulders, calves never appear" on the STRONG program was exactly this.

## Screenshots (scratchpad `shots/`, not committed)
`muscles-375.png` (bro split: 11 rows, six at Low, zeros for hamstrings, calves, side delts) and `tracking-375.png` (STRONG program: all 11 Adequate, the footnote naming the balance lines).

## Tests
- Typecheck, lint clean; domain 854, api 238, ai 61, db 9, config 4. New: `muscleVolumeRows.test.ts` (8: only VOLUME axes, the engine's numbers and bands untouched, a 6-sets muscle is listed, range read from the profile, order, null cases, copy lint).
- `check.spec.ts` 44 passed: all 11 muscles on a flawed and on a STRONG program, untouched muscles at 0, table agrees with the finding card, no per-muscle volume cards, strengths count equals cards shown, footnote only when the balance section is on the page, 375px, axe with the table on screen.
- Full e2e at 2 workers: 62 passed, 2 skipped, 2 failed (`journal`, `session-ux` 375px), with one dev-server memory restart in the log; both pass in isolation at 1 worker. Same known flake as Sessions F and G.

## Not resolved
- **The two counting methods still disagree where the balance lines show** (nothing flagged): arms 12 vs biceps 13 / triceps 13; hamstrings 9 vs 12. The footnote now says why; it does not remove the difference. Options: drop the balance lines from `/check`, or show the direct count in the table too. Neither was asked for.
- The headline on the bro split is still "Hinge · exercise selection" (ARCH-069: a HIGH/HIGH tie broken by axis-type order). Founder call.
- The banner, evidence-panel wording and the generic sign-up pitch (third audit items 5 and 6) are untouched.
- **Unmeasured:** no fresh reader has seen the table. The next audit should show whether it moves the assessment score; the earlier reports asked for it in all four cases.
