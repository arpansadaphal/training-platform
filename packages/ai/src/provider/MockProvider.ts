import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelStreamEvent,
} from './types';

/**
 * Test double for ModelProvider.
 *
 * Scripted: you queue turns ahead of time, and each call to complete()/stream()
 * consumes the next one. If the queue is exhausted, the call throws — a test
 * that under-scripts its provider should fail loudly rather than silently
 * loop or return a placeholder.
 *
 * No network. CI must never require ANTHROPIC_API_KEY (Phase 8 guidance Q).
 */
export class MockProvider implements ModelProvider {
  private readonly script: ScriptedTurn[] = [];
  private cursor = 0;

  /**
   * Queue a turn. A ScriptedTurn is either a final ModelResponse or a factory
   * that receives the request — the factory form lets a test assert the
   * request shape (system prompt content, tool array membership, etc.) at the
   * moment the orchestrator calls the provider.
   */
  queue(turn: ScriptedTurn): this {
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

  /** Number of turns the orchestrator has consumed so far. */
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
}

export type ScriptedTurn =
  | ModelResponse
  | ((input: ModelRequest) => ModelResponse);