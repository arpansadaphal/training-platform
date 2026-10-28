# Handoff: Engine-output Session A (2026-10-28)

## Session summary

The previous session audited the engine against 25 programs and concluded "the math is correct, the output is broken" (it ran the real engine, in memory, and compared each headline with what a coach would say first). This session shipped the five fixes from that audit that do **not** change calibration output, moved the audit harness into the repo as the reference for Session B's coach-parity test, and wrote ARCH-063 (Proposed) for the three fixes that do change it. The public `/check` page is not built (Session C).

## Repo state

- **Branch:** `coach-parity-session-a` (local only), created from `product-depth-project4` (`19a081c`). Same unmerged stack as before: `product-depth-project4` → `product-depth-week1-project1` → `phase-a3a1-session-ux` → `phase-a3a-progress-summary` → `phase-a2-friction-fixes`. None is merged to `main`.
- **Commits (oldest first):** `1142aae` harness moved verbatim (alone, as asked); the harness path/ESM fix; the engine work (domain); the API, web and e2e work; this documentation. See `git log 19a081c..coach-parity-session-a`.
- **Uncommitted:** none from this session. `.gitignore` is still **staged** from before (`.playwright-mcp/`); I kept it out of every commit, as the last two sessions did.
- **Local data:** the e2e run left `phase4-builder-*@example.test` users in `training_platform_dev`. Nothing else.

## What shipped

