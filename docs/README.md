# Training Platform — Implementation Architecture

This is the implementation architecture and phased development plan for the product described in the **Final Frozen Product & Architecture Specification**. It is a clean-slate technical plan — no existing repository, prototype, or prior stack was assumed. It does not redesign the product; where it makes an engineering decision the product spec left implicit (a handful, each logged in `DECISIONS.md`), that's flagged explicitly rather than folded in silently.

**Start here if you're a human:** read `00-product-freeze-reference.md`, then `01-architecture-recommendation.md`, then skim `17-roadmap-overview.md`.

**Start here if you're an AI implementing a phase:** read `PROJECT_STATE.md` to see what's already built, then the specific `phases/phase-NN-*.md` file you've been assigned, using `HANDOFF_TEMPLATE.md`'s structure if you're constructing the handoff packet yourself. You should not need to read this entire set to implement one phase.

## Map: brief section → file

| Requested | File |
|---|---|
| Part A — Architecture Recommendation | `01-architecture-recommendation.md` |
| Part B — System Architecture | `02-system-architecture.md` |
| Part C — Domain Model | `03-domain-model.md` |
| Part D — Database Architecture | `04-database-schema.md` |
| Part E — Deterministic Intelligence Architecture | `05-analysis-engine.md`, `06-assessment-engine.md`, `07-versioning-and-simulation.md` |
| Part F — API Architecture | `09-api-architecture.md` |
| Part G — AI Coach Architecture | `10-ai-coach-architecture.md` |
| Part H — Web Architecture | `11-web-architecture.md` |
| Part I — Mobile Strategy | `12-mobile-strategy.md` |
| Part J — Testing / Security / Deployment | `13-testing-strategy.md`, `14-security-and-data-ownership.md`, `15-deployment.md` |
| Part K — Repository & Documentation Structure | `16-repository-structure.md` |
| Part L — Phased Implementation Roadmap | `17-roadmap-overview.md` |
| Part M — Phase Specifications | `phases/phase-00-foundation.md` … `phases/phase-10-optional-extensions.md` |
| Part N — AI Handoff System | `HANDOFF_TEMPLATE.md` |
| Part O — Living Project State | `PROJECT_STATE.md` |
| Part P — Decision Register | `DECISIONS.md` |
| Part Q — Final Architecture Sanity Check | `18-architecture-sanity-check.md` |
| *(not requested by letter, added per the brief's own doc-hierarchy example)* | `00-product-freeze-reference.md`, `08-training-execution-and-evidence.md` |
| *(added later — external technology due-diligence)* | `19-jev-integration-review.md`, plus an unauthorized candidate `phases/phase-11-jev-prototype-candidate.md` |

## Current status
**Nothing has been built yet.** `PROJECT_STATE.md` reflects a pre-Phase-0 state. Phase 0 (`phases/phase-00-foundation.md`) is the next and only actionable work item.

## The load-bearing decisions, if you only read one paragraph
TypeScript monorepo; Next.js hosts both the UI and the tRPC API at MVP; PostgreSQL via Prisma; a framework-free `packages/domain` holding every business rule (Analysis, Assessment, Mutation, Simulation) as pure, fixture-testable functions; and a hard architectural rule — not a prompted one — that `packages/ai` has no code path capable of committing a program change, only a human-clicked, client-triggered endpoint does. No scientific thresholds are invented anywhere in this set; every `[SCIENTIFIC INPUT REQUIRED]` item from the product spec is preserved as an explicit, `validated: false` configuration surface with a CI-enforced launch gate.

## Rules every future phase must follow
1. Do not reopen a `FROZEN` decision in `DECISIONS.md` silently — propose a new, dated entry that explicitly supersedes it instead.
2. Do not invent a numeric scientific threshold anywhere, ever — see `00-product-freeze-reference.md`'s "Unresolved items."
3. Do not build anything from Phase 10 or beyond while implementing Phases 0–9, and do not build anything beyond Phase 10 at all — see `17-roadmap-overview.md`'s "gates, not dates."
4. Update `PROJECT_STATE.md` and, if applicable, `DECISIONS.md` at the end of every phase, before ending that session.
5. Do not wire any external decision primitive (Jev or otherwise) into `packages/ai`'s live orchestration path — see `19-jev-integration-review.md` and `ARCH-019`; Phase 11 is a candidate, not an authorization.
