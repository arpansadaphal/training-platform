
// apps/web/scripts/launch-gate.ts
//
// The launch gate, run in two contexts:
//
//   1. As a step in `pnpm run build` (see apps/web/package.json). Vercel
//      invokes `pnpm turbo run build` for a production deploy; that chains
//      through this script before `next build`. This is the load-bearing
//      enforcement point — a CI-only check is bypassable via Vercel's
//      "Deploy" button or a manual trigger.
//
//   2. As a standalone step in .github/workflows/ci.yml, as a sanity check
//      that the script actually runs (it no-ops outside production).
//
// The gate's rule (ARCH-046):
//   - VERCEL_ENV !== 'production'  → no-op.
//   - VERCEL_ENV === 'production' AND LAUNCH_OVERRIDE_TOKEN is present and
//     structurally valid → bypass, log a [launch-gate] line naming the
//     bypass.
//   - VERCEL_ENV === 'production' AND no valid token → run
//     assertNoUnvalidatedProfilesInProduction, which throws if any
//     registered profile has validated: false. HYPERTROPHY is unvalidated
//     at MVP, so this throws by design until the token is set or a
//     validated profile ships.
//
// Structural validation of LAUNCH_OVERRIDE_TOKEN (per the Phase 9 ruling):
//   - Present (not undefined, not empty string)
//   - Matches the base64 alphabet with optional trailing padding
//   - Base64-decodes without error
//   - Decoded length >= 32 bytes
//
// This is a BUILD-TIME check — there is no incoming request, so there is
// nothing to compare the token against. "Presence is the override." If a
// future phase introduces a request-based token check (there is none at
// MVP), that check MUST use crypto.timingSafeEqual on equal-length
// Buffers. Documented in ARCH-046's Consequences.
//
// Every path prints a line prefixed with the literal marker [launch-gate].
// An auditor searching Vercel's build logs for [launch-gate] sees every
// override across every production deploy. The rotation log in
// ARCH-046.md cross-references each.

import {
  PRODUCTION_ENV,
  assertNoUnvalidatedProfilesInProduction,
  goalProfileRegistry,
} from "@training/domain";

const MARKER = "[launch-gate]";

function logOutsideProduction(env: string): void {
  console.log(
    `${MARKER} VERCEL_ENV=${env || "(unset)"}. Gate is a no-op outside production.`,
  );
}

function logBypass(): void {
  console.log(
    `${MARKER} VERCEL_ENV=production, LAUNCH_OVERRIDE_TOKEN present (validation passed). Bypassing.`,
  );
}

function logAsserting(): void {
  console.log(
    `${MARKER} VERCEL_ENV=production, no valid LAUNCH_OVERRIDE_TOKEN. Asserting.`,
  );
}

function logPass(): void {
  console.log(
    `${MARKER} PASS — every registered goal profile is validated for production.`,
  );
}

function logWarnInvalidToken(reason: string): void {
  console.warn(
    `${MARKER} LAUNCH_OVERRIDE_TOKEN present but failed validation: ${reason}. Falling through to assert.`,
  );
}

function logFail(message: string): void {
  console.error(`${MARKER} FAIL ${message}`);
}

/**
 * Structural validation of the token value. Returns { ok: true } when the
 * token is present, base64-shaped, base64-decodable, and ≥32 bytes decoded.
 *
 * These checks are not a security boundary (there is no adversary — a
 * Vercel Production env var is already trusted). They are a
 * misconfiguration guard: a truncated paste, a stray whitespace character,
 * or a value that isn't actually 32 random bytes gets caught here rather
 * than silently bypassing the gate.
 */
function validateToken(
  token: string | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (token === undefined) return { ok: false, reason: "not set" };
  if (token.length === 0) return { ok: false, reason: "empty" };

  // Base64 alphabet with optional trailing padding. Matches `openssl rand
  // -base64 32`'s output shape (44 chars, +/= alphabet, ends with `=`).
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(token)) {
    return { ok: false, reason: "not base64-shaped" };
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(token, "base64");
  } catch {
    return { ok: false, reason: "base64 decode failed" };
  }

  if (decoded.length < 32) {
    return {
      ok: false,
      reason: `decoded length ${decoded.length} < 32 bytes`,
    };
  }

  return { ok: true };
}

function main(): void {
  const env = process.env.VERCEL_ENV ?? "";

  if (env !== PRODUCTION_ENV) {
    logOutsideProduction(env);
    return;
  }

  const token = process.env.LAUNCH_OVERRIDE_TOKEN;
  const validation = validateToken(token);

  if (validation.ok) {
    logBypass();
    return;
  }

  // A token is present but structurally invalid. Log the reason at warn
  // level (not a hard fail — falling through to the assert produces the
  // correct outcome anyway), then continue to the assertion.
  if (token !== undefined) {
    logWarnInvalidToken(validation.reason);
  }

  logAsserting();

  try {
    assertNoUnvalidatedProfilesInProduction(env, goalProfileRegistry);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logFail(message);
    process.exit(1);
  }

  logPass();
}

main();