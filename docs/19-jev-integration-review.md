# 19 — Jev / System One Integration Review

Reviews whether TypeSafe AI's Jev (a "System One model") has a legitimate place in this product's architecture. This document does not modify the Final Freeze or the frozen architecture in `01`–`18`; it evaluates a new external technology against them and states plainly where nothing should change.

**A note on freshness, stated up front because it matters for the conclusion:** Jev launched publicly on 2026-09-15 — about a week before this review was written. Everything below is drawn from TypeSafe's own launch materials and early third-party coverage/benchmarks, not from hands-on testing against this product's data. That recency is itself a load-bearing fact in this review's conclusion, not incidental color.

## What Jev actually is (verified, not assumed)

TypeSafe AI is a San Francisco lab, founded by Diego Almeida (previously at OpenAI, credited as a co-creator of ChatGPT and RLHF), that came out of stealth on September 15, 2026 with roughly $40M in seed funding and Jev as its first public release. Jev is explicitly **not** a text-generating LLM — TypeSafe's own framing is that it is the first in a new category they call "System One models": given a bounded **state** (text/JSON describing a situation) and one or more pre-declared **typed questions**, it returns structured, probabilistic answers in a single pass, with no token-by-token generation and nothing to parse.

Three question primitives, per TypeSafe's own documentation:
- **Choice** — picks one option from a caller-defined set, returning a probability for *every* option, not just the winner, plus a confidence value. Option descriptions matter materially — third-party testing found confidence dropped from roughly 0.82 to 0.60 when options were given as bare labels instead of described criteria.
- **Score** — places the input on a caller-defined rubric/scale, with confidence.
- **Noul** — returns the probability that a yes/no proposition is true; the probability *is* the confidence (0.5 = genuinely undecided), with no separate confidence field.

Multiple questions can be asked against one state in a single request, but they are evaluated independently — the answer to one question does not become context for another in the same call. If a real dependency exists between two decisions, the documented pattern is to make a second call once the first has resolved, not to chain them implicitly.

**Access model:** hosted API only, in early access behind a waitlist. No published weights, no self-hosting option. Reported latency is in the 70ms–500ms range; reported input pricing is roughly $0.042 per million tokens with free output. Reported speedup/cost-reduction figures relative to conventional LLMs vary by source — different write-ups report figures ranging from roughly 40x to 200x faster and up to several hundred times cheaper, depending on the specific comparison task and which competing model is used as the baseline. **These are vendor-reported or early third-party numbers, not independently verified against this product's workload**, and the spread itself (40x–200x, not a single number) is worth noting as a sign these figures are highly task-dependent.

**Accuracy, reported honestly rather than cherry-picked:** on TypeSafe's own internal "4-workflow" benchmark, Jev is reported at roughly 68% accuracy — described by TypeSafe as "close to mid-tier LLMs" on that specific harder benchmark. Separately, an early third-party (LangChain) evaluation on a simpler support-ticket classification task reported Jev matching a human oracle across 500 repeated judgments with substantially lower variance than three LLM judges used for comparison. **These are two different benchmarks measuring different things — tight agreement on an easy, well-bounded classification task is not the same claim as high accuracy on a harder, more open-ended one.** Nothing here should be read as "Jev is ~68% accurate" or "Jev matches human judgment" as a general property; both numbers are workflow-specific and neither has been run against this product's actual decision distribution.

**Disclosed limitations, from TypeSafe's own documentation:** the current model version (publicly tracked as "1.13," already iterated on within the first week post-launch) has acknowledged weak spots in arithmetic, date reasoning, distractor resistance, adversarial input, and structural inconsistency. TypeSafe's own marketing also draws a sharp line on scope: Jev is explicitly positioned as unsuitable for chat, code generation, or anything requiring a written explanation — open-ended reasoning is explicitly deferred to a conventional LLM in TypeSafe's own recommended patterns.

**Real precedent for the kind of use case this review evaluates:** third-party framework integrations already exist for tool-shortlisting/selection with confidence-gated "destructive-action" checks (Composio), and for LLM-call routing/guardrails (LiteLLM) — i.e., other teams are already using Jev for structurally similar problems to the ones in this review's scope, which is useful precedent, though none of it is evidence specific to a fitness-coaching domain.

