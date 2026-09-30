# 12 — Mobile Strategy (PART I)

Not built in the initial phases (see `17-roadmap-overview.md`). Defined here so the earlier architecture doesn't accidentally foreclose it.

## Recommendation: Expo (React Native), when it's time

**Why it fits:** Expo's managed workflow minimizes native-tooling overhead for a solo/small team, has mature support for the auth and networking patterns this architecture already uses, and — critically — is TypeScript/React, so it can consume `packages/domain`'s types and `packages/api`'s tRPC router types directly, with zero duplicated contract definitions.

**Alternatives considered:** A fully native (Swift/Kotlin) build — rejected outright for a solo team; doubles the engineering surface with no product requirement demanding native-only capability. Flutter — rejected because it would require either duplicating all shared types in Dart or maintaining a translation layer, discarding tRPC's core benefit.

## What ships first on mobile

**Train → Observe**, not a copy of the whole web app. This follows directly from the product's own retention model (Final Freeze §26): logging is the short-cycle retention anchor and needs to be fast and always-available; Build/Analyze/Review are lower-frequency, higher-attention activities that are perfectly well served by a larger screen. A first mobile release scoped to fast logging + Observation capture + a read-only view of the current Assessment delivers the highest-value slice for the lowest build cost.

## How it plugs into the existing architecture

- **API communication:** the same deployed Next.js app's `/api/trpc` endpoint (see `01-architecture-recommendation.md` decision #3) — no separate mobile API.
- **Auth:** this is the one place the Phase 0 auth decision (JWT session strategy, not database-cookie sessions) pays off directly — the mobile app authenticates once and carries a bearer token on the `Authorization` header for every tRPC call, rather than needing a second auth mechanism bolted on. This is why JWT sessions were chosen at Phase 0 even though mobile isn't built until much later.
- **Shared types:** `packages/domain` (pure, no React Native-incompatible dependencies) and `packages/api`'s router types import directly into `apps/mobile`, same as `apps/web`.
- **No shared UI package:** React Native and React DOM render fundamentally different primitives (`View`/`Text` vs. `div`/`span`). Per the explicit instruction not to build a shared UI package for theoretical reuse, web and mobile each own their own component layer; only *logic* (domain types, validation, the API client) is shared. This boundary is named explicitly in `16-repository-structure.md`.

## Offline behavior

Logging (the Train → Observe slice) is the one place offline resilience genuinely matters — a user mid-workout in a gym with poor signal should never lose a logged set. Recommended pattern: an optimistic local queue of pending `PerformanceRecord`/`Observation` writes (in-memory + a lightweight persisted queue, e.g., via Expo's SQLite or AsyncStorage — a mobile-native storage mechanism, not a web localStorage substitute), flushed to the server when connectivity returns, with a simple last-write-wins conflict policy (this data is append-only logging, not collaborative editing, so conflicts are rare and low-stakes). The Builder/Analyze/Coach flows are **not** designed for offline use — they require the deterministic engine's authoritative, server-side computation, consistent with the "server-side authority" principle in `14-security-and-data-ownership.md`.

## Notifications & background limitations

Anticipation cues (Final Freeze §26 — "3 sessions left in this block") are the only notification-worthy content this product has at MVP+; no streaks, no re-engagement nudges. When mobile is built, this is a local/scheduled notification driven by data already in `TrainingBlock`, not a new backend push-notification system.

## What this section deliberately does not do
It does not produce a mobile build plan with phases — mobile is out of scope for the current roadmap (`17-roadmap-overview.md`) and gets its own phase sequence once the web MVP has proven the core loop, per Final Freeze §30's gating philosophy (nothing here should be built on a calendar date).
