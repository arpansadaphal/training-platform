### ARCH-015 — AssessmentSnapshot persisted at Commit and Block-End; Review reads the snapshot, not a live recompute, by default
Date: 2026-09-20 | Status: FROZEN, flagged for product sign-off | Reversible: Yes, contained
Decision: Historical Review shows the Assessment the user actually saw and acted on; a "recompute with current thresholds" action is a separate, explicit, opt-in comparison.
Rationale: Prevents a later threshold revision from retroactively changing what a historical Review screen shows, without hiding the option to see an updated view.
Consequence: This is an architecture-level recommendation resolving a gap the Final Freeze doesn't fully spell out — genuinely worth a product-owner confirmation, not purely an engineering call.
Source: `04-database-schema.md`, `06-assessment-engine.md`.