1. **Harness** `packages/domain/scripts/coach-parity/` (`lib.ts`, `set1-3.ts`, `probes.ts`, `prodorder.ts`, README); `pnpm coach-parity` from the root. Not part of `tsc` (domain's tsconfig includes `src` only). `lib.ts` additionally prints `NAMED ACTIONS` and `RATIOS`. Before/after: all 26 runs identical except one action sentence.
2. **`AnalysisContext`** in `analysis/types.ts`, accepted at `ComputeAnalysisOptions.context`, read by nothing. A test asserts undefined, `{}` and a full context give a byte-identical Analysis and Assessment.
3. **Named actions** (`assessment/namedActions.ts`, exported `nameActions`, `NamedAction`). See PROJECT_STATE for the mechanism. Examples (before to after):
   - Upper/Lower 4-day: "Add weekly volume for rear delts." to "Add 3 sets of Rear Delt Fly on Upper B → 6.5 sets/week. Or Face Pull → 6.5."
   - Bro split 5-day: "Add weekly volume for hamstrings." to "Add 2 sets of Romanian Deadlift on Legs → 7.5 sets/week. Or Seated Leg Curl → 7.5." and calves to "Add 2 sets of Seated Calf Raise on Legs → 6 sets/week. Or Donkey Calf Raise → 6."
   - Full body 3-day: "Add weekly volume for calves." to "Add 4 sets of Standing Calf Raise on Day 2 → 4 sets/week. The Adequate range starts at 6. Or Seated Calf Raise → 4."
4. **Ratios** (`analysis/ratios.ts`, `copy/ratioLines.ts`, UI section "Cross-muscle balance").
5. **Rename** "Progression & effort" to "Effort & rep ranges": `apps/web/components/assessment/labels.ts` (the only UI string; the evidence panel and Details read it from there), the action template (`actionTemplates.ts`: "Review effort targets and rep ranges across prescriptions."), and one evidence claim's wording in `goal-profiles/hypertrophy.ts` ("Volume high; Effort & rep ranges and Recovery medium…"). Internal axis type, root-cause key and calibration identity unchanged. `packages/ai` has no reference to the old label. The historical roadmap doc still quotes it (left as a record).
6. **Constraints copy** (`apps/web/app/app/constraints/page.tsx`): "Durable guidance stored with your account. The Coach reads these when discussing your program. The deterministic analysis does not currently use them. Constraints you record here persist across programs and conversations." (The last sentence was already there.)
7. **ARCH-063**, Status Proposed, indexed in `docs/decisions/README.md`. Next free ID: **ARCH-064**.

## Deviations from the brief, and why

- **Ratios are not a sum of VOLUME.** The brief said derive them from the VOLUME computations. I tried that first: a row credits lats 1 + upper back 0.5 + biceps 0.5 + rear delts 0.5 per set against 1.5 for a bench press, so 4 sets of each read push:pull 0.6, and an evenly built program would be reported as pull-heavy. Instead each credited set is counted once per group by primary mover (factor 1.0) or movement pattern (front delts are not a goal-relevant group, so a vertical press is recognised by its pattern). Same data, same hard-set credit, no double count. `ratio` is `number | null` (null when the second total is 0) rather than `number`.
- **Named actions are a post-step, and `actionTemplates.ts` only got the effort-axis wording.** Naming needs the structure and the library; the Assessment is persisted verbatim in snapshots and is computed from an Analysis that carries neither. So `computeAssessment` is unchanged and `nameActions` runs beside it. A consequence: the persisted COMMIT snapshot shows the generic sentences (what the lifter saw at commit, ARCH-015); only Builder preview and Review's recompute show named ones.
- **Exercise choice is a curated list**, not "top 1-2 primary movers by equipment". My first version (rank by equipment familiarity, then fewest side muscles) proposed Upright Row for side delts, Good Morning for hamstrings and a deadlift for glutes. `PREFERRED_ADDITIONS` is Tier 3/4 content a coach should review.
- **A muscle no exercise moves as a primary (upper back, 0.5 at most) is handled** by taking the highest factor the library gives it, with a 6-set cap instead of 4.
- **I edited `goal-profiles/hypertrophy.ts`** (one display string in the evidence block) although the brief said not to touch `goal-profiles/` except as listed; the rename item says "any copy in the assessment display", which that string is. No engine code reads it.
- **`sessionStorage` for context was not done:** it belongs to the `/check` page, which does not exist.

## Correction to the audit report

The audit's S1 line "arms get 47 sets, quads and hamstrings together 24" was an artifact of fractional crediting (rows credit biceps 0.5, so it summed synergist credit). Counted once per set, the Reddit PPL has **28 arm sets and 35 leg sets**, push 46, pull 43, quads 12, hamstrings 12. The "arms out-train your legs" insight does not hold for that program. The push:pull imbalance the audit saw in the home-dumbbell program is real: **20 press sets, 10 pull sets**.

## Known issues / fragile areas

- **Equipment is inferred from the program, not from the lifter.** The "home dumbbell" test program contains a barbell Romanian deadlift, so barbell exercises count as available and it is offered Barbell Row. `AnalysisContext.equipment` would fix this; it is not read yet.
- **Each after-number is that one change alone.** Two actions can credit the same muscle (a hip thrust also adds hamstrings); numbers are not cumulative. An exercise is never named twice in one list, so a later muscle can fall back to the template sentence (rear delts, when the upper-back action already took Rear Delt Fly).
- **Adding sets can push a session long.** The day is chosen by region and then fewest sets; no per-session cap is checked.
- **Days are named by their own name.** A program whose days share a name (three "Full Body") gets "on Full Body" three ways.
- **A volume Low that is still Low after the addition** says so ("The Adequate range starts at 6") rather than overpromising.
- **Not viewed on a phone.** The new section is a plain list and a paragraph; I ran only the desktop e2e.
- **Barbell RDL suggested as a hamstring add for a lifter with no hinge** is a library-ranking call; `PREFERRED_ADDITIONS` order is the lever.
- Earlier handoffs' known issues still stand (Vercel region, never run `next build` under a dev server, parallel e2e flake on `next dev`).

## Test results

- `calibration.test.ts` 22/22, all "no change". Domain `tsc` clean, api `tsc` clean, web `tsc --noEmit` clean. `pnpm lint`: 0 errors (the pre-existing `invariant.test.ts` warning).
- Vitest: domain 38 files / 432, api 23 / 221, db 4 / 9, ai 8 / 61, config 1 / 3 = 74 files / 726 (was 72 / 701).
- Playwright: `e2e/builder.spec.ts` passes (extended). The rest of the e2e suite was not rerun this session; the only e2e-visible change besides the Builder is the Constraints sentence and the axis label (no spec asserts either).

## Manual actions pending (founder)

1. Review `PREFERRED_ADDITIONS` in `assessment/namedActions.ts`; it is the content that decides which exercise a stranger is told to add.
2. Decide the ratio definition (counted once per set) before it appears on `/check`.
3. Everything pending from the Project 4 handoff still applies (push the stack, merge order, Vercel region, ARCH-059).

## What the next session should start with

"Read ARCH-063 and this handoff, then do **Session B**: rank the headline by deficit, consolidate missing muscles (and surface whole missing patterns), add the near-failure check; bump `ASSESSMENT_ENGINE_VERSION`; write the coach-parity test (a coach-written expected headline per harness program); regenerate `calibration-before.txt`." Session C (`/check`) comes after that.

## Where to look if something seems wrong

- A named action names a poor exercise or the wrong day → `packages/domain/src/assessment/namedActions.ts` (`PREFERRED_ADDITIONS`, the day reducer).
- A named action's number looks wrong → it comes from `simulate()`'s `mutatedAnalysis`; compare with `structureWithAdded` in `namedActions.test.ts`.
- A ratio looks wrong → `packages/domain/src/analysis/ratios.ts` (group membership sets at the top).
- Run the whole reference set: `pnpm coach-parity`.
