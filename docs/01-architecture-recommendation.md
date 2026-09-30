# 01 — Architecture Recommendation (PART A)

This is a clean-slate recommendation. No existing repository, prototype, or prior stack was inspected or assumed. Every decision below is justified against the product described in `00-product-freeze-reference.md`, not against precedent.

For each decision: **what**, **why it fits**, **alternatives considered and why not**, **what it preserves or constrains later**.

---

## 1. Language: TypeScript everywhere
**Recommend:** TypeScript across web, API, domain logic, and (later) mobile. No polyglot split.

**Why it fits:** The product's hardest problems (leverage roll-ups, mutation consistency, evidence tagging) are about *correctness of typed data flowing through many layers*, not numeric computation or ML. A single language lets the exact same `ProgramStructure`, `Analysis`, `Assessment`, and `MutationSpec` types flow from database → domain engine → API contract → web UI → (later) mobile UI, with the compiler catching drift between them.

**Alternatives considered:** A Python service for the analysis/assessment engine, on the theory that it's "sports science." Rejected — there is no statistics or ML at MVP; the engine is deterministic rule evaluation over structured data, which TypeScript expresses perfectly well, and splitting languages would double the tooling, testing, and deployment surface for a solo/small team while breaking type-sharing, which is one of the largest velocity wins available here.

**Preserves/constrains:** Nothing here blocks a future Python (or R) service if L3's "reviewed for statistical validity" work ever genuinely requires a stats/ML ecosystem — that would be a separate internal service behind its own API, not a rewrite of the core.

---

## 2. Monorepo tooling: pnpm workspaces + Turborepo
**Recommend:** pnpm workspaces for package management, Turborepo for task orchestration/caching.

**Why it fits:** Solo/small team, one deployable web app today, a second (mobile) client planned. A monorepo lets `apps/web` and the future `apps/mobile` share `packages/domain` and API contract types with zero publishing step.

**Alternatives considered:** *Nx* — more powerful (generators, dependency graph tooling, plugin ecosystem) but that power is aimed at large multi-team orgs; its executor/plugin model is more conceptual overhead than a solo team needs. *Separate repos per app* — rejected because it would force manual version-syncing of shared types between web, API, and future mobile, which is pure friction with no isolation benefit at this scale.

**Preserves/constrains:** Turborepo's remote caching pairs natively with Vercel deploys. If the team grows materially, migrating to Nx later is a tooling change, not an architecture change — package boundaries stay the same either way.

---

## 3. Web + API host: Next.js (App Router), hosting both UI and the tRPC API
**Recommend:** One Next.js application (`apps/web`) serves the product UI and hosts the API via Route Handlers at MVP. No separate backend service yet.

**Why it fits:** Explicitly optimizing for "low complexity + low cost + reliable production deployment" for a solo developer. One deployable app means one thing to build, deploy, monitor, and keep in sync. Next.js Route Handlers support streaming responses, which the AI Coach needs, so this isn't a capability compromise.

**Alternatives considered:** A standalone Fastify/NestJS API service deployed separately from the web frontend. Rejected *for now* — there is no current requirement to scale the API independently of the UI, and no other first-party consumer of the API at MVP. **The mitigation for this choice is structural, not aspirational**: the tRPC router tree lives in its own package (`packages/api`), imported by `apps/web`'s route handler rather than defined inside `apps/web`. If a standalone service is ever warranted, it is a ~20-line HTTP adapter around the same router package, not a rewrite. NestJS specifically was also considered as the framework for that hypothetical standalone service; rejected because its DI/decorator ceremony doesn't pay for itself at this scale and is measurably harder for many independent AI coding sessions to generate consistently than plain function-based tRPC procedures — worth naming explicitly since "AI-agent-friendly" is a stated quality bar for *this specific project*.

**Preserves/constrains:** Mobile (Expo) will call this same deployed Next.js app's `/api/trpc` endpoint — a very common, well-supported pattern. The real constraint to respect: Vercel serverless functions have execution-time/cold-start characteristics, so long-running work (AI Coach responses) must be designed as streaming, not long blocking calls (see `10-ai-coach-architecture.md`).

---

## 4. API layer: tRPC over REST or GraphQL
**Recommend:** tRPC, with Zod input validation, routers organized by domain capability (not UI pages).

**Why it fits:** Every first-party client is TypeScript (web now, Expo later). tRPC gives full end-to-end type inference from server procedure to client call with no codegen step — a large correctness and velocity win exactly matched to this stack, in a domain with many invariants worth having the compiler enforce.

**Alternatives considered:** *REST* (e.g., OpenAPI-documented routes) — would need either hand-maintained types on both ends or a codegen step; one more moving part for no current benefit, since there is no third-party API consumer at MVP/V1. *GraphQL* — its strengths (flexible client-driven queries, many possible shapes, federation) don't match a product with a small number of well-known screens and predictable data shapes; it would add a resolver/schema layer and N+1 management without buying anything back yet.

**Named limitation:** tRPC procedures aren't self-documenting to non-TypeScript consumers the way REST/OpenAPI is. If a genuine external integration partner (e.g., a future trainer-tool integration) ever needs API access, that's a bounded, well-scoped hand-port of a small subset of routers to a REST facade — not an architecture change, because routers are already organized exactly as REST resources would be (`program`, `programVersion`, `analysis`, `simulation`, etc.).

---

## 5. Database: PostgreSQL
**Recommend:** PostgreSQL, single primary instance at MVP.

**Why it fits:** The product is relentlessly relational — versioned entities, foreign keys everywhere, strong consistency requirements for the immutability/versioning invariants, and multi-row atomic transactions (commit a version + write a Revision + update the active pointer, as one unit). Explicitly requested by the brief itself.

