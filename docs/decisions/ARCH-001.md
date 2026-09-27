### ARCH-001 — TypeScript across the entire stack
Date: 2026-09-20 | Status: FROZEN | Reversible: No (foundational)
Decision: TypeScript for web, API, domain logic, and future mobile — no polyglot split.
Rationale: The hard problems here are typed-data-correctness problems, not numeric/ML problems; one language enables sharing exact types end to end.
Alternatives considered: Python for the analysis/assessment engine. Rejected — no ML/statistics at MVP.
Consequence: Every new phase's code is TS by default; a deviation requires a new decision entry.
Source: `01-architecture-recommendation.md` §1.
