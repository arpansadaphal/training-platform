### ARCH-011 — `packages/ai` has no import path to the program-commit function
Date: 2026-09-20 | Status: FROZEN | Reversible: No — this is the core safety property of the whole AI Coach
Decision: `commitFromMutation` (and its `commitFromSimulation`/`commitFromDraft` callers) live exclusively in `packages/api`; `packages/ai` can call `simulate()` and low-risk constraint-writing functions, nothing else that mutates program structure.
Rationale: Turns "the AI never silently applies a change" (Final Freeze §14) from a prompted instruction into a property of the dependency graph.
Consequence: Any future PR giving `packages/ai` a new import toward a mutating function requires explicit justification and a new decision entry — treated as a standing rule, not a one-time check.
Source: `10-ai-coach-architecture.md`, `02-system-architecture.md`.
