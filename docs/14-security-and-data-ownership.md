# 14 — Security & Data Ownership (PART J, part 2 of 3)

Scoped to MVP needs — no enterprise security theater, no foundational debt either.

## Authentication
Auth.js (NextAuth v5), JWT session strategy (see `01-architecture-recommendation.md` decision #7). Passwords hashed with a modern adaptive hash (argon2id or bcrypt with a sufficient cost factor) via Auth.js's credentials provider; OAuth providers can be added later without touching anything downstream, since every layer past the auth boundary only ever sees an authenticated `userId`.

## Authorization
Detailed per-router in `09-api-architecture.md`. The summary rule: **every procedure resolves `userId` server-side from the verified session token; nothing about identity is ever trusted from request body content.** This single rule is what makes the AI Coach's tool-level authorization safe (`10-ai-coach-architecture.md`) — the model literally cannot supply a `userId` that the server will honor.

## Data ownership & visibility
- **Private by default.** `Program.visibility` defaults to `PRIVATE`; nothing is visible to anyone but the owner unless a `ProgramShare` (Phase 10+) or `PUBLIC` visibility (gated further per `17-roadmap-overview.md`) explicitly grants it.
- **Structure/Analysis/Assessment vs. execution history are separate grants.** A share or public visibility exposes design (structure + Analysis + Assessment) by default; exposing `TrainingBlock`/`Session`/`Observation` data is a distinct, explicit opt-in (`canViewExecutionHistory` / `publicShowsExecutionHistory`) — per the Final Freeze §20's explicit instruction that "share a structure" and "share your actual results" are different asks with different trust bars.
- **Reference data (Exercise, MuscleGroup, GoalProfileDefinition)** is readable by any authenticated user and not user-owned.

## AI access boundaries
Covered fully in `10-ai-coach-architecture.md`; restated here as a security property: the AI Coach can only ever read the calling user's own data (server-injected `userId`, no cross-user tool exists), and can only mutate `Constraint`/`TemporaryConstraint` rows directly — program structure mutation requires a separate, human-triggered API call the model cannot make.

## API security
- **Rate limiting:** per-user, per-router-category limits (a stricter limit on `coach.postMessage`, given LLM call cost, than on ordinary CRUD) — implemented at the edge (Vercel's built-in rate limiting or a lightweight middleware) rather than a bespoke system. Not deeply engineered at MVP; flagged in `18-architecture-sanity-check.md` as an area intentionally left light, to be hardened based on real usage patterns rather than speculative load.
- **Input validation:** Zod on every procedure boundary (see `09-api-architecture.md`).
- **Secrets:** environment variables only, never committed; managed via Vercel's environment variable system per environment (see `15-deployment.md`).

## Sensitive data handling
- Passwords: hashed, never logged.
- AI conversation content: may contain health-adjacent detail (injury mentions, subjective wellbeing notes) — stored with the same access controls as the rest of a user's private data; no separate, more-permissive internal access path.
- No third-party analytics SDK ships raw conversation or training content off-platform at MVP; if analytics are added later, they operate on aggregated/anonymized events, not raw user content — named as a constraint on future decisions, not a currently-built system.

## Deletion & export
- **Account deletion:** a user-initiated deletion request cascades through owned data (Programs, Versions, TrainingBlocks, Constraints, AIConversations) rather than leaving orphaned rows; implemented as a background job (not a synchronous request) given the potential row count, logged for audit purposes distinct from ordinary user data.
- **Export:** a straightforward "export my data" job producing a structured JSON dump of the user's own Programs/Versions/TrainingBlocks/Observations — not built at MVP, but the data model's clean ownership boundaries (everything keyed to `userId` through a small number of join paths) make this a bounded feature to add later rather than an architecture change.

## What is explicitly not built at MVP
SSO/SAML, granular role-based permissions beyond owner/shared/public, a security audit log UI, IP-based access controls, a bug bounty program. None of these are named as future-blocking — they're simply not needed at this stage and would be premature infrastructure per the stated quality bar.
