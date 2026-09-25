/**
 * @training/ai — AI Coach orchestration, tool handlers, model provider.
 *
 * Phase 0/1: wired placeholder only. No orchestration logic yet.
 *
 * Standing, load-bearing constraint (ARCH-011 in DECISIONS.md):
 * This package must NEVER have an import path to the function that commits
 * a new ProgramVersion. That function lives exclusively in packages/api.
 * Giving this package any import toward a mutating commit function is a
 * direct violation of ARCH-011, not a future enhancement.
 */

import type { ProgramStructure } from "@training/domain";

/** Version marker used by the trivial pipeline test. */
export const AI_PACKAGE_VERSION = "0.0.0" as const;

/**
 * Type-only reference to @training/domain. Proves the workspace dependency
 * graph resolves at compile time without requiring a runtime export from
 * @training/domain (which now exports types only).
 */
export type AiDomainBridge = ProgramStructure;