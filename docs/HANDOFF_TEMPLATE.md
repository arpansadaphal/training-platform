# Handoff Template (PART N)

Reusable structure for handing one phase's implementation to a new, independent AI coding session. Copy this template, fill every section using the current `PROJECT_STATE.md`, `DECISIONS.md`, and the relevant `phases/phase-NN-*.md` file, and paste the filled version as the first message of the new session. A worked example (Phase 1) follows the blank template.

---

## BLANK TEMPLATE

### 1. Project context
One paragraph: what the overall product is. (Pull from `00-product-freeze-reference.md`'s thesis line — do not paraphrase from memory.)

### 2. Current architecture
Only the architecture relevant to the current phase — link the specific numbered doc(s), don't paste the whole set.

### 3. Completed phases
Short factual list: which phases (0 through N-1) are done, one line each, from `PROJECT_STATE.md`.

### 4. Current phase
Name and number. Paste the `phases/phase-NN-*.md` file in full — this is the actual task.

### 5. Frozen decisions
Copy the relevant entries from `DECISIONS.md` — at minimum, every decision tagged as touching this phase's area. Never omit the invariants list from `00-product-freeze-reference.md`.

### 6. Relevant domain model
Only the entities this phase touches, from `03-domain-model.md` — not the full domain model if the phase is narrow.

### 7. Existing implementation state
What has actually been built by the end of the previous phase — file paths, module names, function signatures already in place that this phase builds on. Pull from the previous phase's "Handoff information" section in `PROJECT_STATE.md`.

### 8. Files/modules
Important current files and their responsibilities — enough that the new session doesn't need to explore the whole repo to orient itself.

### 9. API/database state
Current schema (or a diff since the last handoff) and current API contract for anything this phase will extend.

### 10. Invariants
Restate, verbatim, the invariants from `00-product-freeze-reference.md` that this specific phase must not violate. Redundant with earlier handoffs by design — see `18-architecture-sanity-check.md`'s note on deliberate redundancy.

### 11. Current task
The exact implementation requirements — this is the phase file's own "Exact deliverables," "Files/modules," "Database changes," "API changes," "Domain changes," "UI changes" sections, copied in full.

### 12. Acceptance criteria
Copied verbatim from the phase file. Objective, checkable conditions — not "looks good."

### 13. Known unresolved decisions
Only genuinely unresolved issues relevant to this phase — e.g., Recovery Cost's formula gap for Phase 2, or the scientific threshold sign-off status for Phase 9. Do not re-list every unresolved item in `00-product-freeze-reference.md` if most are irrelevant to this phase.

### 14. Output required from the implementing AI
At the end of this phase, report back:
- What was changed (prose summary)
- Files created/modified (list)
- Schema changes (if any, with the migration name)
- Tests added, and confirmation they were run and passed
- Known issues or incomplete items
- Any deviation from this phase's spec, and why
- Any new decision made that should be logged in `DECISIONS.md`
- A filled "Handoff information to the next phase" section, ready to paste into `PROJECT_STATE.md`

---

## WORKED EXAMPLE — handoff into Phase 1

> **1. Project context** — A program-design intelligence system: users build a training Program, get it evaluated transparently against a stated Goal with reasoning shown, train it, and revise it using an honestly-labeled record of what the design predicted vs. what happened. Full detail: `docs/00-product-freeze-reference.md`.
>
> **2. Current architecture** — TypeScript monorepo (pnpm + Turborepo), Next.js hosting web + API via tRPC, PostgreSQL via Prisma, a framework-free `packages/domain`. See `docs/01-architecture-recommendation.md` and `docs/02-system-architecture.md`.
>
> **3. Completed phases** — Phase 0 (Foundation): deployed, auth working, empty shell. See `PROJECT_STATE.md` for exact URLs and versions.
>
> **4. Current phase** — Phase 1: Domain Model & Database. [paste `docs/phases/phase-01-domain-and-database.md` in full]
>
> **5. Frozen decisions** — [paste ARCH-001 through ARCH-006 from `DECISIONS.md`, plus the full invariants list from `00-product-freeze-reference.md`]
>
> **6. Relevant domain model** — All of `03-domain-model.md` (Phase 1 implements the full schema).
>
> **7. Existing implementation state** — Phase 0 produced: `apps/web` (Next.js, deployed), `packages/db` with only `User` + Auth.js tables, `packages/api` with only `user.getSelf`, `packages/domain`/`packages/ai`/`packages/config` as empty wired stubs. No Program-related code exists yet.
>
> **8. Files/modules** — [list Phase 0's actual file tree, as recorded in `PROJECT_STATE.md`]
>
> **9. API/database state** — [paste the current `schema.prisma`, current as of end of Phase 0]
>
> **10. Invariants** — [paste the 11-item invariants list from `00-product-freeze-reference.md` verbatim]
>
> **11. Current task** — [Phase 1's "Exact deliverables" through "UI changes" sections, copied in full]
>
> **12. Acceptance criteria** — [Phase 1's acceptance criteria, copied verbatim]
>
> **13. Known unresolved decisions** — None specific to Phase 1 beyond the general `[SCIENTIFIC INPUT REQUIRED]` items, which this phase must not attempt to resolve (seed `GoalProfileDefinition` with `validated: false`, null bounds).
>
> **14. Output required** — [the standard list above]

This worked example is deliberately verbose to show what "complete" looks like — a real handoff should be exactly this thorough, not abbreviated for convenience. A new AI session should be able to start Phase 1 work immediately from this packet alone, without asking "what's this project about?"
