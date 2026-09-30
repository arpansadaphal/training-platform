# 18 — Final Architecture Sanity Check (PART Q)

A genuine self-review, not a formality. Organized by the categories the brief asked for.

## Unnecessary complexity
**`ProgramVersion`'s dual representation** (canonical `structureSnapshot` + normalized rows, `ARCH-012`) is the one place in this architecture carrying real, deliberate extra complexity. The defense stands — reproducibility vs. queryability are genuinely different needs — but it's worth naming the reversibility condition plainly: if, after a few phases, the normalized rows are never actually queried directly (all real reads go through the snapshot), drop them and derive any needed structural diff from two snapshots on demand. This is a "revisit if unused" decision, not a permanent one, and `ARCH-012` says so explicitly rather than presenting this as settled forever.

## Premature abstractions
**The `GoalProfileRegistry` pattern** for what is, at MVP, exactly one profile. This is *not* premature in the usual sense — the Final Freeze explicitly requires the architecture to be multi-goal-ready from day one, not "someday" — but the registry indirection is worth naming as a place where a simpler `switch` statement would also have technically satisfied the letter of that requirement. The registry earns its keep specifically because Strength is listed as should-ship-if-cheap (Phase 10-adjacent), meaning the second profile is plausible soon, not hypothetical. Kept, with the reasoning stated rather than assumed.

## Extension points verified, not just claimed
Checked explicitly against the source documents' own stated jobs-to-be-done, rather than only against the Final Freeze's architecture section:
- **"Compare two candidate structures side by side before committing"** (Master Blueprint JTBD #4) — a one-draft-per-Program model would have silently foreclosed this. Caught by checking the domain model against every JTBD, not just the architecture spec; resolved as `ARCH-014` (many Drafts per Program).
- **"Do not build sharing infrastructure before Phase 10"** (Final Freeze §28) — verified the schema plan adds only the `visibility` enum column at Phase 1, not the `ProgramShare` table, which is correctly withheld until Phase 10 (`ARCH-017`).
- **Forking** — verified that nothing in the versioning model assumes a `ProgramVersion` can only ever belong to the Program that created it; a future fork is "copy a snapshot into a new Program," not a schema change (`07-versioning-and-simulation.md`).

## Where the AI could accidentally become authoritative — the place this architecture was most careful
The single biggest risk named in the Final Freeze itself (§36: "AI safety boundaries erode under product pressure... a future 'quick AI summary' shortcut that skips Assessment") is addressed structurally, not just procedurally: `packages/ai` has no import path to the mutation-committing function (`ARCH-011`). This is checked by what code *can* import, not by what a system prompt *says* — a materially stronger guarantee than the Final Freeze's own tool table strictly required, and flagged as a deliberate strengthening (`ARCH-018`) rather than presented as simply following the spec.

## Migration risks, named honestly
- **tRPC's non-REST nature** is a real, named limitation if a third-party/public API integration is ever needed (e.g., a future trainer-tool partner). The mitigation (routers already organized as REST resources would be) reduces this to a bounded hand-port, not an architecture change — but it is not zero-cost, and pretending otherwise would be dishonest.
- **`structureSnapshot`'s shape evolving over time** — old snapshots will have the old shape once new fields are added to `ExercisePrescription` down the line. This is explicitly accepted, following the Final Freeze Appendix D's own instruction to "reconcile structurally... rather than requiring literal naming matches" — but it means any code reading historical snapshots must tolerate missing fields gracefully, forever. This is a real, ongoing discipline requirement, not a one-time decision.

## Over-engineered
Reviewed the sharing/`ProgramShare` design (per-recipient granularity, separate execution-history opt-in) against whether it's more machinery than Phase 10 actually needs. Verdict: kept as designed — the Final Freeze §20 explicitly distinguishes "share a structure" from "share your actual results" as different trust bars, so the granularity is a direct requirement, not gold-plating. What *was* trimmed during this review: no `packages/validation` or `packages/types` package (§ `16-repository-structure.md`) — both would have been structure added for theoretical reuse with no current consumer, which the brief explicitly warns against.

## Under-engineered — named honestly, not hidden
- **Recovery Cost's formula**, not just its thresholds, may need inputs this domain model doesn't currently capture (training age, bodyweight, sleep). This is flagged in `05-analysis-engine.md` as a genuinely open item, not quietly resolved with an invented formula. It's the one axis where "just wire up the thresholds later" undersells what's actually unresolved.
- **Rate limiting** is policy-level in `14-security-and-data-ownership.md`, not concretely engineered — intentionally left light for MVP, to be sized against real usage rather than speculative load, but named here so it isn't mistaken for "done."

## Places where the architecture is too tightly coupled — checked, none found beyond what's already named above
`packages/ai` depending on `packages/domain`'s `simulate()` is intentional coupling (it needs the real engine, not a copy of it) and is the *safe* direction of coupling, since `packages/domain` has no reciprocal dependency on `packages/ai`. No other cross-package coupling was found that would resist a later refactor.

## Net assessment
The architecture holds together without contradiction, preserves every invariant named in `00-product-freeze-reference.md`, and resolves the handful of genuine gaps the Final Freeze left implicit (Draft plurality, snapshot timing, the AI confirmation boundary) by making an explicit, logged, reversible-where-possible decision rather than a silent one. The two places most worth a second human look before Phase 1 starts are `ARCH-015` (Review's snapshot-vs-live-recompute default — has a real UX dimension) and the Recovery Cost formula gap (needs sports-science input beyond just thresholds).
