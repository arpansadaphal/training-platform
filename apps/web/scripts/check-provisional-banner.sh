
#!/usr/bin/env bash
#
# apps/web/scripts/check-provisional-banner.sh
#
# Enforces ARCH-046's banner guarantee: every component that renders an
# AssessmentResult or FitScoreResult must go through AssessmentDisplay,
# which is the single mount point for the provisional-thresholds banner.
# A new component that pulls the raw types and renders them directly would
# show an assessment without the "not yet scientifically validated"
# disclaimer — exactly the failure mode ARCH-046 names.
#
# The check is deliberately coarse: any .tsx file under apps/web/
# (excluding node_modules, .next, and e2e/) that mentions
# `AssessmentResult` or `FitScoreResult` must either be the
# AssessmentDisplay component itself, or import AssessmentDisplay. A false
# positive is a two-second code review; a false negative is a user-visible
# regression. Erring toward strictness is the point.
#
# Runs from apps/web (the package.json script's CWD). Exits non-zero on
# any violation, with a GitHub Actions `::error file=...` annotation so
# the failure lands on the offending file in the PR view.

set -euo pipefail

cd "$(dirname "$0")/.."   # now in apps/web

# The AssessmentDisplay component mounts the banner; it is the one file
# allowed to consume the raw types directly. Any other file that consumes
# them must delegate.
ALLOWLIST=(
  "components/assessment/AssessmentDisplay.tsx"
)

is_allowlisted() {
  local candidate="$1"
  local allowed
  for allowed in "${ALLOWLIST[@]}"; do
    if [[ "$candidate" == "$allowed" ]]; then
      return 0
    fi
  done
  return 1
}

# Build the candidate file list. Prefer git (respects .gitignore, fast);
# fall back to find for tarball / CI environments without a git checkout.
# bash 3.2 compatible — no mapfile, no associative arrays.
collect_candidates() {
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git ls-files -- '*.tsx' | grep -v '^e2e/' || true
  else
    find . -type f -name '*.tsx' \
      -not -path './node_modules/*' \
      -not -path './.next/*' \
      -not -path './e2e/*' \
      | sed 's|^\./||' \
      || true
  fi
}

FAIL=0
SCANNED=0
while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  # Skip files that don't reference either guarded type.
  grep -qE '\b(AssessmentResult|FitScoreResult)\b' "$file" 2>/dev/null || continue
  SCANNED=$((SCANNED + 1))

  is_allowlisted "$file" && continue

  # Delegation check: does the file import AssessmentDisplay from anywhere?
  grep -qE "from ['\"][^'\"]*AssessmentDisplay['\"]" "$file" && continue

  echo "::error file=apps/web/$file::Mentions AssessmentResult or FitScoreResult but does not delegate to AssessmentDisplay. Every assessment renderer must go through AssessmentDisplay so the provisional-thresholds banner (ARCH-046) is present."
  FAIL=1
done < <(collect_candidates)

if [[ $FAIL -ne 0 ]]; then
  echo "check:provisional-banner: FAILED"
  exit 1
fi

echo "check:provisional-banner: PASS ($SCANNED file(s) reference the guarded types; all delegate or are allow-listed)."