# Handoff: exercise cues (ARCH-072)

Branch `exercise-cues` (from `lint-medical-claim-stem`, PR #40, which was still open when this started). Illustrations are NOT started.

## Built
- Migration `20261114164636_add_exercise_cues` (two additive columns). `prisma/cues.ts`: 110 exercises, 2-3 cues each. Seed writes cues by id and never renames.
- `ExerciseRecord` gains `cues` and `cuesReviewed`; `withoutCues` strips them for `/check` and the Builder; the session page sends them for the day's exercises only; the engine's reference data is pinned to its old fields.
- Session screen: "Cues" toggle in the card header (44px, `aria-expanded`, collapsed by default), "(beta)" until reviewed.
- Tests: `exerciseCues.test.ts` in domain (lint, 12), `exerciseCues.test.ts` in api (5), `e2e/exercise-cues.spec.ts` (3).

## Founder next
- Read the 30 exercises in the PR description and change `draft(` to `reviewed(` for each in `prisma/cues.ts`, then reseed. The other 80 stay beta.
- Production: run the migration, then the seed (ARCH-072 item 7).

## Decided, not built (Phase 4, illustrations)
- Everkinetic images only; 32 exercises will have none (accepted). No bryllim, no RepDB.
- A 2-frame crossfade with a reduced-motion fallback instead of real GIFs: no free animated source exists. **Commissioning about 10 real GIFs is a future option if users complain.**
- /credits says "the training app" until the product name (D4) is decided.