## A. Executive conclusion

**Prototype behind an adapter; do not adopt for MVP or V1.** Revisit only once Phase 8 (AI Coach) has shipped and has accumulated real conversation volume, and only after running the benchmark plan in §G against this product's own data.

Three independent reasons converge on this, any one of which would be sufficient on its own:

1. **Nothing in this product's roadmap currently needs it.** Every candidate use case identified below is advisory — a routing/cost-optimization signal, never an authoritative decision — because the architecture's hard invariants (deterministic engine as sole quantitative authority, human-only confirmation for mutation, `packages/ai` having no import path to the commit function) already fully constrain what any AI component, Jev included, is allowed to do. Phase 8's existing design, using Claude's native tool-calling, already works correctly without Jev. Adding Jev now would be optimizing a cost/latency profile for a system that has zero production traffic to optimize for yet.
2. **Several of the most tempting use cases are already solved, deterministically, by the existing architecture** — constraint-violation checking against structured `Constraint` rows, and trade-off detection via `WhatChangedResult`, are both already exact, tested, reproducible code paths (see `06-assessment-engine.md`, `07-versioning-and-simulation.md`). Routing these through a probabilistic model would be a strict downgrade in reliability for no benefit.
3. **The vendor-maturity picture argues for waiting, independent of the technology's merits.** One week old, hosted-only with no self-host option, early access behind a waitlist, and already on a fast-moving point version — this is not a dependency to build MVP-critical behavior on top of, regardless of how promising the underlying idea is. This is a reversible, time-based objection, not a judgment about Jev's ceiling.

This is not a rejection of the idea. The genuinely promising use case — a fast, cheap, advisory intent pre-classifier sitting in front of Claude's tool-calling loop — is real, has outside precedent, and is worth a gated, shadow-mode prototype once there's usage data to test it against. It just isn't MVP work.

## B. Jev opportunity map

| Use case | Potential value | Risk | Alternative | Recommended timing | Classification |
|---|---|---|---|---|---|
| Coach intent pre-routing (explain / simulate / lookup / history / general / unsupported / clarify) | Cheaper, faster first-pass routing ahead of a full Claude turn; possible latency win on high-confidence, low-stakes intents | Misroute on ambiguous/adversarial phrasing; a second vendor dependency in the request path | Claude's own native tool-calling (already the Phase 8 design) | After Phase 8 ships + real volume exists | **Prototype behind an adapter** |
| Tool-selection pre-filter (which of the six Coach tools) | Same as above, narrower scope | Same as above; does not improve tool-call *safety*, since that's already structurally guaranteed | Claude's native tool selection | Same as above | **Prototype behind an adapter** |
| Meta-routing: answer / clarify / simulate / escalate / refuse | Could shape UX (when to show a clarifying question) | Confidence is not correctness; risk of over-trusting a calibration score from an out-of-domain eval set | The existing Coach loop already asks clarifying questions when needed | After real Coach conversation data exists | **Evaluate after usage data exists** |
| "Does this proposed change violate an explicit (structured) Constraint" | None beyond what already exists | Downgrade from exact to probabilistic for a case that's already deterministic | Existing `Constraint.exerciseId`/`movementPattern` lookup, already deterministic | N/A | **Not relevant to the product** |
| "Does this proposed change involve a genuine trade-off" | None beyond what already exists | Same — already computed exactly by `WhatChangedResult` | `diffAssessments()`, already deterministic | N/A | **Not relevant to the product** |
| "Does this action need confirmation" | None — this decision is not supposed to vary | Would directly contradict a frozen invariant (Final Freeze §14) if ever delegated | N/A — always yes, unconditionally, by design | N/A | **Do not use** |
| Exercise/muscle-group/movement-pattern tagging, at curation time (Phase 1 seed data authoring) | Speeds up a human curator drafting the Exercise catalog | An unreviewed classification error silently corrupts Volume/Frequency for every user of that exercise, indefinitely | Manual curation; LLM-assisted drafting with mandatory human review | Any time, as a drafting aid only | **Adopt for MVP** *(narrowly — authoring-time assist, human-reviewed, never a live production classifier)* |
| Exercise/muscle-group tagging, live/unreviewed, at runtime | None justifiable | Same corruption risk, with no human in the loop | N/A | N/A | **Do not use** |
| Exercise substitution suggestions (Coach-time, advisory) | A bounded, reasonable Choice/Score use case | Domain-specific accuracy unproven | Claude reasoning over Exercise reference data directly | After usage data exists | **Evaluate after usage data exists** |
| Program/Goal intent classification from structure | None — Goal is always explicit user input, never inferred (Final Freeze §10) | Would directly violate "Goal is never baked into/inferred from ProgramVersion" | N/A | N/A | **Not relevant to the product** |
| Onboarding profiling (goals/experience/equipment/readiness) | None — no such feature exists anywhere in the MVP/V1/Phase 10 roadmap | Would be inventing a feature to justify evaluating a vendor, and would raise a real privacy question for health-adjacent data sent to an early-access third party | N/A | N/A | **Not relevant to the product** |
| Selecting relevant historical records for L2 (Historian) | Plausible future shape: bounded relevance-ranking over N candidate TrainingBlocks | L2 itself is post-MVP and gated on real retention; evaluating its internals now is premature | Claude with a retrieval tool, same as planned | After L2 is enabled and has real history to query | **Evaluate after usage data exists** |
| Review-conversation routing (clarification-needed, revision-intent detection) | Same shape as Coach intent routing, scoped to Review | Review itself is deliberately deterministic and AI-narrative-free (Final Freeze §19); this only touches the Coach layer on top of it | Existing Coach loop | After usage data exists | **Evaluate after usage data exists** |
| Internal dev-tooling / coding-agent routing (not product-facing) | Possible future convenience for this team's own workflow | Out of scope for the product architecture entirely | N/A | Not applicable to this document | **Not relevant to the product** |

