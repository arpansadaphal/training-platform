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
//   - Present (not undefined, not empty string after trimming)
//   - Matches the base64 alphabet with optional trailing padding
//   - Base64-decodes to ≥32 bytes
//
// The value is TRIMMED before validation. Vercel's env-var UI routinely
// captures a trailing newline when a value is pasted from a terminal; the
// trim makes the check robust against that. A warning is logged when the
// trim removes characters, so the operator knows to fix the paste.
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

function logWarnTrimmed(n: number): void {
  console.warn(
    `${MARKER} LAUNCH_OVERRIDE_TOKEN had ${n} char(s) of surrounding whitespace; trimmed before validation. Fix the paste in Vercel when convenient.`,
  );
}

function logFail(message: string): void {
  console.error(`${MARKER} FAIL ${message}`);
}

/**
 * Structural validation of the token value.
 *
 * Returns { ok: true, value } where `value` is the trimmed token, or
 * { ok: false, reason } describing the first structural problem found.
 *
 * These checks are not a security boundary (there is no adversary — a
 * Vercel Production env var is already trusted). They are a
 * misconfiguration guard: a truncated paste, a stray whitespace character,
 * or a value that isn't actually 32 random bytes gets caught here rather
 * than silently bypassing the gate.
 */
function validateToken(
  rawToken: string | undefined,
): { ok: true; value: string } | { ok: false; reason: string } {
  if (rawToken === undefined) return { ok: false, reason: "not set" };

  // Vercel's env-var UI (and terminal copies) routinely carry a trailing
  // newline or a stray space. Base64 has no meaningful leading/trailing
  // whitespace, so trimming is safe and prevents a misconfiguration guard
  // from being defeated by invisible characters.
  const token = rawToken.trim();
  if (token.length === 0) return { ok: false, reason: "empty after trim" };

  // Standard and URL-safe base64 alphabets, with optional trailing padding.
  // `openssl rand -base64 32` produces standard base64 (+, /, =); the
  // URL-safe variant (-, _) is accepted for callers who generated the
  // token with a base64url tool.
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(token)) {
    // Diagnose: length + the first character outside the base64 alphabet,
    // rendered as a hex code point. Without this, a mismatch is silent
    // beyond "not base64-shaped" and requires a redeploy cycle to debug.
    const badIdx = [...token].findIndex((c) => !/[A-Za-z0-9+/_=-]/.test(c));
    const badChar = badIdx >= 0 ? token[badIdx] : undefined;
    const badCode =
      badChar !== undefined
        ? `U+${badChar.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "?"}`
        : "?";
    return {
      ok: false,
      reason: `not base64-shaped (length ${token.length}, first out-of-alphabet char at index ${badIdx}: ${badCode})`,
    };
  }

  // Base64-decoded length must be ≥32 bytes. Buffer.from with 'base64'
  // does not throw on invalid input; it produces a best-effort decode and
  // truncates at the first invalid sequence. The alphabet check above
  // already filtered structural garbage; this is the length guard.
  const decoded = Buffer.from(token, "base64");
  if (decoded.length < 32) {
    return {
      ok: false,
      reason: `decoded length ${decoded.length} < 32 bytes`,
    };
  }

  return { ok: true, value: token };
}

function main(): void {
  const env = process.env.VERCEL_ENV ?? "";

  if (env !== PRODUCTION_ENV) {
    logOutsideProduction(env);
    return;
  }

  const rawToken = process.env.LAUNCH_OVERRIDE_TOKEN;
  const validation = validateToken(rawToken);

  if (validation.ok) {
    // Warn if the trim removed characters — the operator should fix the
    // paste, but the value passed and the deploy proceeds.
    if (rawToken !== undefined && rawToken.length !== validation.value.length) {
      logWarnTrimmed(rawToken.length - validation.value.length);
    }
    logBypass();
    return;
  }

  // A token is present but structurally invalid. Log the reason at warn
  // level (not a hard fail — falling through to the assert produces the
  // correct outcome anyway), then continue to the assertion.
  if (rawToken !== undefined) {
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