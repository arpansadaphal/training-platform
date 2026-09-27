### ARCH-007 — Anthropic Claude as default model provider, behind `ModelProvider`
Date: 2026-09-20 | Status: FROZEN | Reversible: Yes, contained to `packages/ai/src/provider`
Decision: Claude Messages API (tool use) as default; provider accessed only through an interface, never called directly from orchestration code; exact model string lives in environment config, not code or this document set.
Rationale: Strong structured tool-calling and structured output, which the Coach's safety architecture depends on.
Alternatives considered: OpenAI, open-weight hosted models — both viable behind the same interface.
Source: `01-architecture-recommendation.md` §8, `10-ai-coach-architecture.md`.
