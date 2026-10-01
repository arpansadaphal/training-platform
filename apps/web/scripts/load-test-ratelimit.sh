apps/web/scripts/load-test-ratelimit.sh
#!/usr/bin/env bash
#
# apps/web/scripts/load-test-ratelimit.sh
#
# Verification for the phase file's acceptance criterion: "Rate limiting
# is verified to actually engage under a simple load test against
# coach.postMessage."
#
# This script fires N sequential requests at a running instance of the
# app and asserts the 429 boundary. It requires no credentials — it
# targets a tRPC endpoint that would return an auth error if it reached
# the application, but should never get that far once the limiter
# engages. The 401 (or 200, for a batched/subscription response) that
# appears before the boundary is fine; the assertion is on the 429.
#
# Not a Vitest or Playwright test, deliberately:
#
#   - Vitest cannot exercise middleware — it is a Next.js construct, not
#     a Node module.
#   - Playwright would need real Upstash credentials, and mocking Upstash
#     verifies the mock, not the limiter.
#
# Run manually:
#
#   # Local: bring up the app with Upstash credentials set in
#   # apps/web/.env.local, then in another terminal:
#   bash apps/web/scripts/load-test-ratelimit.sh http://localhost:3000
#
#   # Staging:
#   bash apps/web/scripts/load-test-ratelimit.sh https://<staging>.vercel.app
#
# Against a deployment behind Vercel Authentication (staging), pass the
# bypass cookie via RATE_LIMIT_TEST_COOKIE in the environment — without
# it, requests get redirected to the Vercel login before reaching the
# app's middleware.
#
# Exit codes:
#   0  PASS — the 429 boundary was at request (limit + 1)
#   1  FAIL — the limiter did not engage, or engaged at the wrong point
#   2  ERROR — the target was unreachable, or the arguments were wrong

set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "usage: $0 <base-url>" >&2
  echo "  example: $0 http://localhost:3000" >&2
  exit 2
fi

# Trim a trailing slash.
TARGET="${TARGET%/}"

CATEGORY="coach.postMessage"
EXPECTED_LIMIT=10
TOTAL_REQUESTS=15

echo "[rate-limit-test] Target: $TARGET"
echo "[rate-limit-test] Category: $CATEGORY (expected limit: $EXPECTED_LIMIT/min)"
echo "[rate-limit-test] Sending $TOTAL_REQUESTS sequential requests…"

# ── Reachability check ──────────────────────────────────────────────
# Hit the Auth.js session endpoint (unauthenticated → 200 with {}).
# Any HTTP response means the app is up; we do not inspect the status.
if ! curl -s -o /dev/null --max-time 5 "$TARGET/api/auth/session" 2>/dev/null; then
  echo "[rate-limit-test] ERROR: could not reach $TARGET" >&2
  exit 2
fi

# ── Optional bypass cookie ──────────────────────────────────────────
CURL_HEADERS=(-H "Content-Type: application/json")
if [[ -n "${RATE_LIMIT_TEST_COOKIE:-}" ]]; then
  CURL_HEADERS+=(-H "Cookie: $RATE_LIMIT_TEST_COOKIE")
fi

# ── Fire requests ───────────────────────────────────────────────────
# Sequential, 50ms apart: 15 requests complete in ~0.75s, well inside
# the 60-second window, so the boundary is exercised against a single
# window and the results are deterministic.
first_429=""
declare -a CODES=()

for i in $(seq 1 "$TOTAL_REQUESTS"); do
  code="$(curl -s -o /dev/null -w "%{http_code}" \
    "${CURL_HEADERS[@]}" \
    -X POST \
    -d '{}' \
    "$TARGET/api/trpc/$CATEGORY" || echo "000")"

  CODES+=("$code")
  printf '[rate-limit-test] %3d → %s\n' "$i" "$code"

  if [[ -z "$first_429" && "$code" == "429" ]]; then
    first_429="$i"
  fi

  sleep 0.05
done

# ── Assertion ───────────────────────────────────────────────────────
# The pre-429 status codes may vary. Batched tRPC responses are HTTP
# 200 with error payloads (batch items cannot share a single status);
# subscription responses are HTTP 200 streaming even on error; a
# single-op unauthenticated request is HTTP 401. The assertion is the
# 429 boundary, not the pre-limit status.
echo ""
if [[ -z "$first_429" ]]; then
  echo "[rate-limit-test] Result: FAIL (no 429 within $TOTAL_REQUESTS requests — limiter not engaging)" >&2
  echo "[rate-limit-test]   Check: is UPSTASH_REDIS_REST_URL / _TOKEN set on the target?" >&2
  echo "[rate-limit-test]   Check: did the middleware run? (search the app logs for [ratelimit])" >&2
  exit 1
fi

expected_first_429=$((EXPECTED_LIMIT + 1))
if [[ "$first_429" -ne "$expected_first_429" ]]; then
  echo "[rate-limit-test] Result: FAIL (first 429 at request $first_429, expected $expected_first_429)" >&2
  if [[ "$first_429" -lt "$expected_first_429" ]]; then
    echo "[rate-limit-test]   Limit engaged too early — check the policy table or a shared bucket (cookie vs IP)." >&2
  else
    echo "[rate-limit-test]   Limit engaged too late — check the policy table (limit not set as expected)." >&2
  fi
  exit 1
fi

# Every request at or after the boundary must be 429. A non-429 here
# indicates the limiter is flapping — likely a shared bucket with
# another concurrent client, or an Upstash failure falling open mid-run.
for ((i = expected_first_429 - 1; i < TOTAL_REQUESTS; i++)); do
  if [[ "${CODES[$i]}" != "429" ]]; then
    echo "[rate-limit-test] Result: FAIL (request $((i + 1)) is ${CODES[$i]}, expected 429 — limiter is flapping)" >&2
    exit 1
  fi
done

echo "[rate-limit-test] Result: PASS (first 429 at request $first_429; limit enforced after $EXPECTED_LIMIT)"