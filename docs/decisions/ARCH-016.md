### ARCH-016 — TrainingBlock lifecycle is fully automatic
Date: 2026-09-20 | Status: FROZEN | Reversible: Yes, contained
Decision: A block opens on version activation and closes automatically when a different version activates or the Program is archived — no explicit "end block" user action.
Rationale: Lets Review serve both a final and a mid-block "how's this going" purpose with one mechanism, matching Round 1's "lightweight mid-block check-in" idea at zero extra cost.
Source: `08-training-execution-and-evidence.md`.
