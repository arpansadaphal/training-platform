# Handoff: Session E, the public Program Checker (2026-11-03)

## Session summary

`/check` is built and works end to end, **behind `CHECK_PUBLIC` (default false)**. A stranger can paste a routine or pick one of six splits, confirm how it was read, and get the assessment through the shared `AssessmentDisplay` with no account. Signing up afterwards can save the checked program as a first draft. **No engine, schema or `packages/ai` change; calibration unchanged (coach parity 21/24, engine 0.6.1).** The goal selector, illustrations, Coach on `/check`, email capture and analytics were not touched.

Decisions made with the founder this session: day boundaries come from headers and blank lines (the brief's "blank lines are skipped" was wrong); rate limiting stays in the Edge middleware with a test-only memory driver (ARCH-064). **Simplification B of the rate-limit decision never arrived (the message was cut off after "Simplification A"); nothing was built for it.**

## Repo state

- Branch `program-checker-session-e`, cut from `engine-output-session-d`. **Nothing is committed and nothing is pushed.** The branch stack (`phase-a2` to `engine-output-session-d`) is still unmerged, as the Session D handoff said.
- `.env.local` (gitignored) has `CHECK_PUBLIC=true` in `apps/web/.env.local`. `.env.example` documents `CHECK_PUBLIC="false"` and `RATE_LIMIT_DRIVER`.

## What shipped (brief items 1-6)

1. **`/check` page.** Tabs "Paste a routine" and "Pick a common split". Paste parses in the browser (`packages/domain/src/check/routineParser.ts`), shows "Parsed as N days" with `[Looks right] [Merge all into one day] [Edit manually]`, "did you mean" rows (`Yes`, other candidates, `Choose different` via the existing `ExercisePicker`, `Remove line`), a "Could not parse" list with Delete, and a "Check my program" button that needs 3 resolved exercises, no open questions, and a confirmed reading. Six presets are plain links to `/check/<hash>`; they are copied from harness S3, S2, PPLx6, S4, S7, S8 and `scripts/coach-parity/checkPresets.test.ts` fails if they drift.
2. **Assessment view `/check/[hash]`.** The hash is base64url of exercise names (shareable, strict decode, size caps). The page asks `check.analyze` over HTTP and renders `AssessmentDisplay` unchanged (provisional band, banner, See evidence, strengths, attention, opportunity, actions, cross-muscle balance, what's trending high). CTA below: "Create account and save this program" and "Just here to check? No account needed." (back to the input).
3. **Sign-up handoff.** CTA stores the hash in `sessionStorage["pending_program_check"]`, then `/signup?from=check`. `/app` shows "You checked a program before signing up…" with Save and Discard. Save calls `check.save` (Program + draft + structure from existing services) and opens `/app/programs/[id]/build`. Fallback when storage throws: the hash rides `/signup?from=check&h=…`, `signupAction` redirects to `/check/<hash>?import=1`, where a signed-in user sees "Save this program".
4. **Rate limit.** New `check` category in `apps/web/src/lib/rateLimit.ts`: 20 per hour, key `check:ip:<IP>`, IP always, fail-open unchanged, 429 body is the brief's message. Test-only in-memory driver (`RATE_LIMIT_DRIVER=memory`, refused when `VERCEL_ENV=production`). ARCH-064 records it; ARCH-048 has an addendum.
5. **Landing CTA.** "Or check a program you already have →" under "Create an account", rendered only when `CHECK_PUBLIC` is on. The landing page has no secondary-button style, so it is a plain link like the one above it.
6. **`/check/about`.** The brief's copy, rewritten where it would fail the copy lint (see deviations), with "Continue to the checker →".

Also: `CHECK_PUBLIC` flag (`isCheckPublic` in `@training/config`) gates the pages **and** `check.exercises`, `check.analyze`, `check.save`. Every static string lives in `packages/domain/src/check/copy.ts` and is run through `FORBIDDEN_COPY_PATTERNS` (`copy.test.ts`).

## Deviations from the brief

- **Rest lines separate days.** "Mon bench / Rest / Wed row" is two days; a Rest line is skipped, never a day, never counted. Blank lines separate days only between two exercises. Consecutive exercise lines are one day.
- **Header keywords widened** beyond the brief's list: Workout, Session, Chest, Back, Shoulders, Arms, Core, Abs (bro-split headings). "A" and "B" count only as the last word ("Upper A"), so prose containing "a" is not a header. A bare exercise ("Pull-Up") is never a header. Known gap: an exercise written with no sets that is only a *unique* (not exact) match, such as "Back Extension", is read as a header.
- **Blank-line singleton merge** only folds sections created by blank lines, never headed days or rest-separated days.
- **Copy:** the brief's About text contained "form", "technique", "safe" and "injuries", which fail `FORBIDDEN_COPY_PATTERNS`. Rewritten to "Movement quality", "Whether a given lift suits you", "Medical conditions". "24 real programs" became "24 test programs": the set includes constructed profiles (P1-P3) and audit-authored programs, so "real" overclaims. "5 real coaches" became "reviewed by 5 coaches" (the five-coach review is in ARCH-063). "21 match the headline the coaches gave" follows `expected.ts`. The word "validated" is not used (HYPERTROPHY is `validated: false`).
- **Rate limit is at the Edge middleware, not "at the procedure".** In-process callers (RSC, server action) bypass the middleware, so the assessment is a client-side tRPC query over HTTP.
- **No analysis context.** `check.analyze` makes exactly the `previewAnalyze` calls (no `AnalysisContext`), so `/check` reads a program exactly as the Builder does; `check.test.ts` asserts PPL 6-day matches `previewAnalyze` on the same structure. Sessions B and C1 had suggested asking days, training age, minutes and equipment and not leading with the band; the brief overrode that.
- **Defaults make some findings impossible.** RPE 8 and bodyweight load mean a near-failure finding cannot fire on a pasted program.
- **Assessment touch targets.** At 375px `AssessmentDisplay`'s "See evidence" buttons and "Details" summaries were about 20px tall. They are enlarged by a page-scoped rule in `check.module.css` (`.assessment button, .assessment summary`); the component is not forked or edited.
- The fail-open test in the brief hit `GET /check`, which is outside the middleware matcher and can never 429. `rate-limit.spec.ts` hits `/api/trpc/check.analyze` instead.

## Known limitations / fragile areas

- **The 20/hour limit is per IP from `x-forwarded-for`.** Behind shared NAT many visitors share a bucket; off Vercel the header is spoofable. Upstash free tier is 10K commands/day; past that the limiter fails open.
- **The memory driver is per server process** and must be set when the server starts; that is why CI has a second, small E2E run. A local dev server already running without the env var makes `rate-limit.spec.ts` skip.
- **Hash size.** A routine over 7 days or 15 exercises a day cannot be encoded; the UI says so.
- **The landing link is decided at build time** (the page is static). Flipping `CHECK_PUBLIC` in Vercel needs a redeploy, as the brief expects. The `/check` pages read the flag at request time.
- **Insecure-looking spots that are intended:** `check.exercises` is public (reference data); `check.analyze` is unauthenticated by design.
- `launch-gate` still throws in production unless `LAUNCH_OVERRIDE_TOKEN` is set (HYPERTROPHY `validated: false`); unchanged.

## Test results

- Domain Vitest: 656 passed (new: `src/check/__tests__/` 39 tests covering all five sets/reps formats, exact/substring/fuzzy matching, unmatched and mixed lines, rest days, the Push/Pull/Legs verification paste, singleton merge, hash round-trip and rejection, copy lint; `checkPresets.test.ts` 13 tests).
- Config: 4 passed. API: 226 passed (new `check.test.ts`, 5 tests: flag off, library list, bad hash and unknown exercise, PPL equals `previewAnalyze`, save). `pnpm turbo run typecheck lint test`: 20/20 tasks successful (one pre-existing lint warning in `invariant.test.ts`).
- Playwright, clean `.next`, port 3100 with the CI mock Coach scenario: **34 passed, 3 skipped, 2 failed** in the full run. `builder.spec.ts` failed under 2-worker load and **passed on its own**. `session-ux.spec.ts` **fails identically on the original code** (checked with my changes stashed), so it is not caused by this session. New specs: `check.spec.ts` (17 tests: paste, three-day paste, PPL preset, unmatched line and confirmation, Choose different, unparsed delete, singleton merge, merge all, about, landing link, bad hash 404, signup handoff x4, 375px on `/check`, `/check/[hash]` and `/check/about`, axe critical/serious) and `rate-limit.spec.ts` (fail-open, 21st request is a 429, result page shows the limit message; the last two need `RATE_LIMIT_DRIVER=memory` and passed).
- `regression.spec.ts` passed with `MODEL_PROVIDER=mock MOCK_SCENARIO=coach-regression`; without them it fails locally, with or without this branch.

## Calibration, flag state, untouched files

- **Calibration unchanged:** `pnpm coach-parity:score` is 21/24 after the change.
- **`CHECK_PUBLIC` defaults false.** Verified: with it false, `/check`, `/check/about`, `/check/<hash>` and `/api/trpc/check.analyze` all return 404 and the landing link is not rendered.
- **No engine or schema files changed:** `git diff` shows nothing under `packages/domain/src/analysis`, `packages/domain/src/assessment`, `packages/db/prisma` or `packages/ai`. `packages/domain/src/index.ts` only gained the new `check` exports.
- **Feature flag in `.env.local`:** `CHECK_PUBLIC=true` in `apps/web/.env.local` (dev only). CI sets it in the job env and the written `.env.local`.

## Manual actions pending (founder)

1. Commit, and push the branch stack; merge it to `main` before launch (still outstanding from Session D).
2. When ready to launch: set `CHECK_PUBLIC=true` in Vercel Production and redeploy. Confirm `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are set there, or the limit fails open. Never set `RATE_LIMIT_DRIVER` in Vercel.
3. Send Simplification B of the rate-limit decision if it still applies.
4. Check the About claims (24 programs, 5 coaches, 21 match, 3 exceptions) are the wording you want on a public page.
5. **Do not run `pnpm turbo run test` (it runs `next build`) and then `pnpm dev`/Playwright from `apps/web` without `rm -rf apps/web/.next`.** A production build left in `.next` made three unrelated specs hang on stuck buttons in this session. This is the same trap `playwright.config.ts` warns about.

## What the next session should start with

> Read docs/handoffs/2026-11-03-program-checker.md and ARCH-064. The Program Checker is built behind CHECK_PUBLIC; decide whether to launch it or do the goal selector (docs/plans/2026-10-31-goal-selector-design-brief.md) first. Before launch: merge the branch stack, set CHECK_PUBLIC and Upstash in Vercel, and review the About copy.

## Where to look if something seems wrong

- Parser or day splitting: `packages/domain/src/check/routineParser.ts`, tests in `src/check/__tests__/routineParser.test.ts`.
- Name matching: `exerciseMatch.ts` (abbreviations are a small table at the top).
- 429s or limit behaviour: `apps/web/src/lib/rateLimit.ts` (`check` policy, `classifyRequest`), `rateLimitMemory.ts`, `middleware.ts`.
- Result page and 429 handling: `apps/web/app/check/[hash]/ResultClient.tsx` (`isRateLimited` reads the HTTP status from the tRPC error meta).
- Signup handoff: `apps/web/src/lib/pendingCheck.ts`, `app/app/PendingCheckBanner.tsx`, `app/(auth)/signup/{page,actions}.ts`, `app/check/[hash]/CtaPanel.tsx`.
- Flag: `packages/config/src/index.ts` (`isCheckPublic`); API gate: `assertCheckEnabled` in `packages/api/src/routers/check.ts`.
