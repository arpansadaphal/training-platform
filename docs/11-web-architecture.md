# 11 — Web Application Architecture (PART H)

Next.js 15, App Router. The UI reflects the product architecture; it does not become the architecture — every screen below is a thin renderer over `packages/api` calls. No business logic (leverage math, mutation validation, evidence tagging) lives in `apps/web`.

## Route structure (conceptual, not exhaustive)

```
/                         marketing/landing (unauthenticated)
/signup, /login
/app                       identity/progress landing (see below) — the returning-user home
/app/programs              list of the user's Programs
/app/programs/[id]         a Program: current status, active version, goal
/app/programs/[id]/build   Builder — edit/compare Drafts, live Analyze
/app/programs/[id]/history version history (Revisions), "your story"
/app/train                 today's/next Session, active program context
/app/train/session/[id]    logging UI for one Session
/app/review/[blockId]      Review — Assessment vs. execution, side by side
/app/coach                 Coach panel, contextualized to whichever Program/Version is in view
```

## Core flows, mapped to the loop

- **First visit (Build → Analyze):** `/app/programs/[id]/build` holds one or more `ProgramDraft`s side by side (per `07-versioning-and-simulation.md`'s many-drafts design); editing a Draft triggers `analysis.previewAnalyze` (live, not persisted) and renders the Metric → Assessment → Action structure (Final Freeze §9: Overall → Strengths → Attention → Biggest Opportunity → Actions, in that fixed order).
- **Commit:** a Draft's "Commit" action calls `programVersion.commitFromDraft`; the resulting screen is the same Assessment layout, now reading from the persisted `AssessmentSnapshot`.
- **Training:** `/app/train` calls `session.getOrCreateNext`; the logging UI prioritizes speed (large tap targets, minimal navigation between sets) to match the table-stakes bar set by Strong/Hevy/Boostcamp — this is explicitly not a place to spend differentiation effort; it needs to be merely as fast as the competition.
- **Review:** `/app/review/[blockId]` renders `review.get` — deterministic, no AI call required for the screen to be complete and useful.
- **Revision:** a "Revise" button on the Review screen opens the Builder with a new Draft pre-populated from the reviewed version.
- **Coach:** a persistent side panel/drawer available from any Program/Version context, calling `coach.postMessage` (streamed) and rendering `prepare_apply_confirmation` payloads as an explicit "Apply this change" button — never an auto-applied result. See `10-ai-coach-architecture.md`.

## The landing screen is the Identity/Progress surface, not a feature-dashboard

Round 2's research finding (§4) is adopted here as a concrete IA decision, at zero extra build cost: `/app` is not a tab among equals — it *is* the app's front door for a returning user, showing their current Program, headline accumulated stats, and what's next (today's session or an open Review), rather than a grid of feature entry points. This directly answers Final Freeze §36's named risk ("Home/landing experience becomes a feature-dashboard despite the stated principle") by making the correct choice the default, not an option to drift away from. It costs nothing beyond routing/layout decisions — see `phases/phase-07-review-and-revision.md`, where this surface is built.

## State management

- **Server state:** tRPC + React Query (tRPC's standard client pairing) for all data that lives in Postgres — no separate global store duplicating server state.
- **Draft editing state:** the currently-edited `ProgramDraft`'s structure is optimistically held in local component state and persisted to the server on a debounce, so the Builder feels instant while still surviving a refresh (the Draft row is the source of truth, not the browser).
- **No localStorage/sessionStorage for anything that matters** — a Draft that only exists in browser storage and not the `ProgramDraft` table would violate the "persistent Drafts" design goal (Round 2 §4) the moment the user switches devices.

## Design system

Frontend visual/UX decisions (typography, spacing, component aesthetic) are intentionally **not** specified in this document — see `/mnt/skills/public/frontend-design/SKILL.md` when the Builder and Assessment screens are actually implemented in Phase 4, so the visual language is chosen deliberately rather than defaulted.

## What is explicitly not built in the web app at MVP
Any social/sharing UI (Phase 10), any trainer-mode workspace, any nutrition surface, any second-sport UI, any AI L2/L3 surface.
