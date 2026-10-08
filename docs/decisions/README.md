# Decision Register

Per-entry decision files. Split from a single `DECISIONS.md` on 2026-09-27
to prevent the recurring truncation losses that had occurred six times
across Phases 1–7.

## Format

Each file is one entry, named `ARCH-NNN.md`. **Append-only:** adding a
decision means creating a new file. Do not edit existing entries; if one
is wrong, create a new dated entry that explicitly supersedes it.

## Addenda

Entries in this register are append-only (see Format above). When a Phase
implementation needs to *elaborate* on an existing decision without
changing its substance — e.g., Phase 9 documenting the concrete
`LAUNCH_OVERRIDE_TOKEN` mechanism that ARCH-046 named abstractly — the
elaboration is appended to the original entry under a clearly-marked
`## Addenda` heading, dated, and prefixed with a one-line note that the
original text stands unchanged.

An addendum is **not** a supersession. If the substance of a decision
changes, that is a new `ARCH-NNN` entry that explicitly supersedes the old
one — it is not an addendum. The distinction:

- **Addendum:** the decision still holds; new detail about its mechanism
  or consequences is now known. Attach to the original entry.
- **Supersession:** the decision itself is replaced. Create a new entry,
  reference the old one, and stop treating the old entry as current.

An auditor reading an entry with an addendum sees the original text plus a
dated elaboration — never a silent rewrite. This is why the addendum
mechanism exists separately from the append-only rule: it is the
sanctioned way to add operational detail to a decision that remains in
force.

## Entries