## C. Architectural impact

**What changes:** nothing in the frozen architecture (`01`–`18`) or the authorized roadmap (Phases 0–10). No table, router, tool, or invariant is modified.

**What does not change, stated explicitly because it's the most important line in this document:** the deterministic engine remains the sole source of quantitative truth; `packages/ai` retains zero import path to any mutation-committing function; applying a program change remains a distinct, explicit, human-triggered action; the Coach's confirmation boundary (`ARCH-011`, `ARCH-018` in `DECISIONS.md`) is untouched. Jev, if ever integrated, would sit entirely inside `packages/ai`, as one more optional, advisory, discardable input alongside the Claude conversational model — never with any greater authority than the tool-calling loop it would sit in front of.

**Which boundaries remain fixed:** every boundary named in `02-system-architecture.md`'s "three-layer rule." A `DecisionProvider`, if built, is orchestration code, same layer as `ModelProvider` — never domain, never persistence.

**Whether the current implementation architecture remains valid:** yes, unconditionally. This review changes zero acceptance criteria in any phase file.

## D. Production boundary

```
┌─────────────┐       ┌────────────────────┐
│ Web / Mobile │─────▶│   packages/api       │
│   Client     │       │  (orchestration)     │
└─────────────┘       └──────────┬───────────┘
                                  │
                 ┌────────────────┼─────────────────┐
                 ▼                                    ▼
       ┌───────────────────┐              ┌────────────────────────┐
       │  packages/domain    │◀───reads────│    packages/ai           │
       │  (deterministic,     │             │  (Coach orchestrator)    │
       │   pure, sole source   │             └───────────┬─────────────┘
       │   of quantitative      │                         │
       │   truth — UNCHANGED)    │            ┌────────────┼─────────────┐
       └──────────┬─────────────┘            ▼                          ▼
                 │                 ┌────────────────────┐   ┌─────────────────────┐
                 │                 │ Claude (conv. LLM)   │   │ DecisionProvider      │
                 │                 │ text + native tool    │   │ (NEW, optional,        │
                 │                 │ calls — unchanged      │   │  advisory-only)         │
                 │                 └────────────────────┘   └───────────┬─────────────┘
                 │                                                       │
                 │                                          ┌────────────┴────────────┐
                 │                                          ▼                          ▼
                 │                              ┌────────────────────┐    ┌──────────────────────┐
                 │                              │ JevDecisionProvider  │    │ NullDecisionProvider   │
                 │                              │ (hosted 3rd party,    │    │ (default; also the      │
                 │                              │  behind feature flag,  │    │  test double — always    │
                 │                              │  logged, never acted    │    │  returns "no signal")     │
                 │                              │  on without shadow-      │    └──────────────────────┘
                 │                              │  mode validation first)   │
                 │                              └────────────────────┘
                 ▼
       ┌───────────────────┐
       │   packages/db        │
       │   → PostgreSQL         │
       └───────────────────┘

MUTATION PATH (unchanged — Jev has no access, before or after this review):
  Human click ──▶ packages/api.commitFromSimulation ──▶ packages/domain.applyMutation ──▶ packages/db
  Neither packages/ai, Claude, nor any DecisionProvider (Jev or otherwise) has an import
  path into this line. This was true before Jev existed and remains true if Jev is added.
```

