import { describe, expect, it } from 'vitest';

import { MockProvider, runCoachTurn } from '..';
import type { ModelMessage, ModelRequest } from '..';

import {
  drain,
  finalTurnJson,
  makeSpyToolDeps,
  makeStubOrchestratorDeps,
  TURN_INPUT,
} from './test-helpers';

describe('failure degradation', () => {
  it('a provider error on the first stream call produces a PROVIDER_ERROR terminal chunk', async () => {
    const provider = new MockProvider();
    // No scripted turns. MockProvider throws when its script is exhausted;
    // here that throw happens on the very first consumption.
    const { deps, persistSpy } = makeStubOrchestratorDeps(provider);
    const chunks = await drain(runCoachTurn(deps, TURN_INPUT));

    const errorChunk = chunks.find((c) => c.type === 'error');
    expect(errorChunk).toBeDefined();
    if (errorChunk?.type === 'error') {
      expect(errorChunk.code).toBe('PROVIDER_ERROR');
    }
    // Terminal — no final chunk follows.
    expect(chunks.find((c) => c.type === 'final')).toBeUndefined();

    // Error path persisted an assistant message marked with the code.
    const assistant = persistSpy.calls.find((c) => c.role === 'ASSISTANT');
    expect(assistant?.errorCode).toBe('PROVIDER_ERROR');
  });

  it('invalid JSON on both attempts produces STRUCTURED_OUTPUT_FAILED', async () => {
    const provider = new MockProvider();
    provider.queueText('this is not json');
    provider.queueText('still not json');

    const { deps, persistSpy } = makeStubOrchestratorDeps(provider);
    const chunks = await drain(runCoachTurn(deps, TURN_INPUT));

    const errorChunk = chunks.find((c) => c.type === 'error');
    expect(errorChunk).toBeDefined();
    if (errorChunk?.type === 'error') {
      expect(errorChunk.code).toBe('STRUCTURED_OUTPUT_FAILED');
    }
    expect(provider.calls).toBe(2);

    const assistant = persistSpy.calls.find((c) => c.role === 'ASSISTANT');
    expect(assistant?.errorCode).toBe('STRUCTURED_OUTPUT_FAILED');
  });

  it('a tool that throws surfaces as an is_error tool_result and the turn continues', async () => {
    const provider = new MockProvider();
    const requests: ModelRequest[] = [];

    // First turn: model asks for lookup_exercises.
    provider.queue((input) => {
      requests.push(input);
      return {
        text: '',
        toolCalls: [
          {
            id: 'call-1',
            name: 'lookup_exercises',
            input: { query: 'squat' },
          },
        ],
        stopReason: 'tool_use',
      };
    });

    // Second turn: capture the request, then emit a valid final response.
    provider.queue((input) => {
      requests.push(input);
      return {
        text: finalTurnJson([
          { type: 'text', content: 'Sorry, the lookup failed.' },
        ]),
        toolCalls: [],
        stopReason: 'end_turn',
      };
    });

    const { deps: toolDeps } = makeSpyToolDeps({
      lookupExercises: async () => {
        throw new Error('DB down');
      },
    });
    const { deps } = makeStubOrchestratorDeps(provider, { toolDeps });

    const chunks = await drain(runCoachTurn(deps, TURN_INPUT));

    // The turn completed — a final chunk, no error chunk.
    expect(chunks.find((c) => c.type === 'final')).toBeDefined();
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();

    // Two provider calls — the tool-use turn and the final turn.
    expect(requests).toHaveLength(2);

    // The second request carries a tool_result with isError: true. The
    // model gets a chance to narrate the failure instead of the whole turn
    // collapsing.
    const second = requests[1];
    expect(second).toBeDefined();
    const messages: ModelMessage[] = second?.messages ?? [];
    const lastMessage = messages[messages.length - 1];
    expect(lastMessage?.role).toBe('user');
    const blocks = lastMessage?.content;
    expect(Array.isArray(blocks)).toBe(true);
    if (Array.isArray(blocks)) {
      const toolResult = blocks.find((b) => b.type === 'tool_result');
      expect(toolResult).toBeDefined();
      if (toolResult?.type === 'tool_result') {
        expect(toolResult.isError).toBe(true);
        // The dep threw a plain Error, so the orchestrator used its generic
        // fallback message rather than exposing the raw error text.
        expect(toolResult.content).toBe('Tool execution failed.');
      }
    }
  });

  it('a tool that throws a ToolExecutionError surfaces the specific message', async () => {
    const provider = new MockProvider();
    const requests: ModelRequest[] = [];

    provider.queue((input) => {
      requests.push(input);
      return {
        text: '',
        toolCalls: [
          {
            id: 'call-1',
            name: 'lookup_exercises',
            // An extra property rejected by .strict() — the tool throws
            // INVALID_INPUT with a specific message.
            input: { query: 'squat', bogusField: 1 },
          },
        ],
        stopReason: 'tool_use',
      };
    });

    provider.queue((input) => {
      requests.push(input);
      return {
        text: finalTurnJson([
          { type: 'text', content: 'That call was malformed.' },
        ]),
        toolCalls: [],
        stopReason: 'end_turn',
      };
    });

    const { deps: toolDeps } = makeSpyToolDeps();
    const { deps } = makeStubOrchestratorDeps(provider, { toolDeps });

    const chunks = await drain(runCoachTurn(deps, TURN_INPUT));
    expect(chunks.find((c) => c.type === 'final')).toBeDefined();

    const second = requests[1];
    const messages: ModelMessage[] = second?.messages ?? [];
    const lastMessage = messages[messages.length - 1];
    const blocks = lastMessage?.content;
    if (Array.isArray(blocks)) {
      const toolResult = blocks.find((b) => b.type === 'tool_result');
      if (toolResult?.type === 'tool_result') {
        expect(toolResult.isError).toBe(true);
        // The specific Zod error message was forwarded, not the generic
        // fallback.
        expect(toolResult.content).not.toBe('Tool execution failed.');
        expect(toolResult.content).toContain('Invalid input');
      }
    }
  });

  it('grounding failure on the retry produces a partial with a visible warning', async () => {
    const provider = new MockProvider();
    // Both attempts emit a claim with an out-of-context number.
    provider.queueText(
      finalTurnJson([
        {
          type: 'claim',
          tag: 'INTERPRETED',
          content: 'You need 999 sets.',
        },
      ]),
    );
    provider.queueText(
      finalTurnJson([
        {
          type: 'claim',
          tag: 'INTERPRETED',
          content: 'You need 999 sets.',
        },
      ]),
    );

    const { deps } = makeStubOrchestratorDeps(provider);
    const chunks = await drain(runCoachTurn(deps, TURN_INPUT));

    // No error chunk — the turn completed with a partial.
    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();

    const final = chunks.find((c) => c.type === 'final');
    expect(final).toBeDefined();
    if (final?.type === 'final') {
      expect(
        final.segments.some((s) => s.type === 'grounding_warning'),
      ).toBe(true);
      // The offending claim was withheld — the number never reaches the user.
      expect(
        final.segments.some(
          (s) => s.type === 'claim' && s.content.includes('999'),
        ),
      ).toBe(false);
    }
  });
});