- [ARCH-001](./ARCH-001.md) — TypeScript across the entire stack
- [ARCH-002](./ARCH-002.md) — pnpm workspaces + Turborepo monorepo
- [ARCH-003](./ARCH-003.md) — Next.js hosts both the web UI and the tRPC API at MVP
- [ARCH-004](./ARCH-004.md) — tRPC over REST or GraphQL
- [ARCH-005](./ARCH-005.md) — PostgreSQL + Prisma
- [ARCH-006](./ARCH-006.md) — Auth.js with JWT session strategy
- [ARCH-007](./ARCH-007.md) — Anthropic Claude as default model provider, behind `ModelProvider`
- [ARCH-008](./ARCH-008.md) — Vitest + Playwright
- [ARCH-009](./ARCH-009.md) — Vercel + Neon + Sentry hosting
- [ARCH-010](./ARCH-010.md) — Three-layer split: domain (pure) / db (persistence) / api+ai (orchestration)
- [ARCH-011](./ARCH-011.md) — `packages/ai` has no import path to the program-commit function
- [ARCH-012](./ARCH-012.md) — ProgramVersion stores both a canonical `structureSnapshot` and normalized rows
- [ARCH-013](./ARCH-013.md) — `Goal` modeled as its own entity referencing `GoalProfileDefinition`
- [ARCH-014](./ARCH-014.md) — `ProgramDraft` is many-per-Program, not one
- [ARCH-015](./ARCH-015.md) — AssessmentSnapshot persisted at Commit and Block-End; Review reads the snapshot, not a live recompute, by default
- [ARCH-016](./ARCH-016.md) — TrainingBlock lifecycle is fully automatic
- [ARCH-017](./ARCH-017.md) — `Program.visibility` column added at Phase 1; `ProgramShare` table and all sharing logic deferred to Phase 10
- [ARCH-018](./ARCH-018.md) — AI "apply" is implemented as a client-only mutating endpoint the model cannot call, not a model-facing `apply` tool
- [ARCH-019](./ARCH-019.md) — Jev / System One (TypeSafe AI) evaluated, not adopted for MVP or V1
- [ARCH-020](./ARCH-020.md) — Auth.js Phase 0 configuration: Credentials-only, JWT, no database adapter; bcryptjs for password hashing
- [ARCH-021](./ARCH-021.md) — Next.js upgraded to 15.5.18 for the security patch flagged by Vercel; React moved to 19.0.0 stable; Turbo env var declarations added
- [ARCH-022](./ARCH-022.md) — Prisma on Vercel requires `binaryTargets = ["native", "rhel-openssl-3.0.x"]` AND `@prisma/nextjs-monorepo-workaround-plugin` in `apps/web`
- [ARCH-023](./ARCH-023.md) — Sentry error delivery on Vercel requires explicit `Sentry.captureException` + `await Sentry.flush()` in route handlers; automatic capture via Next's `onRequestError` is unreliable in Next 15.4+
- [ARCH-024](./ARCH-024.md) — Phase 1 reconciles `User` with Phase 0: `name` → `displayName` (required), `passwordHash` made nullable, `updatedAt` retained
- [ARCH-025](./ARCH-025.md) — Turbo env vars declared via `globalEnv` at the config root, not per-task `env` arrays
- [ARCH-026](./ARCH-026.md) — Repository `$transaction` calls pass explicit `{ timeout: 20000, maxWait: 10000 }` via a shared `TRANSACTION_OPTIONS` const
- [ARCH-027](./ARCH-027.md) — CI runs against an ephemeral `postgres:16` service container with `prisma migrate deploy` + seed, not against a remote Neon branch
- [ARCH-028](./ARCH-028.md) — Analysis axis status is a discriminated union (`BAND` | `UNVALIDATED`), not a bare string; unvalidated axes are compile-time unrenderable as banded
- [ARCH-029](./ARCH-029.md) — Assessment severity is per-axis-status; weight enters only at the leverage lookup; the leverage table is strictly 2-D (Severity × Weight)
- [ARCH-030](./ARCH-030.md) — Assessment-layer result shapes and Fit Score derivation: discriminated unions, an explicit allAssessedAxes roll-up, and rule-based ordinal projection (no numeric intermediate)
- [ARCH-031](./ARCH-031.md) — Config-surface extensions for Phase 3: categorical `AxisWeight.weight`, axis-level fallback keys, and `materialitySeverityThreshold`
- [ARCH-032](./ARCH-032.md) — Phase 4 UI E2E acceptance criterion rewritten: asserts the unvalidated Assessment state, not "Biggest Opportunity"
- [ARCH-033](./ARCH-033.md) — `CommitOrigin` extended with `draftId` so commit + draft-status-flip are atomic
- [ARCH-034](./ARCH-034.md) — All three `.env` files must point at the same database; drift produces silent dev-loop breakage
- [ARCH-035](./ARCH-035.md) — Phase 5's phase-file scope is authoritative; PROJECT_STATE.md's earlier "pure-only" summary was wrong
- [ARCH-036](./ARCH-036.md) — `SimulationResult` is a discriminated union (`COMPUTED` | `CANNOT_COMPUTE` | `INVALID_MUTATION`), and `CANNOT_COMPUTE` carries both analyses and both assessments
- [ARCH-037](./ARCH-037.md) — `WhatChangedResult` and `StructureDiffEntry` are two distinct types for two distinct consumers
- [ARCH-038](./ARCH-038.md) — Simulation "applied" status is derived from `Revision.sourceSimulationId`, never stored as a column
- [ARCH-039](./ARCH-039.md) — A successful `commitFromMutation` runs the same TrainingBlock close + open sequence as `activateVersion`; all three lifecycle triggers apply the same COMPLETED / ABANDONED resolution rule and read inside their own transaction
- [ARCH-040](./ARCH-040.md) — Phase 6 error-code semantics: ownership/existence failures are NOT_FOUND; state failures on authorized, present entities are PRECONDITION_FAILED; shape/membership violations are BAD_REQUEST
- [ARCH-041](./ARCH-041.md) — BLOCK_END AssessmentSnapshot writing deferred to Phase 9+
- [ARCH-042](./ARCH-042.md) — Grounding failures: bounded regeneration then structured partial
- [ARCH-043](./ARCH-043.md) — `AIMessageSegment` is a discriminated union; the model's output schema is a strict subset
- [ARCH-044](./ARCH-044.md) — Coach router adds `openConversation` and `openConversationForBlock`
- [ARCH-045](./ARCH-045.md) — Google Gemini added as a second ModelProvider, selected by `MODEL_PROVIDER`
- [ARCH-046](./ARCH-046.md) — MVP launch proceeds with `validated === false`; CI gate bypassed via documented `LAUNCH_OVERRIDE_TOKEN`; provisional-thresholds banner on every Assessment surface
- [ARCH-047](./ARCH-047.md) — `coach.openConversation` auto-scopes to the user's primary Program; `forceNew` bypasses get-or-create
- [ARCH-048](./ARCH-048.md) — Edge rate limiting via Upstash Redis, sliding window, hybrid key
- [ARCH-050](./ARCH-050.md) — E2E (Playwright) runs in CI, whole `e2e/` directory, 
MODEL_PROVIDER=mock
- [ARCH-051](./ARCH-051.md) — HYPERTROPHY candidate configuration, reference-data scoping, and seed convention