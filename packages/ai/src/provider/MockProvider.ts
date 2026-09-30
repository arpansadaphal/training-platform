import type {
  ModelMessage,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelStreamEvent,
} from './types';

/**
 * Test double for ModelProvider.
 *
 * Two modes, chosen at construction:
 *
 *   1. QUEUED (default). You queue turns ahead of time and each call to
 *      complete()/stream() consumes the next one. If the queue is exhausted,
 *      the call throws — a test that under-scripts its provider should fail
 *      loudly rather than silently loop or return a placeholder. No network.
 *      CI must never require ANTHROPIC_API_KEY or GEMINI_API_KEY for the
 *      unit suite (Phase 8 guidance Q).
 *
 *   2. SCENARIO (Phase 9, for the E2E regression spec). When constructed
 *      with `{ scenario: "coach-regression" }`, the mock ignores the queue
 *      and produces a deterministic simulate_program_change →
 *      prepare_apply_confirmation → final-text sequence. The orchestrator
 *      still drives the tool loop; the mock never calls a tool handler
 *      directly. The scenario is activated in the running app by setting
 *      MODEL_PROVIDER=mock and MOCK_SCENARIO=coach-regression (see
 *      ./factory.ts), which the CI and staging regression suites set.
 *
 * The queue's "exhausted" error is preserved when no scenario is set, so
 * existing unit tests are unaffected.
 *
 * ── coach-regression shape notes (Phase 9 first-run findings) ───────────
 *
 * The simulate_program_change tool's input schema is `.strict()` and the
 * MutationSpec lives under the key `mutation`:
 *
 *     { mutation: { op: "ADD_WORKOUT_DAY", day: {...} } }
 *
 * Two earlier attempts — `{ spec: {...} }` and `{ op, day }` at the top
 * level — were both rejected by Zod with "Unrecognized key(s)". See
 * docs/13-testing-strategy.md's Phase 8 note ("the Zod schema declares
 * `mutation: z.unknown()` — deliberate, so the deterministic engine
 * remains the sole authority on MutationSpec validity").
 */
export type MockScenario = 'coach-regression';

export interface MockProviderOptions {
  /**
   * When set, the mock ignores the queue and produces the named scenario.
   * Must not be combined with a queued turn — the constructor throws if
   * both are attempted.
   */
  scenario?: MockScenario;
}

export class MockProvider implements ModelProvider {
  private readonly script: ScriptedTurn[] = [];
  private readonly scenario: MockScenario | null;
  private cursor = 0;

  constructor(options: MockProviderOptions = {}) {
    this.scenario = options.scenario ?? null;
  }

  /**
   * Queue a turn. A ScriptedTurn is either a final ModelResponse or a factory
   * that receives the request — the factory form lets a test assert the
   * request shape (system prompt content, tool array membership, etc.) at the
   * moment the orchestrator calls the provider.
   *
   * Calling queue() on a scenario-constructed mock is a programming error:
   * the two modes are mutually exclusive. Fail at the call site, not at the
   * first stream() call.
   */
  queue(turn: ScriptedTurn): this {
    if (this.scenario !== null) {
      throw new Error(
        `MockProvider: cannot queue turns when constructed with a scenario ` +
          `("${this.scenario}"). The two modes are mutually exclusive.`,
      );
    }
    this.script.push(turn);
    return this;
  }

  /** Convenience: queue a plain text response with no tool calls. */
  queueText(text: string): this {
    return this.queue({ text, toolCalls: [], stopReason: 'end_turn' });
  }

  /** Convenience: queue a single-tool-call turn. */
  queueToolCall(name: string, input: unknown): this {
    return this.queue({
      text: '',
      toolCalls: [
        { id: `mock-tool-${this.script.length}`, name, input },
      ],
      stopReason: 'tool_use',
    });
  }

  /** Number of turns the orchestrator has consumed so far, across modes. */
  get calls(): number {
    return this.cursor;
  }

  async complete(input: ModelRequest): Promise<ModelResponse> {
    return this.next(input);
  }

  async *stream(input: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const response = this.next(input);
    if (response.text) {
      // Single delta — mock does not simulate token-level streaming.
      yield { type: 'text_delta', text: response.text };
    }
    for (const call of response.toolCalls) {
      yield { type: 'tool_use', call };
    }
    yield { type: 'stop', reason: response.stopReason };
  }

  private next(input: ModelRequest): ModelResponse {
    // Queue mode takes precedence — the constructor forbids combining the
    // two, so this branch is only entered for a queued mock.
    if (this.script.length > 0) {
      if (this.cursor >= this.script.length) {
        throw new Error(
          `MockProvider: no scripted response at cursor ${this.cursor}. ` +
            `The orchestrator called the provider more times than the test scripted. ` +
            `Scripted ${this.script.length} turn(s).`,
        );
      }
      const turn = this.script[this.cursor];
      this.cursor += 1;
      // noUncheckedIndexedAccess: turn is `ScriptedTurn | undefined` — the
      // length check above narrows it, but TypeScript cannot see that, so this
      // is an explicit not-undefined assertion with an explanatory guard.
      if (turn === undefined) {
        throw new Error('MockProvider: internal cursor desync');
      }
      return typeof turn === 'function' ? turn(input) : turn;
    }

    if (this.scenario === 'coach-regression') {
      const phase = this.cursor;
      this.cursor += 1;
      return coachRegressionTurn(phase, input);
    }

    throw new Error(
      `MockProvider: no scripted response at cursor ${this.cursor}, ` +
        `and no scenario set. The orchestrator called the provider more ` +
        `times than the test scripted. Scripted ${this.script.length} turn(s).`,
    );
  }
}

