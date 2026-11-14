# Handoff: exercise illustrations (ARCH-073)

Branch `exercise-illustrations` (from main after #40 and #41). Cues shipped in #41.

## Built
- 72 of 110 exercises have a two-frame drawing (Everkinetic, CC BY-SA 4.0), converted to 480 px WebP: `apps/web/public/exercises/` (144 files, 1.7 MB) and the manifest `src/lib/exerciseIllustrations.json`.
- `apps/web/scripts/illustrations/mapping.ts` (the matches and their notes) and `build.ts` (conversion, pinned to a commit).
- `ExerciseIllustration` inside the Cues panel: crossfade three times then rest; both frames side by side under reduced motion; a credit caption linking to `/credits`.
- `/credits` page, a landing-page link, `public/exercises/ATTRIBUTION.md`.
- Tests: `exerciseIllustrations.test.ts` (domain, 6) and 5 more e2e specs in `exercise-cues.spec.ts` (drawing, reduced motion, no-drawing exercise, `/credits` at 375 px with axe, files served).

## Founder to check
- The 11 `near` matches (notes in `mapping.ts`) and the 38 exercises with no picture (PR body).
- The license reading in ARCH-073 item 6, and whether to have someone qualified read it before charging: the repository declares 4.0, the original site's version is not stated in the archive, and I could not confirm every drawing's author agreed to it.
- Opening the Cues panel for an illustrated exercise adds about 200 px of height, so the log controls sit below the first screen while it is open (collapsed, nothing moved).

## Not done
- No GIFs (future option, about 10, if users ask). No pictures in the Builder or on /check (decided). No product name in /credits (D4).