## E. Adapter specification

Justified — narrowly, as a prototype-only, feature-flagged seam, not a general "AI decision platform." Smallest reversible interface:

```typescript
// packages/ai/src/decision/DecisionProvider.ts
interface DecisionRequest<TSchema extends QuestionSchema> {
  state: BoundedCoachState;     // a small, deliberately curated subset of CoachContext — never the whole thing
  questions: TSchema;           // Choice | Score | Noul, per question key — no chained/dependent questions in one call
}

interface DecisionResult<TSchema extends QuestionSchema> {
  answers: TypedAnswers<TSchema>;   // per-question typed value + confidence
  providerVersion: string;          // pinned model/version string actually used, for reproducibility tracking
  latencyMs: number;
}

interface DecisionProvider {
  decide<TSchema extends QuestionSchema>(
    input: DecisionRequest<TSchema>
  ): Promise<DecisionResult<TSchema> | null>;   // null = no usable signal; caller MUST handle this as the default case
}
```

- **Responsibility:** turn a small, bounded, already-curated slice of Coach state into a typed, discardable routing *hint*.
- **Non-responsibilities:** never authors message text; never touches Analysis/Assessment/Fit Score; never decides whether confirmation is required (that's never a variable); never has any access to the mutation-committing function; never runs at Exercise-catalog runtime.
- **Input validation:** state is a hand-selected subset of the existing `CoachContext` (see `10-ai-coach-architecture.md`), not a raw dump — both to respect Jev's documented ~64K context cap and because third-party testing found extraneous context measurably *lowers* its accuracy, the opposite of how more context typically helps a conversational LLM.
- **Output validation:** a missing or out-of-range confidence value, or a schema mismatch, is treated as a hard failure and mapped to `null` (no signal) — never partially trusted.
- **Timeout:** short and non-blocking (on the order of Jev's own reported sub-second latency); a timeout is not an error, it's simply "no signal this turn."
- **Retry:** at most one, never blocking the user-visible response.
- **Fallback:** the entire existing Phase 8 Claude-driven tool-calling loop, unmodified — this *is* the fallback, not a new thing built for Jev's sake.
- **Logging/tracing:** every call logs the question set, the typed answer, confidence, `providerVersion`, and what the orchestrator actually did as a result — this is the raw material for shadow-mode evaluation in §G.
- **Privacy boundary:** state passed to any `DecisionProvider` follows the exact same "no raw user content off-platform without review" principle already stated in `14-security-and-data-ownership.md` for any third-party call — this is not a new rule, just confirmation that Jev doesn't get an exemption from an existing one.
- **Cost controls:** covered by the same per-user rate-limiting layer already specified for `coach.postMessage`.
- **Versioning:** the exact model version string is pinned in `packages/config`, never a floating "latest" alias — the observed version churn (already on a "1.13" point release within a week of launch) makes this a correctness requirement for any benchmark comparison to mean anything over time, not just a nicety.
- **Test doubles:** `NullDecisionProvider` (always returns `null`) as the default in every environment except an explicit shadow-mode experiment, and a `ScriptedDecisionProvider` returning fixed answers for deterministic tests — same pattern already established for `ModelProvider`'s `MockProvider` in Phase 8.
- **Feature flag:** `JEV_ROUTING_ENABLED`, default `false`, same pattern as `L2_ENABLED`.
- **Removal path:** delete `JevDecisionProvider`'s one implementation file and flip the flag's default away — nothing else in the codebase references Jev directly, because the orchestrator only ever talks to the `DecisionProvider` interface. This is the entire removal procedure.

## F. Coach workflow examples

1. **Explanation request** — *"Why is my chest volume flagged?"* If `JEV_ROUTING_ENABLED`, a fast pre-classification returns high confidence for `explain_assessment`. This can shave a planning step off the interaction, but Claude still reads the real `AssessmentSnapshot` and produces the actual grounded, evidence-tagged text — Jev never speaks and never touches the Assessment.
2. **Simulation request** — *"What if I added a chest day?"* Jev may flag `simulate_change` with high confidence, but it cannot construct the actual `MutationSpec` from free text — that is exactly the open-ended, schema-authoring reasoning TypeSafe itself says Jev is not built for. Claude remains the one that calls `simulate_program_change`.
3. **Ambiguous request** — *"Can you fix my program?"* A well-behaved `Choice` call here returns a flat, low-confidence spread across several intents. The orchestrator treats this exactly like `null` — no shortcut — and falls through unchanged to Claude, which asks a clarifying question. This is the *correct* outcome, not a failure of the adapter.
4. **Constrained request** — *"Add deadlifts to Tuesday"*, where the user has a persistent `Constraint` avoiding deadlifts. Jev plays **no role** here at all: `applyMutation`/`simulate_program_change` already deterministically checks the mutation against the user's structured `Constraint` rows before anything reaches the model's response. This is the clearest example in this review of a case that's already solved and should stay untouched.
5. **Training-history request** — *"Has my recovery been an issue lately?"* Pre-L2 (current MVP+), the Coach correctly declines to make longitudinal claims, `L2_ENABLED` being off. If L2 ever ships and Jev is later evaluated for it, its only plausible role is *selecting which past TrainingBlock/Observation records are relevant to fetch* — never generating the "here's the pattern" narrative itself, which stays Claude's job, evidence-tagged, exactly as designed.

## G. Benchmark plan

**Dataset:** 30–50 hand-labeled examples per category (clear / ambiguous / multi-intent / unsupported / adversarial / references-an-older-version / constraint-involving / simulation-requiring / history-requiring / clarification-requiring), authored from realistic Coach phrasing for this specific product — not a generic support-ticket dataset, given the domain-specificity concern raised throughout this review. Hand-labeled by whoever owns the product's judgment calls, not crowdsourced.

**Baselines**, all compared against the same dataset:
1. Deterministic keyword/regex rules (cheapest possible baseline).
2. A cheap conventional LLM classifier prompt (e.g., a small Claude model asked to pick a category).
3. **The actual Phase 8 production behavior with `JEV_ROUTING_ENABLED = false`** — i.e., Claude's native tool-calling alone, unassisted. This is the real baseline that matters, since it's what ships regardless of this review's outcome.
4. Jev via the adapter, `JEV_ROUTING_ENABLED = true`, in **shadow mode only** (logged, never acted on) for the first evaluation window.

**Metrics:** intent accuracy against hand labels; tool-selection agreement with the production baseline's actual choice; invalid-action rate (must stay exactly zero regardless of routing — this measures whether the structural safety boundary held, not whether Jev is "safe"); false-positive/negative simulation-trigger rate; clarification rate; latency and cost, measured against real Phase 8 call volume; fallback frequency (how often low confidence correctly triggers the existing path); user-correction rate; run-to-run/version-to-version reproducibility (directly motivated by the observed 1.13 → later-version churn); and honest operational-complexity tracking (actual integration/maintenance time spent, not an estimate).

**Decision rule:**
- **Adopt (flag on, still shadow-first for 2–4 weeks before acting on it):** accuracy on the high-confidence bucket specifically is very high (this is the only bucket that would ever be acted on), measurable latency/cost savings show up against real Phase 8 volume, invalid-action rate stays at zero, and shadow-mode logging over several weeks shows no systematic failure pattern.
- **Limited experimentation:** results are promising but the sample size or time window is too small to trust — keep the flag on for logging only, do not let it affect production behavior yet.
- **Deferral (the current, honest state of this review):** no real Coach usage volume exists yet to make any cost/latency case — true for the entire pre-launch period, so this is where things stand until Phase 8 ships and accumulates usage.
- **Rejection:** shadow mode reveals systematic misrouting on domain-relevant edge cases (plausibly the "older version" or date-referencing requests, given TypeSafe's own disclosed date-reasoning weakness) that isn't fixable through better question design, or version-to-version output drift proves too unstable to trust as a stable metric.

## H. Updated architecture changes

**None.** Every document in `01`–`18` remains valid and unmodified in substance. The only additions are: this review (`19`), a short, clearly-marked pointer added to `10-ai-coach-architecture.md`'s extension-path section (reserving the `DecisionProvider` name the same way `CrossUserAnalyticsProvider` is already reserved for L3), and one new `DECISIONS.md` entry recording that Jev was evaluated and explicitly not adopted — so a future session doesn't have to re-litigate this from scratch, and doesn't accidentally wire Jev into Phase 8 without reading this review first.

## I. Updated phased roadmap

**Phases 0–10 are unchanged** — no deliverable, acceptance criterion, dependency, or risk in any existing phase file is modified. One new, clearly optional, **unscheduled and unauthorized** candidate phase is added purely as a placeholder for if/when the gate in §G is actually cleared — see `phases/phase-11-jev-prototype-candidate.md`. It is deliberately structured like the existing Phase 10 (separated out precisely so it can never be mistaken for required work), with one difference: unlike Phase 10's should-ship-if-cheap items (which come from the frozen product spec itself), this phase has no standing authorization at all — it requires the benchmark plan in §G to actually run and clear its adoption bar before anyone begins it.

## J. Final implementation handoff

- **Is Jev included in the product?** No.
- **Is it optional?** Yes, entirely — nothing in Phases 0–10 depends on it in any way.
- **Which phase introduces it, if ever?** A new, currently-unauthorized Phase 11 candidate (see `phases/phase-11-jev-prototype-candidate.md`), gated behind this review's benchmark plan actually running.
- **Which files/modules/contracts are affected right now?** Only documentation: this file, a short addition to `10-ai-coach-architecture.md`, one `DECISIONS.md` entry, and the new Phase 11 stub. No code changes.
- **What must the implementing AI never do:** wire a `JevDecisionProvider` or any `DecisionProvider` into `packages/ai`'s live orchestration path without the `JEV_ROUTING_ENABLED` flag defaulting to `false` and shadow-mode logging running first; give any `DecisionProvider` an import path toward `commitFromMutation` or any function that persists a `ProgramVersion`; use Jev (or any probabilistic classifier) for constraint-violation checking, trade-off detection, or the confirmation-required decision — all three are either already deterministic or structurally invariant, and routing them through a probabilistic layer would be a regression, not an improvement; treat any Jev confidence score as proof of correctness rather than a hint requiring its own validation against this product's data.
- **What remains deferred:** the entire Phase 11 candidate, in full, until Phase 8 has shipped, has real usage volume, and the benchmark plan in §G has actually been run — not estimated, not assumed.
- **What must be measured before adoption:** everything listed under §G's metrics, against this product's own hand-labeled dataset, with Phase 8's real production behavior as the baseline it has to beat.

---

## Sources consulted (September 2026)
TypeSafe AI's own site and documentation (typesafe.ai, docs.typesafe.ai); MarkTechPost's launch coverage; DataCamp's technical write-up; Tom's Hardware's coverage of the launch claims and disclosed limitations; MindStudio's explainer (founder background, category framing); a Hyperstack technical benchmark write-up (primitive definitions, an independent LangChain-run comparison); a Spring AI integration blog (option-description sensitivity, Noul semantics); a community "awesome-typesafe" resource index (provider/framework integrations, including Composio's tool-selection use and LiteLLM's routing use). All figures attributed above to TypeSafe or to a named third party are reported as such — none are independently verified against this product's workload, which is the entire point of §G's benchmark plan.
