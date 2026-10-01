# Launch Checklist

Operational runbook for taking this product from "the MVP loop works" to
"real users can sign up." Every step here is console-clicking, env-var
configuration, or verification — not feature work. Feature work in a
hardening phase is scope creep (see `phases/phase-09-hardening-and-launch.md`,
"Risks").

This file is the single source of truth for:
- What must exist before staging / production can be deployed
- Exactly which env vars go where (Vercel per-environment, local `.env.local`)
- How to rehearse the launch gate
- How to rotate `LAUNCH_OVERRIDE_TOKEN`
- How to verify rate limiting is actually engaging
- What the backup/recovery posture actually is (and isn't)
- The manual accessibility checklist

If a value or step here disagrees with the code, the code is authoritative —
update this file. If a step here disagrees with ARCH-046 or the phase file,
this file is a procedure, those are the policy.

---

## 0. Environments and env files

Five distinct database contexts exist (ARCH-027, ARCH-034):

| Context | Database | Runtime env file |
|---|---|---|
| Local dev (`pnpm dev`) | Local Postgres *or* `vercel-dev` Neon branch | `apps/web/.env.local` |
| Local DB tests (`pnpm --filter @training/db test`) | Same as local dev | `packages/db/.env` |
| Local root scripts | Same as local dev | `.env.local` |
| CI (GitHub Actions) | Ephemeral `postgres:16` service container | Workflow `env:` block |
| Vercel Preview | Neon branch created per preview | Vercel Preview env vars |
| Vercel Production | Neon primary | Vercel Production env vars |

**ARCH-034 rule:** the three local `.env` files must always point at the same
`DATABASE_URL` and `DIRECT_URL`. When you switch between local Postgres and
the `vercel-dev` Neon branch, update all three together. The symptom of drift
is "Prisma CLI is fast, Next.js is slow, RSC hits pool timeout."

**ARCH-025 rule:** any new env var the app reads must be added to
`turbo.json`'s `globalEnv` array **and** the platform config **and**
`.env.example`. A var missing from `globalEnv` will pass under direct
`pnpm --filter` invocation and fail under `pnpm turbo run`.

---

## 1. Pre-launch prerequisites

Before starting the staging rehearsal (§7) or production launch (§8), confirm:

- [ ] **A `vercel-dev` Neon branch already exists** and is what local dev points at (Phase 0 provisioned this).
- [ ] **A `staging` Neon branch does not yet exist** — you will create it in §3.
- [ ] **A staging Vercel environment does not yet exist** — you will create it in §2.
- [ ] **An Upstash Redis database does not yet exist** — you will create it in §4.
- [ ] **Sentry is already receiving errors from production** (ARCH-023 verified this in Phase 0).
- [ ] **`LAUNCH_OVERRIDE_TOKEN` is not yet set anywhere** — you will generate it in §6.
- [ ] **The launch-gate CI job step is present in `.github/workflows/ci.yml`** and passes on `main` (it is a no-op outside production, so it should always pass).

---

## 2. Vercel setup

Vercel project name: **`training-platform`**

### 2a. Confirm the project exists and is linked to the repo

1. Open https://vercel.com/dashboard
2. Confirm `training-platform` is listed. If not: **Add New → Project → Import Git Repository → select the repo**. Framework preset: **Next.js**. Root directory: **`apps/web`**. Leave build/output/install commands at default — Vercel detects pnpm + Turborepo automatically.

### 2b. Create the staging environment

Vercel calls this "Preview" by default, but we want a **long-lived** staging environment distinct from per-PR previews.

1. Vercel project → **Settings → Environments**
2. Click **Create Environment**. Name: `staging`. Base it on **Preview**.
3. Under **Deployment Protection**, leave the default (Vercel Authentication) ON for staging — staging is not public.

### 2c. Set env vars per environment

Vercel project → **Settings → Environment Variables**. For each row below, set the listed environments.

| Var | Production | Staging | Preview | Development |
|---|---|---|---|---|
| `DATABASE_URL` | Neon **primary** pooled conn. string | Neon **staging** pooled conn. string | (leave to per-PR Neon branch integration) | Neon **vercel-dev** pooled conn. string |
| `DATABASE_URL_UNPOOLED` | Neon **primary** direct conn. string | Neon **staging** direct conn. string | (per-PR) | Neon **vercel-dev** direct conn. string |
| `DIRECT_URL` | Neon **primary** direct conn. string | Neon **staging** direct conn. string | (per-PR) | Neon **vercel-dev** direct conn. string |
| `AUTH_SECRET` | `openssl rand -base64 32` — unique | `openssl rand -base64 32` — unique | `openssl rand -base64 32` — unique | `openssl rand -base64 32` — unique |
| `AUTH_URL` | `https://<production-domain>` | `https://<staging>.vercel.app` — see below | leave unset (Auth.js infers) | `http://localhost:3000` |
| `NEXT_PUBLIC_SENTRY_DSN` | from Sentry project settings | same | same | same |
| `SENTRY_AUTH_TOKEN` | from Sentry (source-map upload) | same | same | same |
| `SENTRY_ORG` | Sentry org slug | same | same | same |
| `SENTRY_PROJECT` | Sentry project slug | same | same | same |
| `MODEL_PROVIDER` | `anthropic` | `gemini` | `mock` — see below | `gemini` (per ARCH-045) |
| `ANTHROPIC_API_KEY` | real key (billing required) | leave unset | leave unset | leave unset |
| `ANTHROPIC_MODEL` | pinned model string | leave unset | leave unset | leave unset |
| `GEMINI_API_KEY` | leave unset | real key (AI Studio, free tier) | leave unset | real key |
| `GEMINI_MODEL` | leave unset | `gemini-3.8-flash` | leave unset | `gemini-3.5-flash` |
| `UPSTASH_REDIS_REST_URL` | from §4 | from §4 | from §4 | from §4 |
| `UPSTASH_REDIS_REST_TOKEN` | from §4 | from §4 | from §4 | from §4 |
| `LAUNCH_OVERRIDE_TOKEN` | **Production ONLY** — see §6 | **do NOT set** | **do NOT set** | **do NOT set** |

**`LAUNCH_OVERRIDE_TOKEN` is only ever set in Production.** Setting it in Preview or Development defeats the audit trail — the override is a production-only decision. If you find it set anywhere else, remove it immediately.

**Staging `AUTH_URL` — raw `*.vercel.app` domain, not a Vercel-Auth-wrapped URL.** Staging is protected by Vercel Authentication at the platform edge. That produces a Vercel-hosted interstitial (a login page on `vercel.com`'s domain) *before* requests reach the Next.js app, and the URL the user eventually lands on after passing the interstitial is the raw `https://<staging>.vercel.app` deploy URL. Set `AUTH_URL` to that raw domain. Do **not** copy the Vercel-Auth login URL into `AUTH_URL` — Auth.js uses `AUTH_URL` to construct callback URLs and to validate the `Origin` header on credential submissions; pointing it at `vercel.com` breaks both, silently, in ways that look like "authentication is broken" with no server-side error to chase.

**Preview runs `MODEL_PROVIDER=mock` deliberately.** Per-PR preview deploys exist to check that a PR builds and renders — not to exercise the Coach against a real model. Preview also has no `GEMINI_API_KEY` and no `ANTHROPIC_API_KEY` set, so any real-provider selection fails at first Coach turn. Do **not** switch Preview to `gemini` without first provisioning a billed quota — Gemini's free tier is adequate for staging and local dev, but preview deployments at PR velocity would burn it in a day and leave real staging rate-limited. If you find Preview set to `gemini` or `anthropic`, set it back to `mock`.

### 2d. Deploy triggers

- **Production:** push to `main`. Env = `production`.
- **Staging:** in Vercel project → **Settings → Git**, add the branch(es) you want deployed to staging (e.g. `staging`), and set their **Production Branch** to `staging`. Env = `preview` for Vercel, but we set `VERCEL_ENV` explicitly via a project override for staging if needed (see §7 — the rehearsal uses a GH workflow that sets `VERCEL_ENV=production` locally, not Vercel's staging env).
- **Preview:** every PR. Env = `preview`. This is fine — the launch gate skips non-production envs.

---

## 3. Neon setup

Neon project name: **`training-platform`**

### 3a. Create the staging branch

1. Open https://console.neon.tech
2. Select the `training-platform` project
3. Branches → **Create branch**. Name: `staging`. Base it on `main` (Neon's `main` branch = our production branch).
4. Copy two connection strings from the new branch:
   - **Pooled** (PgBouncer) → this is `DATABASE_URL` for Vercel staging
   - **Direct** (unpooled) → this is `DIRECT_URL` and `DATABASE_URL_UNPOOLED` for Vercel staging
5. Paste into Vercel's staging env per §2c.
6. Run migrations on the staging branch **once**, from a local machine with the staging connection strings temporarily in `packages/db/.env`:
pnpm --filter @training/db exec prisma migrate deploy
pnpm --filter @training/db exec prisma db seed


Then revert `packages/db/.env` back to its previous target (ARCH-034).

### 3b. Confirm production branch connection strings

Vercel's production env already carries them from Phase 0. Re-verify they're still valid by opening the Neon console → `main` branch → Connection Details.

### 3c. Point-in-time recovery (PITR) — the honest state

**Neon's free tier does not include PITR.** There is no retention window. If the production database is deleted, corrupted, or a bad migration is applied and not caught, **all user data is unrecoverable**. This is a real, named risk — see §10.

Do not upgrade to a paid tier in Phase 9. This is a product/business call, logged in §10 with the explicit cost and trigger.

---

## 4. Upstash Redis setup (rate limiting)

Rate limiting uses Upstash's REST API from Vercel's Edge Middleware. Free tier: 10,000 commands/day — sufficient for MVP.

1. Open https://console.upstash.com
2. Sign in (or create an account — free).
3. **Create Database**. Name: `training-platform-ratelimit`. Type: **Regional**. Region: pick the one closest to your Vercel deployment region (check Vercel project → Settings → Functions → Region).
4. In the new database's **REST API** section, copy:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
5. Paste both into Vercel's env vars (§2c) for **all** environments.

**Cost note:** the free tier resets daily. If you hit 10K commands/day, rate limiting fails open (the middleware allows the request and logs a warning to Sentry) rather than blocking legitimate traffic. This is the correct failure mode for a launch posture — decide the alternate (fail closed) only if abuse is observed.

---

## 5. Sentry — alert rules and notification routing

Config-only. No alerting code lives in the app.

### 5a. Confirm the project and DSN

1. https://sentry.io → Projects → confirm `training-platform` exists.
2. Copy the DSN → already in Vercel env as `NEXT_PUBLIC_SENTRY_DSN`.

### 5b. Configure email routing

1. Sentry → **Settings → Account → Emails** → confirm the destination email. If you want a dedicated alias (recommended, e.g. `sentry@yourdomain`), add and verify it here first.
2. Sentry → Project `training-platform` → **Settings → Notifications** → confirm the account-level "Issue Alerts" default routes to the destination email.

### 5c. Create alert rules

Sentry → Project `training-platform` → **Alerts → Create Alert**. Two rules:

**Rule 1 — New issue, first occurrence.**
- Type: **Issues**
- When: **A new issue is created**
- Filter: `environment: production`
- Action: **Send a notification to [destination email]**
- Name: `New production issue`

**Rule 2 — Error rate spike.**
- Type: **Issues**
- When: **The issue is seen more than [10] times in [5] minutes**
- Filter: `environment: production`
- Action: **Send a notification to [destination email]**
- Name: `Production error rate spike`

**Do NOT exclude the Coach from either rule.** Production runs `MODEL_PROVIDER=anthropic`; Gemini is staging/local only. Coach errors in production are real errors and should alert. If Gemini produces noise on staging, it surfaces with `environment: staging` and is filtered by the `environment: production` condition on both rules.

### 5d. Verify with a test error

Follow ARCH-023's reference pattern: a route handler that explicitly calls `Sentry.captureException(error)` and `await Sentry.flush(5000)` before returning. Trigger it once in production, confirm the issue appears in Sentry and the email arrives.

---

## 6. `LAUNCH_OVERRIDE_TOKEN` — generation and rotation

### 6a. First generation (before first production deploy)

1. On your local machine:
openssl rand -base64 32


This produces a 44-character base64 string. Example shape: `x7Kp…==` (44 chars, `[A-Za-z0-9+/]` + `=` padding).

2. Vercel → project → **Settings → Environment Variables** → **Add New**.
- Key: `LAUNCH_OVERRIDE_TOKEN`
- Value: paste the string
- Environments: **Production only.** Uncheck Preview, Development.
- Click **Save**.

3. Trigger a fresh production deploy (Vercel → Deployments → ⋯ on the latest → **Redeploy** → uncheck "Use existing build cache").

4. In the build log, confirm two lines appear:
[launch-gate] VERCEL_ENV=production, LAUNCH_OVERRIDE_TOKEN present (validation passed). Bypassing.


An auditor searching Vercel's build logs for `[launch-gate]` sees every override, across every deploy.

### 6b. Rotation procedure

Rotate on the earlier of:
- any team change (a person who has seen the token leaves),
- twelve months from the last rotation,
- the day a `validated: true` goal profile ships (at which point the token is removed entirely, not rotated).

**To rotate:**

1. Generate a new value locally: `openssl rand -base64 32`.
2. Vercel → Settings → Environment Variables → `LAUNCH_OVERRIDE_TOKEN` → **Edit** → replace value → Save. (Production only. Do not touch Preview/Development.)
3. **Immediately** trigger a fresh production deploy. **The old token invalidates the moment you save the new value**, but the currently-running production deployment was built with the old token — it continues running until you redeploy. Redeploying is required to move the production deployment onto the new token's bypass.
4. Verify: the new deploy's build log shows the `[launch-gate]` bypass line.
5. Append a one-line entry to the **Rotation log** in `docs/decisions/ARCH-046.md`'s Addenda section:
v2 issued 2026-XX-XX (supersedes v1 issued 2026-09-28).



**Do not** commit the token to git, paste it in a chat, or store it in a password manager shared with anyone outside the project. Vercel's env-var history is the audit trail; there is no other copy.

---

## 7. Staging rehearsal — the launch gate, verified

**Purpose:** satisfy the phase file's acceptance criterion — the launch gate is confirmed to *actually block* a production-flagged build in a rehearsal, and to *actually bypass* when the token is present.

**Justification for the GH-Actions reading of "staging rehearsal":** the phase file asks the launch gate to be "confirmed to actually block a deploy in a staging rehearsal." A GH-Actions workflow that runs the exact command Vercel's production build runs, in two configurations (fail-without-token, bypass-with-token), satisfies that criterion more precisely than a live staging deploy would: it exercises the gate itself, in isolation, without conflating it with staging's other configuration (which uses `VERCEL_ENV=preview` and does not trigger the gate at all). A live staging deploy would *not* fire the gate — that is the correct production-only behaviour, and verifying it would prove nothing about whether the gate blocks real production. The workflow is the rehearsal; staging is the separate environment for the full regression suite (§9). Both are named acceptance criteria; neither substitutes for the other.

**Location:** `.github/workflows/launch-gate-rehearsal.yml`, triggered manually via `workflow_dispatch`.

**Procedure:**

1. Push the branch that introduces the rehearsal workflow. Wait for the standard `ci` workflow to pass.
2. GitHub → **Actions** → **Launch Gate Rehearsal** → **Run workflow** → select the branch → **Run**.
3. The workflow performs two runs:
- **Run 1:** `VERCEL_ENV=production`, no `LAUNCH_OVERRIDE_TOKEN`. **Expected: exit 1** with `Launch gate failed: 1 goal profile(s) are not validated...`. If this run exits 0, the rehearsal fails.
- **Run 2:** `VERCEL_ENV=production`, `LAUNCH_OVERRIDE_TOKEN` set to `openssl rand -base64 32`. **Expected: exit 0** with `[launch-gate] VERCEL_ENV=production, LAUNCH_OVERRIDE_TOKEN present (validation passed). Bypassing.`. If this run exits non-zero, the rehearsal fails.
4. Both runs pass → the gate is verified. **Record the workflow run URL in the Phase 9 close-out notes** under `PROJECT_STATE.md` as evidence the phase file's acceptance criterion was met.

---

## 8. Production launch procedure

1. Confirm §2c's Production env vars are all present and correct.
2. Confirm §3b's production connection strings are valid.
3. Confirm `LAUNCH_OVERRIDE_TOKEN` is set in Production only (§6a).
4. Confirm the launch gate has been rehearsed (§7) and both runs passed.
5. Confirm §5c's Sentry alert rules exist and §5d's test error was received.
6. Push to `main`. Watch the Vercel production build log for:
- `[launch-gate] VERCEL_ENV=production, LAUNCH_OVERRIDE_TOKEN present (validation passed). Bypassing.`
- `check:provisional-banner: PASS`
- Successful `next build` completion.
7. After the deploy is live, spot-check:
- `https://<production-domain>/` loads
- Signup → dashboard works
- The provisional-thresholds banner is visible on any Assessment surface (any Review or Builder screen with an assessment; the banner reads "Thresholds are provisional. This assessment is not yet scientifically validated.")
- Sentry's Releases page shows the new release
8. Open the running app in two browsers (or one browser + one incognito) and confirm rate limits do not falsely engage: navigate normally for 60 seconds.

---

## 9. Full Playwright regression spec

**Location:** `apps/web/e2e/regression.spec.ts`

The spec is a single continuous flow covering every acceptance criterion from Phases 4–8. It does **not** replace the per-phase specs (`builder.spec.ts`, `builder-simulate.spec.ts`, `training.spec.ts`, `landing-dashboard.spec.ts`, `review.spec.ts`, `coach.spec.ts`); it verifies they hold together end to end.

**Runs with:**
- **In CI:** `MODEL_PROVIDER=mock`. `MockProvider` is extended (Phase 9) to produce a deterministic `simulate_program_change` → `prepare_apply_confirmation` tool-call sequence for the Coach step. The orchestrator stays in the path — no direct calls to `simulation.simulate` as a shortcut.
- **On staging:** `MODEL_PROVIDER=gemini` against a real `GEMINI_API_KEY` (set in Vercel's staging env, §2c).

**Cleanup:** the spec uses UI signup with a unique email per run and a `test.afterAll` that deletes the test user + Program via a Prisma call against the test DB. The existing per-phase specs leave cruft; the regression spec does not add to it.

**Accessibility assertions** (§11) are integrated into this spec plus the Builder, Session, and Review specs, via `@axe-core/playwright`.

---

## 10. Rate limiting verification

The rate limiter is `apps/web/middleware.ts` (Upstash sliding window, keyed by session cookie → user ID, else IP). The policy:

| Path pattern | Limit |
|---|---|
| `/api/trpc/coach.postMessage` | 10 / min |
| `/api/trpc/*` (other) | 120 / min |
| `/api/auth/*` | 20 / min |

**Evidence for the phase file's acceptance criterion** ("rate limiting is verified to actually engage under a simple load test against `coach.postMessage`") is produced by `apps/web/scripts/load-test-ratelimit.sh`. The script fires rapid sequential requests at a running instance and asserts the 429 threshold fires. It is run **manually** — against a local dev server (with Upstash credentials set) for development, and against staging for the acceptance record.

### 10a. Running the script

**Against local dev:**
Terminal 1: bring up the app with Upstash env set
cd apps/web && pnpm dev

Terminal 2: run the load test
cd apps/web
bash scripts/load-test-ratelimit.sh http://localhost:3000



**Against staging:**
cd apps/web
bash scripts/load-test-ratelimit.sh https://<staging>.vercel.app



The script requires no auth — it targets endpoints that return a rate-limit response before the auth check, which is the point: the limiter must fire before the request reaches application code. If a target deployment adds an outer auth wall (Vercel Authentication on staging), pass a cookie via `RATE_LIMIT_TEST_COOKIE` in the environment — the script forwards it if present.

### 10b. Expected output
[rate-limit-test] Target: http://localhost:3000
[rate-limit-test] Category: coach.postMessage (expected limit: 10/min)
[rate-limit-test] Sending 15 sequential requests…
[rate-limit-test] 1 → 401
[rate-limit-test] 2 → 401
...
[rate-limit-test] 9 → 401
[rate-limit-test] 10 → 401
[rate-limit-test] 11 → 429
[rate-limit-test] 12 → 429
[rate-limit-test] 13 → 429
[rate-limit-test] 14 → 429
[rate-limit-test] 15 → 429
[rate-limit-test] Result: PASS (first 429 at request 11, limit enforced after 10)



The 401s are the unauthenticated tRPC response (`UNAUTHORIZED`). They are the correct signal that the limiter did **not** engage before the limit and **did** engage after it: a request that passes the limiter reaches the app and is rejected for lack of auth; a request that trips the limiter is rejected at the edge with 429.

If the first 429 arrives at request ≤10, the limit is set too low — check `UPSTASH_REDIS_REST_URL` and re-verify the config in `apps/web/src/lib/rateLimit.ts`. If no 429 arrives by request 15, the limiter is not engaging — check middleware is deployed and the Upstash credentials are valid (the middleware logs a warning to Sentry on Upstash failure and fails open).

### 10c. Recording the evidence

Copy the script's output into the Phase 9 close-out notes in `PROJECT_STATE.md` under "Verification evidence", alongside the launch-gate rehearsal URL (§7).

---

## 11. Backups & recovery

### Current state

**Neon free tier: no point-in-time recovery. Retention window: zero.**

Concretely: if production's database is deleted, or a bad migration is applied and not caught before the next deploy, or Neon itself has a region-level incident beyond their SLA for free tier, **all user data — Programs, ProgramVersions, TrainingBlocks, Sessions, PerformanceRecords, Observations, AIConversations, Constraints, Users — is lost, unrecoverable, and not restorable from any backup.** There is no snapshot to fall back to.

### Risk named honestly

This is a real, business-level risk. It is not "enterprise security theater" to name it — it's the specific, concrete failure mode of the free tier. A single `prisma migrate deploy` with a destructive migration, or a single accidentally-dropped table, is a full loss.

### Recommendation

Upgrade to Neon's **Launch plan** ($19/mo at time of writing) before opening to public signups. That tier includes a PITR window (7 days on Launch; longer on higher tiers), turning "total loss" into "recoverable within hours, with data loss bounded to the PITR window."

### Decision log

**Phase 9 does not upgrade.** This is a product/business decision, not an engineering one — logged here so the decision is explicit, not silent. Before turning on public signups, record the choice:
- **Upgrade** before launch → recommended default.
- **Accept the risk** → record the decision and its owner in `docs/decisions/` as a new dated entry.

If you accept the risk, add a line to this section: *"Accepted by [name] on [date]. Re-evaluate before public marketing."*

---

## 12. Accessibility — manual keyboard-walk checklist

Bounded scope: **Builder, Session logging, Review.** Not a full WCAG audit. The automated half is `@axe-core/playwright` assertions integrated into the existing specs. The manual half is the walk below, performed once before launch and once after any major UI change.

### Builder (`/app/programs/[id]/build`)

- [ ] Tab from the top of the page reaches every interactive control in a sensible order (name input → draft controls → workout-day controls → exercise pickers → Save/Commit).
- [ ] Focus is visible on every focused element (default browser outline is acceptable; a hidden outline is not).
- [ ] `Enter` activates primary buttons; `Space` activates toggles.
- [ ] Removing a workout day / exercise is reachable and activatable by keyboard alone.
- [ ] The Assessment panel headings (`Overall`, `Strengths`, etc.) are reachable via heading navigation.
- [ ] The provisional-thresholds banner is announced on first render (aria-label present, no focus trap).

### Session logging (`/train/...`)

- [ ] Tab reaches the log-set inputs in a sensible order for each exercise.
- [ ] Number inputs accept keyboard entry without trapping focus.
- [ ] "Mark complete" / "Mark skipped" are keyboard-reachable and activate on `Enter`/`Space`.
- [ ] The deviation-from-plan inputs (reps, load) are keyboard-reachable.

### Review (`/app/review/[blockId]`)

- [ ] Tab reaches the "Show recompute" toggle; toggling it via keyboard reveals the recomputed assessment.
- [ ] The Adherence / Deviations / Observations sections are reachable via heading navigation.
- [ ] The Coach panel (when present beside Review) is keyboard-reachable; the input accepts typing without stealing Tab.
- [ ] Colour contrast: run a contrast check on the provisional-thresholds banner — the banner must be legible on its background.

### Landmarks

- [ ] Each page exposes a `<main>` landmark and a page-level heading hierarchy with no skipped levels.

---

## 13. Post-launch verification (first 24 hours)

- [ ] Sentry Issues list shows no new error types within the first hour of production traffic.
- [ ] Sentry email alerts fire on the first real error (see §5d).
- [ ] Vercel Analytics / logs show no unexpected 500s on `/api/trpc/*`.
- [ ] Upstash console shows rate-limit command usage within free-tier headroom (well under 10K/day at MVP traffic).
- [ ] A real signup + build + commit + train + review loop completes end-to-end without errors.
- [ ] The provisional-thresholds banner appears on every Assessment surface visited.

---

## Appendix A — the `[launch-gate]` log marker

Every invocation of `apps/web/scripts/launch-gate.ts` prints exactly one line beginning with the literal marker `[launch-gate]`. Two distinct categorisations appear in the marker's tail:

| Environment | Emitted line |
|---|---|
| `VERCEL_ENV` unset (CI, local sanity check) | `[launch-gate] VERCEL_ENV=(unset). Gate is a no-op outside production.` |
| `VERCEL_ENV=preview` / `development` / etc. | `[launch-gate] VERCEL_ENV=<value>. Gate is a no-op outside production.` |
| `VERCEL_ENV=production`, valid token | `[launch-gate] VERCEL_ENV=production, LAUNCH_OVERRIDE_TOKEN present (validation passed). Bypassing.` |
| `VERCEL_ENV=production`, no valid token | `[launch-gate] VERCEL_ENV=production, no valid LAUNCH_OVERRIDE_TOKEN. Asserting.` then either `[launch-gate] PASS …` or `[launch-gate] FAIL …` |

**An auditor searching either Vercel's build logs or GitHub Actions logs for `[launch-gate]` finds every run**, categorised. Cross-reference each `Bypassing.` line with the rotation log in `docs/decisions/ARCH-046.md`'s Addenda. Do not paraphrase or rename the marker.