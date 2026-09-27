import Anthropic from '@anthropic-ai/sdk';

import type {
  ModelContentBlock,
  ModelMessage,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelStreamEvent,
  ToolCall,
  ToolDefinition,
} from './types';

export interface AnthropicProviderConfig {
  apiKey: string;
  /**
   * The exact model string, e.g. "claude-sonnet-4-5" or whatever the current
   * production model is. Passed in from environment configuration — never
   * hard-coded here, and never hard-coded in this repo's docs either, because
   * model identifiers change on a shorter cycle than this architecture should
   * (ARCH-007).
   */
  model: string;
}

/**
 * Concrete ModelProvider backed by Anthropic's Messages API.
 *
 * Stateless with respect to conversation: each call constructs a fresh
 * request against the shared SDK client. The orchestrator owns conversation
 * state.
 *
 * Streaming note: this implementation iterates the raw event stream returned
 * by the SDK's `messages.stream()` helper. Some SDK versions type the events
 * slightly differently — if you upgrade @anthropic-ai/sdk and TypeScript
 * complains about `event.type` or `event.index`, the fix is confined to this
 * file. The observable behaviour (emit text_delta for text, one tool_use
 * event per completed tool call, one terminal stop event) is the contract the
 * orchestrator depends on.
 */
export class AnthropicProvider implements ModelProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: AnthropicProviderConfig) {
    if (!config.apiKey) {
      throw new Error('AnthropicProvider requires a non-empty apiKey');
    }
    if (!config.model) {
      throw new Error('AnthropicProvider requires a non-empty model string');
    }
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model;
  }

  async complete(input: ModelRequest): Promise<ModelResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: input.maxTokens ?? 4096,
      temperature: input.temperature,
      system: input.systemPrompt,
      messages: input.messages.map(toAnthropicMessage),
      tools: input.tools.map(toAnthropicTool),
    });
    return toModelResponse(response);
  }

  async *stream(input: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: input.maxTokens ?? 4096,
      temperature: input.temperature,
      system: input.systemPrompt,
      messages: input.messages.map(toAnthropicMessage),
      tools: input.tools.map(toAnthropicTool),
    });

    // Accumulate tool_use input JSON across its deltas so we can yield one
    // complete ToolCall event when the block closes.
    const pendingToolCalls = new Map<
      number,
      { id: string; name: string; inputJson: string }
    >();

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_start': {
          const block = event.content_block;
          if (block.type === 'tool_use') {
            pendingToolCalls.set(event.index, {
              id: block.id,
              name: block.name,
              inputJson: '',
            });
          }
          break;
        }
        case 'content_block_delta': {
          const delta = event.delta;
          if (delta.type === 'text_delta') {
            yield { type: 'text_delta', text: delta.text };
          } else if (delta.type === 'input_json_delta') {
            const pending = pendingToolCalls.get(event.index);
            if (pending) {
              pending.inputJson += delta.partial_json;
            }
          }
          break;
        }
        case 'content_block_stop': {
          const pending = pendingToolCalls.get(event.index);
          if (pending) {
            yield {
              type: 'tool_use',
              call: {
                id: pending.id,
                name: pending.name,
                input: pending.inputJson ? safeJsonParse(pending.inputJson) : {},
              },
            };
            pendingToolCalls.delete(event.index);
          }
          break;
        }
        // message_start / message_delta / message_stop — not surfaced.
        default:
          break;
      }
    }

    const final = await stream.finalMessage();
    yield { type: 'stop', reason: mapStopReason(final.stop_reason) };
  }
}

// --- mapping helpers ---

function toAnthropicMessage(m: ModelMessage): Anthropic.MessageParam {
  if (typeof m.content === 'string') {
    return { role: m.role, content: m.content };
  }
  return {
    role: m.role,
    content: m.content.map(toAnthropicBlock) as Anthropic.MessageParam['content'],
  };
}

function toAnthropicBlock(b: ModelContentBlock): unknown {
  switch (b.type) {
    case 'text':
      return { type: 'text', text: b.text };
    case 'tool_use':
      return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: b.toolUseId,
        content: b.content,
        is_error: b.isError,
      };
  }
}

function toAnthropicTool(t: ToolDefinition): Anthropic.Tool {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
  };
}

function toModelResponse(response: Anthropic.Message): ModelResponse {
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];
  for (const block of response.content) {
    if (block.type === 'text') {
      textParts.push(block.text);
    } else if (block.type === 'tool_use') {
      toolCalls.push({ id: block.id, name: block.name, input: block.input });
    }
  }
  return {
    text: textParts.join(''),
    toolCalls,
    stopReason: mapStopReason(response.stop_reason),
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

function mapStopReason(
  r: string | null | undefined,
): ModelResponse['stopReason'] {
  switch (r) {
    case 'end_turn':
    case 'tool_use':
    case 'max_tokens':
    case 'stop_sequence':
      return r;
    default:
      return 'error';
  }
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}