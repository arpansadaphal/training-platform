# Handoff: cue polish (ARCH-074)

Branch `cue-polish` (from `exercise-illustrations`, whose PR #42 is merged into main). No engine, config, `packages/ai` or calibration file changed; calibration tests pass (22), coach parity **19/24** (same pass set: fail S1 S5a S5b S7 S8).

## Built
- **Fix 1, cue structure.** Cues are `{ kind: "setup" | "action" | "feel", text }[]`. The brief said the column was `Json?`; it was `String[]` (`TEXT[]`), so a new additive `Exercise.cueSteps Json?` carries the shape (migration `20261115090000_add_exercise_cue_steps`). `cues.ts` is still the source of truth: `written(setup, action, feel)` for the 30 founder-approved exercises (reviewed, no "(beta)"), `draft(...)` for the other 80 (their lines as "action" steps, still beta). The seed writes `cueSteps` and keeps `cues` filled. `cueStepsOf` falls back to the legacy column, so a database migrated but not yet reseeded still shows cues.
- **Session screen.** Three rows with a run-in label (SETUP / ACTION / FEEL); the drive verbs in Action lines in bold (`apps/web/src/lib/cueText.ts`, regex, Action only, hyphenated names skipped). A draft shows its lines under one ACTION label.
- **Lint.** The shared forbidden-copy list and the ARCH-072 stems, plus `build*`, `maxim*`, `target(s)`, `grow*`, `gain(s)`. Length per kind (110 / 110 / 120 characters) and 20 / 20 / 12 words for the written 30; two founder-written Feel lines (Lateral Raise, Romanian Deadlift) are exempt by name. 0 of the 30 tripped the lint.
- **Fix 2, thumbnails.** `ExerciseThumb` (32px, first frame, no animation, empty square when there is no drawing) in the exercise picker, each Builder prescription row, and each matched /check parse line. No new image files; the manifest is ARCH-073's.
- **The picker is a listbox now.** A native `<option>` cannot hold an image, so the `<select>` became `role="listbox"` (`aria-label="Choose an exercise"`, four 44px rows visible, scrolls, one truncated line per row). Search, Enter, Escape, Add as before; ArrowUp/Down move the selection. About 15 e2e specs drove `selectOption({ index: 1 })` and were changed to `getByRole("option").first().click()`.
- **Fix 3.** Four vague draft lines fixed (Pendulum Squat, Smith Machine Squat, Incline Barbell Bench Press, Ab Wheel Rollout). Back Squat and Incline Dumbbell Press were also on the list and are covered by the rewrite. No shipped cue was wrong for its exercise.

## Measured (375x812)
- Written cue list (Back Squat, same width and font as the old list): **186.3px against 186.8px** for the 3-string list it replaced. A draft: 143.7px against 164.0px. Collapsed fold unchanged (reps top 635, Log-button bottom 742). With the Cues panel open the log controls are below the first screen, as in ARCH-072 and ARCH-073 (the drawing adds about 200px).
- Picker: about 175px taller per picker than the one-line select (the list is always visible). Every row 44-48px, one line, no sideways scroll at 375px.

## Tests
Domain 909 (cue lint and structure, `cueText`), api 244, db 13, `exercise-cues.spec.ts` 12 (4 new: draft, Builder, picker, /check parse list) and the 13 other spec files that drive the picker (all pass). `tsc` and eslint are clean in db, domain, api and web (one existing warning in `invariant.test.ts`).

## Deploying
Run the migration, then `pnpm --filter @training/db exec tsx prisma/seed.ts`. Until the seed runs the app shows each exercise's old lines (all "action", no labels, "(beta)" on all).

## Founder next
- The other 80 cues, 29 of which have no feel line at all (list in the PR). They stay beta.
- Whether the always-visible picker list is too tall on the Builder's day cards; a collapsed "Choose an exercise" button that opens the list is the alternative.
- "Back parallel to the floor" (Dumbbell Row) and "lower back against the pad" (Leg Press) are the two setup lines closest to a form directive; both pass the lint.
- Production: `cues` (TEXT[]) can be dropped once `cueSteps` is live and read for a release.

## Not done
- No new images (a 64px set would cut the picker's image weight; about 8 KB each today, lazy-loaded). No GIFs. No rewrite of the 80 drafts.
