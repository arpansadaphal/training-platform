docs/decisions/ARCH-049.md
### ARCH-049 — `coach.openConversation` accepts an explicit scope without verifying ownership; ownership check moved into `getOrCreateScopedConversation`
Date: 2026-09-30 | Status: FROZEN | Reversible: Yes, contained to `packages/api/src/services/coachConversationService.ts` and the `openConversation` procedure's call path
Discovery: Phase 9's authorization audit (the consolidated `authorization.test.ts`, covering every owner-scoped procedure) found that `coach.openConversation`'s explicit-scope path did not verify that the caller owned the `programId` / `programVersionId` they supplied.

Impact assessment: **Data-integrity issue, not a cross-user data leak.** An `AIConversation` created with a foreign `programId` is always readable only by its creator (every read path filters on `userId`), so the caller learns nothing about the other user's program. The observable failure mode was worse than a leak in one narrow sense — it was **silent and confusing**: the caller would end up with a Coach conversation scoped to a program the context builder refuses to load (`loadScopedProgramVersion` throws internally on the ownership mismatch, the context builder returns `null`, the Coach has no program context, and the user sees a Coach that "doesn't know about my program" with no diagnosable cause). The conversation row itself persisted successfully, so the user's sidebar would show a scoped conversation that never produced scoped output.

Root cause: `openConversation`'s router procedure passed `input.programId` and `input.programVersionId` straight through to `getOrCreateScopedConversation` without a check. `getOrCreateScopedConversation` did not check either. Every other program-scoped service call in the codebase (`createMyDraft`, `commitFromMutation`, `simulateAndPersist`, `archiveMyProgram`, `activateVersion`, `getOrCreateNext`, `createMyObservation` when block-scoped, `getReview`) calls `loadOwnedProgramOrThrow` first. `getOrCreateScopedConversation` was the one service that did not.

Decision: Add the ownership check to `getOrCreateScopedConversation`. When `scope.programId` is non-null, call `loadOwnedProgramOrThrow(userId, scope.programId)`. When `scope.programVersionId` is non-null and `scope.programId` is null (a shape the input schema permits but no current caller produces), resolve the version's parent program and check ownership on it. The scope-less path `(null, null)` is not checked — the router's auto-scope branch resolves it via `getPrimaryProgramId`, which returns an owned program id (or `null`).

The check is in the service, not the router, because:
  1. Both call sites (`openConversation`, `openConversationForBlock`) go through the service. A service-level check covers both.
  2. The service test (`authorization.test.ts`) exercises it via `getOrCreateScopedConversation` directly — a router-level check would require a tRPC caller harness the codebase does not have.
  3. It matches the established pattern: ownership checks live in services, and routers are thin.

`openConversationForBlock` retains its own router-level `loadOwnedProgramOrThrow` call. That call is now redundant (the service will check anyway) but harmless, and removing it would be churn in a procedure that is not otherwise changing.

Alternatives considered:
  (a) Add the check in the router only. Rejected — `openConversationForBlock` would need its own separate check, and the service tests would not exercise the check for the `openConversation` path.
  (b) Add the check in `createAIConversation` (the repository). Rejected — the repository's job is persistence, not policy; ownership rules belong in the service layer where `loadOwnedProgramOrThrow` already lives.
  (c) Widen `openConversation`'s schema to require a scope (no nullable). Rejected — the auto-scope path (ARCH-047) is intentional and the scope-less form is meaningful for users with no programs.
  (d) No fix — document the behaviour. Rejected — the audit finding is a real defect with a clear, bounded fix, and leaving it in place would mean the next code path that relies on `getOrCreateScopedConversation` inherits the same failure mode.

Consequence: `coachConversationService.ts` now imports `TRPCError` (from `@trpc/server`), `findVersionById` (added to the `@training/db` import list), and `loadOwnedProgramOrThrow` (from `./loadOwnedProgram`). No circular dependency — `loadOwnedProgram.ts` imports only from `@training/db`. A cross-user call to `coach.openConversation` with a foreign `programId` now returns `NOT_FOUND` (the router maps the service throw through, unchanged). The `openConversation` procedure's error semantics are unchanged from the caller's perspective: an unauthorized scope is `NOT_FOUND`, matching ARCH-040's non-disclosure rule. The previous behaviour (a conversation row silently created against a foreign program) is unreachable.

Source: Phase 9 authorization audit (`packages/api/src/services/authorization.test.ts`, describe block "coach"); `00-product-freeze-reference.md` invariant 11; `docs/14-security-and-data-ownership.md` ("every procedure resolves userId server-side…; nothing about identity is ever trusted from request body content"); ARCH-040; ARCH-047.

