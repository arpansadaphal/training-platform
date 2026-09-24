/**
 * @training/ai — AI Coach orchestration, tool handlers, model provider.
 *
 * Phase 0 creates this package as a wired placeholder ONLY.
 *
 * Standing, load-bearing constraint (ARCH-011 in DECISIONS.md):
 * This package must NEVER have an import path to the function that commits
 * a new ProgramVersion. That function lives exclusively in packages/api.
 * Giving this package any import toward a mutating commit function is a
 * direct violation of ARCH-011, not a future enhancement.
 *
 * Nothing in Phase 0 exercises this package's future responsibilities.
 */

import { DOMAIN_PACKAGE_VERSION } from "@training/domain";

/** Version marker used by Phase 0's trivial pipeline test. */
export const AI_PACKAGE_VERSION = "0.0.0" as const;

/**
 * Referencing the domain package here proves the workspace dependency graph
 * is wired correctly. This is the only Phase 0 behavior in this file.
 */
export function domainVersionSeenFromAi(): string {
  return DOMAIN_PACKAGE_VERSION;
}