export type ScriptedTurn =
  | ModelResponse
  | ((input: ModelRequest) => ModelResponse);

// ── coach-regression scenario ─────────────────────────────────────────────
//
// Drives the same path the Phase 8 network-inspection spec asserts:
//
//   turn 0  → simulate_program_change with `{ mutation: {...} }`
//   turn 1  → prepare_apply_confirmation, simulationId read from the
//             previous turn's tool_result
//   turn 2  → final text (parsed by parseModelOutput against
//             modelOutputSchema)
//
// The orchestrator runs the tool handlers between turns, exactly as it
// would against a real provider. The mock does not bypass the tool loop —
// it merely decides what the model "would have said".

function coachRegressionTurn(
  phase: number,
  input: ModelRequest,
): ModelResponse {
  if (phase === 0) {
    return {
      text: '',
      toolCalls: [
        {
          id: 'mock-simulate-call-1',
          name: 'simulate_program_change',
          // The tool's input schema is `{ mutation: z.unknown() }` —
          // deliberately loose so the deterministic engine remains the sole
          // authority on MutationSpec validity (invariant 1). The schema is
          // `.strict()`, so the key must be exactly `mutation`.
          //
          // First-run history (Phase 9): `{ spec: {...} }` was rejected
          // with "Unrecognized key(s): 'spec'"; `{ op, day }` at top level
          // was rejected with "Unrecognized key(s): 'op', 'day'".
          input: {
            mutation: {
              op: 'ADD_WORKOUT_DAY',
              day: {
                id: 'mock-regression-day',
                orderIndex: 99,
                name: 'Mock Regression Day',
                prescriptions: [],
              },
            },
          },
        },
      ],
      stopReason: 'tool_use',
    };
  }

    if (phase === 1) {
    const simulationId = extractLastSimulationId(input.messages);
    if (!simulationId) {
      // This branch should be unreachable under the current orchestrator.
      // It fires only if the tool_result's shape changes without a
      // matching update to extractLastSimulationId below. The error names
      // the assumption so the next debugger knows where to look.
      throw new Error(
        'MockProvider (coach-regression): could not find a simulationId in ' +
          'the message history. The orchestrator is expected to send the ' +
          'simulate_program_change tool_result back as a content block whose ' +
          'JSON contains a "simulationId" string field. If that shape has ' +
          'changed, update extractLastSimulationId to match.',
      );
    }
    return {
      text: '',
      toolCalls: [
        {
          id: 'mock-prepare-apply-call-1',
          name: 'prepare_apply_confirmation',
          input: { simulationId },
        },
      ],
      stopReason: 'tool_use',
    };
  }

  if (phase === 2) {
    // The final turn's text is parsed by parseModelOutput against
    // modelOutputSchema. Per ARCH-043 the model's output schema is a strict
    // subset of AIMessageSegment, restricted to `text` and `claim`. The
    // shape below assumes modelOutputSchema is `{ segments: [...] }`. If
    // parseModelOutput expects a different outer shape (e.g., a bare array),
    // adjust this string and the corresponding assertion in
    // packages/ai/src/schema.ts.
    return {
      text: JSON.stringify({
        segments: [
          {
            type: 'text',
            content:
              "I've simulated that change and prepared it for you to apply. " +
              "Click Apply if you'd like to commit it as a new version.",
          },
        ],
      }),
      toolCalls: [],
      stopReason: 'end_turn',
    };
  }

  throw new Error(
    `MockProvider (coach-regression): unexpected phase ${phase}. The ` +
      `orchestrator should have stopped after the final text response.`,
  );
}

/**
 * Extract the simulationId from the last tool_result content block.
 *
 * Scans messages newest-first. Two shapes are handled:
 *   - `message.content` is a string (the plain-text form some turns use).
 *   - `message.content` is an array of ModelContentBlock (the tool-loop form).
 *
 * The regex matches JSON with a `"simulationId"` key. If the orchestrator
 * uses a different key (e.g. it strips the id from the tool result and only
 * forwards the SimulationResult body), this returns null and the caller
 * throws a message naming the assumption — plus the diagnostic dump above
 * prints the actual shape so the fix is a one-line regex change.
 */
function extractLastSimulationId(messages: ModelMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;

    if (typeof message.content === 'string') {
      const match = message.content.match(/"simulationId"\s*:\s*"([^"]+)"/);
      if (match && match[1]) return match[1];
      continue;
    }

    for (let j = message.content.length - 1; j >= 0; j--) {
      const block = message.content[j];
      if (!block) continue;
      if (block.type === 'tool_result') {
        const match = block.content.match(/"simulationId"\s*:\s*"([^"]+)"/);
        if (match && match[1]) return match[1];
      }
    }
  }
  return null;
}