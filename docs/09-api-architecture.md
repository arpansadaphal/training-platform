# 09 — API Architecture (PART F)

The API is organized around domain capabilities (matching `03-domain-model.md`), not UI pages. Implemented as tRPC routers in `packages/api/routers/`, each backed by a "service" module that does the actual orchestration (see `02-system-architecture.md`'s three-layer rule). Below, each area is described in request/response/authorization/error terms — deliberately framework-neutral, so the same description would translate to REST resources if that ever becomes necessary (see `01-architecture-recommendation.md` decision #4).

## Router map

| Router | Capability | Mutates? |
|---|---|---|
| `auth` | signup, login, session | Yes (account creation) |
| `user` | get/update own profile | Yes (profile only) |
| `goal` | list available GoalProfiles; get/set a Program's current Goal | Yes (Goal/Program link) |
| `exercise` | list/search canonical Exercise reference data | No |
| `program` | create, list-mine, get, rename, archive | Yes |
| `draft` | create/update/discard a ProgramDraft; list a Program's drafts | Yes |
| `analysis` | preview-analyze a Draft or arbitrary structure (live compute, not persisted) | No |
| `programVersion` | get by id; list versions for a Program; commit a Draft; commit from a Simulation | Yes (commit only) |
| `simulation` | simulate a mutation against a base version or draft | No (persists only the Simulation record itself, for later reference) |
| `revision` | list revision history for a Program | No |
| `training` | activate a version (opens a TrainingBlock); get current/past blocks | Yes (activate only) |
| `session` | get-or-create next Session; mark started/completed/skipped | Yes |
| `performance` | log PerformanceRecords for a Session (batch) | Yes |
| `observation` | create/list Observations | Yes |
| `review` | get aggregated ReviewData for a TrainingBlock | No |
| `constraint` | CRUD persistent Constraints | Yes |
| `coach` | post a message to an AIConversation (streaming); list conversations | Yes (conversation + low-risk constraint writes only — see below) |
| `sharing` | *(Phase 10 only)* create/list/revoke ProgramShares | Yes |

## Authorization pattern

Every procedure resolves the authenticated `userId` from the session (server-side, from the Auth.js JWT — never trusted from client-supplied input) before touching any service. Resource-level authorization then follows one rule per resource type:

- **Owner-scoped** (Program, ProgramDraft, ProgramVersion structure detail, TrainingBlock, Session, PerformanceRecord, Observation, Constraint, AIConversation): the resource's `ownerUserId` (or its ancestor Program's `ownerUserId`) must equal the caller's `userId`, unless a valid, unrevoked `ProgramShare` grants access (Phase 10+).
- **Shared-scoped** (once Phase 10 ships): a `ProgramShare` row for `(programId, recipientUserId=caller)` with no `revokedAt` grants read access to structure/Analysis/Assessment; `canViewExecutionHistory` additionally gates TrainingBlock/Session/Observation visibility for that recipient specifically.
- **Public-scoped** (Phase 10+, gated further per the roadmap): `Program.visibility === 'PUBLIC'` grants anonymous read access to structure/Analysis/Assessment; `publicShowsExecutionHistory` gates execution data the same way.
- **Reference data** (Exercise, MuscleGroup, GoalProfileDefinition): readable by any authenticated user, writable by nobody through this API at MVP (seeded/managed out of band — see `phases/phase-01-domain-and-database.md`).

## Contract conventions

- **Input validation:** every procedure's input is a Zod schema; invalid input is rejected before the service layer runs, with a structured `BAD_REQUEST` error (field-level detail, no stack traces).
- **Idempotency:** `programVersion.commitFromSimulation` is the one procedure that most needs this — it accepts the `simulationId` as its idempotency key; a duplicate call with the same, already-consumed `simulationId` returns the original result rather than double-committing. Ordinary create operations (e.g., `program.create`) are not idempotent by contract; the client is responsible for not double-submitting a create.
- **Errors:** typed error codes (`UNAUTHORIZED`, `NOT_FOUND`, `STALE_SIMULATION`, `INVALID_MUTATION`, `VALIDATION_ERROR`) rather than raw exceptions crossing the API boundary. `STALE_SIMULATION` specifically carries enough information for the client to immediately re-trigger `simulation.simulate` without the user re-describing their intent.
- **Versioning strategy:** tRPC procedures are versioned by *additive evolution*, not URL versioning — new optional fields and new procedures are added freely; a breaking change to an existing procedure's input/output shape ships as a new procedure name (e.g., `programVersion.commitV2`) rather than mutating the old contract, since both web and mobile clients are built from the same monorepo and can be deployed together, breaking changes are a last resort reserved for cases where deploying client and server together isn't feasible.

## Why the Coach router is unusually constrained

`coach.postMessage` is the one procedure on this list explicitly forbidden from being able to reach `programVersion`'s commit path. Its handler calls into `packages/ai` (not `packages/api`'s own `programVersionService`) for anything touching program structure, and `packages/ai` — by what it imports, not by what it's told — cannot call `commitFromMutation`. The only *mutations* `coach.postMessage` can cause directly are creating `AIMessage`/`AIConversation` rows and, when the model invokes the corresponding tools, `Constraint`/`TemporaryConstraint` rows (explicitly low-risk and confirmation-free per the Final Freeze §17). Applying a program change is always a *separate* client call to `programVersion.commitFromSimulation`, triggered by a human clicking a button the Coach UI renders — never something `coach.postMessage`'s own response can cause by itself. Full detail in `10-ai-coach-architecture.md`.
