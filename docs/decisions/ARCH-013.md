### ARCH-013 — `Goal` modeled as its own entity referencing `GoalProfileDefinition`
Date: 2026-09-20 | Status: FROZEN | Reversible: Yes, low cost (currently just a pointer)
Decision: `Goal` is a row, not an enum column on `Program`.
Rationale: Preserves room for future per-instance goal parameters and historical goal-querying without a later schema change; at MVP it's functionally just a profile pointer.
Source: `03-domain-model.md`.
