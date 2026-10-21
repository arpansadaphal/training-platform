# ARCH-053 — Breadth-aware Fit projection (E11)

**Date:** 2026-10-12 (backfilled)
**Status:** Accepted
**Supersedes:** none
**Superseded by:** none

> **Note:** written retroactively on 2026-10-21. Phase 10.4 (commit `054cce8`, merged in PR #20) shipped without a decision entry. The content below is based on the shipped code (`packages/domain/src/assessment/computeFitScore.ts`, `packages/domain/src/goal-profiles/hypertrophy.ts`), the refreshed calibration baseline (`packages/api/calibration-before.txt`, commit `7127bc4`), and the audit's Section 22 E11.

## Context

Before E11, Fit was the worst single leverage across `allAssessedAxes`. Under the ARCH-052 axis rebuild, every new finding landed at LOW leverage, and LOW maps to STRONG. So a program with five attention areas could still read STRONG, which made the headline band disagree with the narrative beside it.

## Decision

Fit is the worst single leverage **plus breadth floors**.

- **Base band (unchanged):** the worst single leverage maps through `worstLeverageToBand`. NONE and LOW give STRONG, MODERATE gives DECENT, HIGH gives NEEDS_WORK.
- **Breadth floor:** each floor reads "at least N findings at leverage T or worse → the band is no better than X". The final band is the worst of the base band and every triggered floor. Floors only ever make the band worse (monotone), and they count cumulatively (a HIGH finding also counts toward a LOW floor).
- **`findingMinSeverity` is pinned to `materialitySeverityThreshold`**, so every finding that can move the band is one the narrative shows as an attention area or the biggest opportunity. `fit-score.test.ts` pins the equality.
- **Shipped floor:** 3 findings at LOW or worse → no better than DECENT. No shipped floor can produce NEEDS_WORK from findings below HIGH. That is a deliberate cap; changing it is a config edit.

## Alternatives rejected

- **Weighted sum (Design B):** it introduces an ordinal-to-numeric mapping, which the `computeFitScore.ts` header forbids, and the exchange rates between tiers have no evidence behind them.
- **Promotion ladder (Design C):** the same numeric problem, and "why NEEDS_WORK?" becomes untraceable.

## Effect

- Program D goes from STRONG to DECENT (5 findings at LOW). All other calibration programs are unchanged.
- New probes pin the boundary: K (one MODERATE plus seven LOW, no HIGH) reads DECENT; L (one HIGH finding, nothing else) reads NEEDS_WORK.
- `ASSESSMENT_ENGINE_VERSION` went to 0.4.0. Reverting means deleting `breadth` from the projection, which reproduces 0.3.0 exactly.

## Related

- ARCH-052 (E5–E9 axis rebuild, which produced the LOW-leverage findings this addresses)
- Invariant 8 (`00-product-freeze-reference.md`): Fit derives from the same leverage roll-up as the Assessment
- ARCH-030 (Fit derivation: ordinal projection, no numeric intermediate)
- ARCH-054 (shows this band, labelled provisional, under an unvalidated profile)