**Alternatives considered:** A document store (e.g., Mongo) for `ProgramVersion` structures. Rejected — while a single version's structure is tree-shaped, the *relationships between* versions, revisions, training blocks, and users are exactly what a document store is weak at, and this product's core value (versioned history, review-vs-execution joins) lives in those relationships.

---

## 6. ORM: Prisma
**Recommend:** Prisma, with a strict rule that domain logic (`packages/domain`) never imports Prisma types — only `packages/db`'s repository functions do, translating Prisma rows to plain domain interfaces.

**Why it fits:** This domain's real complexity lives in business rules (the leverage roll-up, evidence tagging, mutation consistency) which deliberately live in pure TypeScript, *not* in SQL. Persistence needs are mostly straightforward CRUD plus a handful of aggregate reads. Prisma's schema-first ergonomics, strong migration tooling, Prisma Studio (useful for solo-dev data inspection), and very high representation in AI training data (useful given many independent AI coding sessions will touch this code) outweigh the alternative's advantages here.

**Alternatives considered:** *Drizzle* — more SQL-transparent, arguably better for very complex queries. This is a genuinely close call; Drizzle is a reasonable fallback if query complexity grows beyond what's comfortable in Prisma. Because `packages/domain` and `packages/api` never see Prisma types directly (only `packages/db`'s plain-TS return types), swapping ORMs later is isolated to one package. *Raw SQL / Kysely* — more manual work for no current need; revisit only if profiling demands it.

**Preserves/constrains:** The ORM choice is contained entirely inside `packages/db`. Nothing above it needs to change if this is ever revisited.

---

## 7. Auth: Auth.js (NextAuth v5), JWT session strategy, Prisma adapter
**Recommend:** Self-hosted Auth.js with a JWT (not database) session strategy.

**Why it fits:** Free, self-hosted, Prisma-native, no per-MAU cost for something as foundational as identity. Critically, a JWT session strategy is what makes a **future Expo/React Native client's bearer-token auth clean** without bolting on a second auth system later — the same signed token that a cookie carries on web can be carried as an `Authorization` header on mobile.

**Alternatives considered:** *Clerk* / *Auth0* — both excellent, meaningfully faster to wire up initially (prebuilt UI, hosted user management), but introduce per-MAU cost at scale and an external dependency for the single most foundational piece of user data. If the developer prioritizes speed-to-first-user over long-term cost/control, Clerk is a fully reasonable substitute — nothing else in this architecture depends on which provider issues the session, since every downstream layer only ever sees "the authenticated user id."

---

## 8. AI model provider: Anthropic Claude (Messages API, tool use), behind a `ModelProvider` interface
**Recommend:** Claude as the default provider, accessed only through a thin interface defined in `packages/ai` — never called directly from orchestration code.

**Why it fits:** The AI Coach's entire safety architecture depends on reliable structured tool-calling (simulate / lookup / note-constraint) and structured output (evidence-tagged response segments). This is a requirements-driven choice (needs strong tool use and structured output), not a vendor default. Pin the exact model string in environment configuration, not in code or in this document — model versions change on a much shorter cycle than this architecture should.

**Alternatives considered:** OpenAI or an open-weight model behind a hosted endpoint — both viable; the `ModelProvider` interface exists specifically so a swap is a contained, single-file change, not an architecture change. Provider choice is deliberately not treated as load-bearing.

---

## 9. Testing: Vitest (unit/integration) + Playwright (E2E)
**Recommend:** Vitest for `packages/domain`, `packages/db`, `packages/api` tests; Playwright for full browser flows.

**Why it fits:** Vitest has native TS/ESM support with minimal config and fast feedback loops — a real velocity factor for a solo developer running the deterministic-engine test suite constantly. Playwright over Cypress for better multi-browser support and a cleaner API for the kind of long, stateful flows this product has (build → analyze → commit → train → review).

**Alternatives considered:** Jest — mature and capable, but slower and more config-heavy for a TS/ESM-first monorepo with no other reason to prefer it here.

---

## 10. Hosting: Vercel (web/API) + Neon (Postgres) + Sentry (errors)
**Recommend:** Vercel for `apps/web`, Neon for PostgreSQL, Sentry for error monitoring.

**Why it fits:** Vercel's zero-config Next.js deploys and preview environments are close to unbeatable for solo-dev velocity. Neon's branch-per-preview-deploy Postgres pairs specifically well with that: every PR gets an isolated database branch. Both have generous free/hobby tiers appropriate for pre-revenue development.

**Alternatives considered:** Render / Railway / Fly.io (all-in-one Node hosting + Postgres) — reasonable alternatives, better fit if the standalone-API-service path from decision #3 is taken early. Named as the fallback if Vercel's execution-time limits ever become a real constraint (see `15-deployment.md`).

**Named trade-off:** Vercel serverless functions are not suited to long blocking calls — this is why the AI Coach is designed around streaming responses from day one, not as a later optimization.

---

## Summary table

| Layer | Choice | Primary alternative rejected |
|---|---|---|
| Language | TypeScript | Python for the engine |
| Monorepo | pnpm + Turborepo | Nx |
| Web/API host | Next.js (App Router), full-stack | Standalone Fastify/NestJS service |
| API layer | tRPC + Zod | REST, GraphQL |
| Database | PostgreSQL | Document store |
| ORM | Prisma | Drizzle |
| Auth | Auth.js, JWT sessions | Clerk / Auth0 |
| AI provider | Claude, behind `ModelProvider` | Provider-agnostic from day one; no lock-in intended |
| Testing | Vitest + Playwright | Jest + Cypress |
| Hosting | Vercel + Neon + Sentry | Render / Railway / Fly.io |

See `16-repository-structure.md` for how these map onto actual folders, and `02-system-architecture.md` for how the runtime pieces communicate.
