### ARCH-018 — AI "apply" is implemented as a client-only mutating endpoint the model cannot call, not a model-facing `apply` tool
Date: 2026-09-20 | Status: FROZEN | Reversible: No
Decision: The model-facing tool is named `prepare_apply_confirmation` and only returns a render payload; the actual commit is `programVersion.commitFromSimulation`, called exclusively by client code on an explicit user click.
Rationale: A strengthening of the Final Freeze §17's "confirmation required" requirement — flagged explicitly as an interpretation choice rather than implemented silently, per this document's own standing instruction to surface exactly this kind of decision.
Source: `10-ai-coach-architecture.md`.
