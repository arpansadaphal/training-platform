# 16 — Repository & Documentation Structure (PART K)

## Repository layout

```text
training-platform/
  apps/
    web/                    # Next.js 15 (App Router) — UI + hosts the tRPC API at MVP
      app/                  # routes, per 11-web-architecture.md
      src/
        server/             # Route Handler mounting packages/api's router
    mobile/                 # (not created until its own future phase — see 12-mobile-strategy.md)

  packages/
    domain/                 # PURE. Analysis, Assessment, Mutation, Simulation, Fit Score, Goal Profiles.
      src/
        analysis/
        assessment/
        mutation/
        goal-profiles/
        types.ts
    db/                     # Prisma schema, migrations, repository functions (Prisma <-> domain types)
      prisma/
        schema.prisma
        migrations/
      src/repositories/
    api/                    # tRPC routers + orchestration services. Imports domain + db.
      src/
        routers/
        services/
        context.ts
    ai/                     # Coach orchestration, tool handlers, model provider abstraction. Imports domain + db.
      src/
        tools/
        provider/
        context-builder.ts
    config/                 # env/secret loading, feature flags (e.g. L2_ENABLED)
      src/

  docs/                     # this documentation set

  turbo.json
  pnpm-workspace.yaml
  package.json
```

## Why five packages, not more, not fewer

- **`domain` is separate from `db`** because domain logic must be framework/persistence-free (Final Freeze §31) — this is not optional structure, it's the literal enforcement mechanism for "AI-agent-friendly, testable in isolation" and for the "framework-independent core" principle repeated throughout the source spec.
- **`api` is separate from `ai`** because the confirmation-boundary safety property in `10-ai-coach-architecture.md` depends on `ai` *not having access* to `api`'s mutating commit function. If they were one package, that guarantee would rely on internal discipline rather than package boundaries — a materially weaker guarantee.
- **`config` is small and deliberately thin** — environment loading and feature flags only, not a dumping ground for anything unclassified.

## What is deliberately NOT its own package

- **No `packages/types`.** Domain types live in `packages/domain` (colocated with the logic that produces/consumes them). `packages/domain` has no heavy runtime dependencies, so importing it purely for types from `apps/web` or a future `apps/mobile` is not a weight problem. A separate types-only package would be an extra layer with no real decoupling benefit here.
- **No `packages/validation`.** Zod schemas live where they're used: request validation in `packages/api`'s routers, domain-invariant validation in `packages/domain`'s mutation code. Splitting this out would be a package that exists for theoretical reuse rather than an actual current need.
- **No shared UI package.** Explicitly called out because it's the example the brief itself names: web and a future mobile app render fundamentally different primitives (DOM vs. React Native views) and are built at different times by different phases. Each owns its own component layer; only logic-level packages (`domain`, `api`'s contract types) are shared. Forcing a shared UI package now would mean designing for a mobile client that doesn't exist yet, guessing at constraints it will actually have.

## Documentation structure

```text
docs/
  README.md                              index + how to use this set
  00-product-freeze-reference.md
  01-architecture-recommendation.md      Part A
  02-system-architecture.md              Part B
  03-domain-model.md                     Part C
  04-database-schema.md                  Part D
  05-analysis-engine.md                  Part E (1/3)
  06-assessment-engine.md                Part E (2/3)
  07-versioning-and-simulation.md        Part E (3/3)
  08-training-execution-and-evidence.md
  09-api-architecture.md                 Part F
  10-ai-coach-architecture.md            Part G
  11-web-architecture.md                 Part H
  12-mobile-strategy.md                  Part I
  13-testing-strategy.md                 Part J (1/3)
  14-security-and-data-ownership.md      Part J (2/3)
  15-deployment.md                       Part J (3/3)
  16-repository-structure.md             Part K (this file)
  17-roadmap-overview.md                 Part L
  18-architecture-sanity-check.md        Part Q
  phases/
    phase-00-foundation.md ... phase-10-optional-extensions.md   Part M
  HANDOFF_TEMPLATE.md                    Part N
  PROJECT_STATE.md                       Part O — living document, updated every phase
  DECISIONS.md                           Part P — living document, appended every phase
```

Numbered files (`00`–`18`) are stable reference architecture — they should rarely change once a phase that depends on them has shipped, and any change to one should be logged in `DECISIONS.md`. `phases/*.md` are consumed once each, by whichever AI session implements that phase. `PROJECT_STATE.md` and `DECISIONS.md` are the only two files every session must read and update, regardless of which phase it's implementing — they are what make `docs/` navigable "without needing the previous conversations," per the brief's own stated goal.
