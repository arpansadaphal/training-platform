// packages/domain/src/assessment/launchGate.ts
//
// Launch gate — the pure function that Phase 9 will wire into CI to fail a
// production-flagged build if any registered goal profile is still
// `validated: false`.
//
// Phase 3 delivers the function and its tests. It does NOT touch
// .github/workflows/ci.yml — the phase file and the Q6 resolution both say
// the CI wiring is Phase 9's, when there is a production build to gate. Adding
// a dead CI step now would create noise and hide the actual Phase-9 wiring.
//
// Design: environment is a plain string parameter, not an import from
// @training/config. That keeps this function pure, testable with four
// literal inputs, and free of any dependency on the config package — which
// matters because `packages/domain` must have zero non-domain imports
// (ARCH-010, 02-system-architecture.md's three-layer rule).

import type { GoalProfileRegistry } from "../goal-profiles/types";

/**
 * The single environment string this gate treats as "about to ship to real
 * users." Every other value — "development", "test", "preview", "staging",
 * whatever a future deployment uses — passes unconditionally. Naming it as a
 * const (not a magic string scattered across the codebase) so the Phase-9 CI
 * wiring can import it rather than re-typing "production".
 */
export const PRODUCTION_ENV = "production";

/**
 * Throws if `env === PRODUCTION_ENV` and any profile in `registry` has
 * `validated: false`. No-op for every other environment.
 *
 * The error message names every unvalidated profile key and points at the
 * phase doc — so a failing CI run tells a new contributor exactly what to
 * read, without needing to grep.
 */
export function assertNoUnvalidatedProfilesInProduction(
  env: string,
  registry: GoalProfileRegistry,
): void {
  if (env !== PRODUCTION_ENV) return;

  const unvalidated = registry
    .list()
    .filter((profile) => !profile.loadConfig().validated);

  if (unvalidated.length === 0) return;

  const keys = unvalidated.map((p) => p.key).join(", ");
  throw new Error(
    `Launch gate failed: ${unvalidated.length} goal profile(s) are not ` +
      `validated (validated: false) but would ship to production: ${keys}. ` +
      `A profile must be signed off by sports science before its ` +
      `\`validated\` flag is flipped. See phases/phase-03-assessment-engine.md ` +
      `and ARCH-029.`,
  );
}