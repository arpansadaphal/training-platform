
import { AnthropicProvider } from './AnthropicProvider';
import { GeminiProvider } from './GeminiProvider';
import { MockProvider, type MockScenario } from './MockProvider';
import type { ModelProvider } from './types';

export type ModelProviderName = 'anthropic' | 'gemini' | 'mock';

/**
 * The result of createProvider. Returns the provider instance AND the model
 * string that was resolved, because the orchestrator persists the model
 * string on every AIMessage row (OrchestratorDeps.model). Returning both
 * keeps the env-reading logic in one place rather than duplicating the
 * per-provider fallback in the caller.
 */
export interface CreatedProvider {
  provider: ModelProvider;
  model: string;
  providerName: ModelProviderName;
}

/**
 * createProvider selects the concrete ModelProvider based on MODEL_PROVIDER.
 *
 * ARCH-045: this is the single switch point. Callers construct a provider
 * through this function, never directly, so swapping providers is an env
 * change rather than a code change.
 *
 * Default 'anthropic' (preserves existing behaviour for any environment
 * that has ANTHROPIC_API_KEY set and does not set MODEL_PROVIDER).
 *
 * Throws if the selected provider's required env is missing. The throw is
 * deliberate and early — a Coach turn that cannot reach a provider should
 * fail at subscription time with a clear message, not midway through.
 *
 * Mock scenario (Phase 9): when MODEL_PROVIDER=mock, MOCK_SCENARIO selects
 * a scripted scenario for the MockProvider. The only defined scenario is
 * "coach-regression", used by the E2E regression and coach specs in CI. An
 * unset or unrecognised MOCK_SCENARIO produces a bare MockProvider with an
 * empty queue — the pre-Phase-9 behaviour, preserved for any caller that
 * queues turns explicitly.
 */
export function createProvider(): CreatedProvider {
  const providerName = (process.env.MODEL_PROVIDER ??
    'anthropic') as ModelProviderName;

  switch (providerName) {
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      const model = process.env.ANTHROPIC_MODEL;
      if (!apiKey) {
        throw new Error(
          'ANTHROPIC_API_KEY is not configured. Set it, or set ' +
            'MODEL_PROVIDER=gemini (or MODEL_PROVIDER=mock for tests).',
        );
      }
      if (!model) {
        throw new Error(
          'ANTHROPIC_MODEL is not configured. The Coach requires a pinned ' +
            'model string (ARCH-007).',
        );
      }
      return {
        provider: new AnthropicProvider({ apiKey, model }),
        model,
        providerName,
      };
    }

    case 'gemini': {
      const apiKey = process.env.GEMINI_API_KEY;
      const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
      if (!apiKey) {
        throw new Error(
          'GEMINI_API_KEY is not configured. Set it, or set ' +
            'MODEL_PROVIDER=anthropic.',
        );
      }
      return {
        provider: new GeminiProvider({ apiKey, model }),
        model,
        providerName,
      };
    }

    case 'mock': {
      // Parse MOCK_SCENARIO defensively. Only "coach-regression" is defined
      // in Phase 9; any other value (including empty string) is treated as
      // "no scenario" so a typo does not silently activate a script.
      const rawScenario = process.env.MOCK_SCENARIO;
      const scenario: MockScenario | undefined =
        rawScenario === 'coach-regression' ? 'coach-regression' : undefined;

      return {
        provider: new MockProvider(scenario ? { scenario } : {}),
        model: 'mock',
        providerName,
      };
    }

    default: {
      const _exhaustive: never = providerName;
      throw new Error(
        `Unknown MODEL_PROVIDER "${String(_exhaustive)}". ` +
          `Expected one of: anthropic, gemini, mock.`,
      );
    }
  }
}