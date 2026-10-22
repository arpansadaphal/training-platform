# ARCH-059 — New users follow a vetted program by default; Build stays first-class

**Date:** 2026-10-22
**Status:** Proposed. Not in effect; awaiting the founder's decision. If rejected, mark it Rejected here rather than deleting it.
**Amends (if accepted):** the thesis and core loop in `00-product-freeze-reference.md`
**Supersedes:** none

## Context

The Final Freeze is build-centric. Its thesis is "users build a training Program, get it evaluated…", and its core loop starts at BUILD. The 2026-10-22 strategy retargets the product at committed novices (3–18 months of lifting) and returners. These users want a program that fits their week and evidence that it's working; they don't want to design one. Today a new user lands on an empty Builder, which the lazy-lifter diagnostic identified as a give-up point.

## Proposal

- **New users get a program first.** A human-authored starter template is selected by deterministic rules from onboarding answers (experience, days per week, session length, equipment, exercises to avoid). Each template is engine-checked and externally reviewed before it ships.
- **Templates are not AI-generated.** The non-goal "AI-generated programs as the primary workflow" stands unchanged. Selection is a visible rule table, not a model.
- **Build remains first-class.** Any template can be opened in the Builder and edited, and the Builder stays MUST SHIP. Users who want to design their own programs keep the full path.
- **The core loop becomes:** SELECT or BUILD ⇄ ANALYZE → COMMIT → TRAIN → OBSERVE → REVIEW → REVISE.

## What does not change

- Invariants 1–11.
- The deterministic engine stays the sole source of quantitative truth.
- Assessment stays Hypertrophy-only.
- No multi-sport build.
- No community or social features.

## Alternatives considered

- **AI-generated programs:** rejected. It's a Freeze non-goal, it's opaque, and the output can't be expert-reviewed ahead of time.
- **Keep build-first and add better onboarding copy:** rejected. The target user doesn't want to design a program, and copy doesn't change that.
