/**
 * @training/domain — PURE, framework-free business rules.
 *
 * Phase 0 creates this package as a wired placeholder ONLY.
 * Nothing in this file is a product rule. Per phase-00-foundation.md:
 * "packages/domain exists as an empty, wired placeholder only."
 *
 * Per 02-system-architecture.md's three-layer rule, nothing in this package
 * may import from packages/db, packages/api, packages/ai, Next.js, Prisma,
 * HTTP, or any framework. It is plain input -> plain output TypeScript.
 *
 * Phase 1 begins populating this package with real types.
 * Phase 2 begins populating it with the Analysis engine.
 */

/** Version marker used by Phase 0's trivial pipeline test. */
export const DOMAIN_PACKAGE_VERSION = "0.0.0" as const;