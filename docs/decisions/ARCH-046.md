### ARCH-046 — MVP launch proceeds with `HYPERTROPHY_CONFIG.validated === false`; CI gate bypassed via a documented, rotatable `LAUNCH_OVERRIDE_TOKEN`; every Assessment surface shows a provisional-thresholds banner
Date: 2026-09-28 | Status: FROZEN, expires the day a `validated: true` config ships | Reversible: Yes, by removing the token and the banner
Decision: The MVP launches to production with the shipped `HYPERTROPHY_CONFIG` still `validated: false` and every analysis band / axis weight / leverage cell left as its provisional placeholder. The Phase 3 launch-gate function `assertNoUnvalidatedProfilesInProduction(env, registry)` remains wired into CI and continues to fail any `production`-flagged build unless the environment contains a matching `LAUNCH_OVERRIDE_TOKEN`. Whenever the override is present, the app renders a persistent, non-dismissable banner on every surface that displays an Assessment or Fit Score: "Thresholds are provisional — this assessment is not yet scientifically validated." The banner is mounted at the `AssessmentDisplay` layer, not the page layer.
Rationale: The product thesis (00-product-freeze-reference.md) is transparency — "get it evaluated transparently against a stated Goal with reasoning shown, never a black box." Transparency is a property of showing the reasoning, not of the reasoning already being scientifically validated. Shipping with a visible banner is more honest than not shipping at all and calling the resulting idle time "protection." At the same time, the gate itself must not be silently removed or weakened — the Phase 9 file is explicit: "a deliberately-flipped, logged, dated override — never a quiet removal of the check."
Alternatives considered: (a) Defer launch until a sports scientist signs off — rejected because no expert is engaged and no timeline exists. (b) Ship without a banner and with the gate removed — rejected as dishonest and as exactly the failure mode the phase file names. (c) Ship the banner but no gate — rejected because a gate removed "for now" is a gate that never comes back.
Consequence: Two operational obligations. (1) The banner must be evaluated on every future Assessment-rendering component — a `useProvisionalBanner()` hook reading `HYPERTROPHY_CONFIG.validated === false` imported from `packages/domain`, plus a CI static grep for any new `AssessmentDisplay`-like renderer without the banner import. (2) The `LAUNCH_OVERRIDE_TOKEN` value is a rotation secret; it lives in Vercel's Production env only, never in the repo. Rotation log: v1 issued 2026-09-28; rotate on the earlier of (a) any team change, (b) twelve months, or (c) the day a `validated: true` config ships. The Neon free-tier PITR gap is a related but distinct concern, documented in `docs/LAUNCH_CHECKLIST.md`.
Source: `phases/phase-09-hardening-and-launch.md`; `00-product-freeze-reference.md` thesis; ARCH-032.

---

## Addenda

### 2026-09-30 — Phase 9 implementation addendum

*Appended by the Phase 9 implementation session. This is an additive
elaboration of the Consequences section above, not a rewrite. The original
text stands unchanged.*

**The `LAUNCH_OVERRIDE_TOKEN` mechanism, concretely:**

- **Presence is the override.** The build-time check
  (`apps/web/scripts/launch-gate.ts`) has no incoming request, so there is
  nothing to compare the token against. `LAUNCH_OVERRIDE_TOKEN` present +
  structurally valid + `VERCEL_ENV === 'production'` bypasses the
  assertion. The token value is never echoed to logs.

- **Structural validation** is a misconfiguration guard, not a security
  boundary: non-empty, base64-alphabet, base64-decodable, decoded length
  ≥ 32 bytes. A truncated paste or a stray whitespace character fails
  validation and falls through to the assert rather than silently
  bypassing the gate.

- **Enforcement runs in two places:**
  1. **Vercel's build.** `apps/web/package.json`'s `build` script chains
     `check:provisional-banner && launch-gate && next build`. This is the
     load-bearing enforcement — a CI-only check would be bypassable via
     Vercel's "Deploy" button or a manual trigger.
  2. **GitHub Actions** (`.github/workflows/ci.yml`), as a sanity step that
     the script runs and no-ops outside production. A broken gate script
     fails CI rather than only failing at Vercel deploy time.

  **Explicit chaining, not an npm `prebuild` hook.** Turbo does not
  reliably invoke npm lifecycle hooks like `prebuild`; explicit `&&`
  chaining in the `build` script is deterministic and readable in the
  Vercel build log.

- **The rehearsal** (`.github/workflows/launch-gate-rehearsal.yml`,
  `workflow_dispatch` only) runs the exact command Vercel's build runs,
  twice: once with `VERCEL_ENV=production` and no token (expected: fail),
  once with a freshly-generated throwaway token (expected: pass). Both
  runs must behave as expected for the rehearsal to pass. Record the
  workflow run URL in the Phase 9 close-out notes as evidence the phase
  file's acceptance criterion was met.

- **The `[launch-gate]` log marker.** Every path prints exactly one line
  beginning with the literal marker `[launch-gate]`. Searching Vercel's
  build logs for that marker surfaces every production deploy, categorised
  as bypassed, asserted-and-failed, or (future-state) asserted-and-passed.
  The rotation log below cross-references each bypass. Do not paraphrase
  or rename the marker.

- **The `timingSafeEqual` pattern** applies to a future *request-based*
  token check. There is no request-based check at MVP — the token is a
  build-time env var only. If one is ever added, it MUST use
  `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` on equal-length
  buffers, and it MUST NOT reuse `LAUNCH_OVERRIDE_TOKEN` for any purpose
  other than the build-time bypass.

**The provisional-thresholds banner, concretely:**

- **Mount point:** `apps/web/components/assessment/AssessmentDisplay.tsx`
  is the only component permitted to render an `AssessmentResult`
  directly. It mounts `<ProvisionalBanner />` at the top of both the
  validated and the unvalidated branch. Every other consumer (Review,
  Builder, Coach panel, History) either delegates to `AssessmentDisplay`
  or is a types-only file that does not render.

- **The banner's condition** is a property of the *configuration*, not of
  any individual assessment. `useProvisionalBanner()`
  (`apps/web/src/lib/provisionalBanner.ts`) reads
  `HYPERTROPHY_CONFIG.validated !== true` and returns `true`
  unconditionally at MVP. The day a validated config ships, the hook
  returns `false` and the banner disappears from every surface at once —
  the intended expiration of this decision.

- **The CI grep** is `apps/web/scripts/check-provisional-banner.sh`,
  invoked in `apps/web/package.json`'s `build` script (so it runs inside
  Vercel's build) and available as
  `pnpm --filter web run check:provisional-banner` for a standalone run.
  It fails any `.tsx` file under `apps/web/` (excluding `e2e/`) that
  mentions `AssessmentResult` or `FitScoreResult` without either being the
  allow-listed `AssessmentDisplay.tsx` or importing `AssessmentDisplay`.
  False positives are a two-second code review; false negatives are a
  user-visible regression — the check errs toward strictness on purpose.

- **The banner is non-dismissable.** Not a toast, not a collapsible
  callout. A dismissible disclaimer would be dismissed.

**Rotation log:**

- **v1** issued 2026-09-28 (per the original decision entry's
  Consequences).
- *(append further rotations here as they occur — see
  `docs/LAUNCH_CHECKLIST.md` §6b for the procedure)*