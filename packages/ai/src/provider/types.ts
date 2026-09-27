/**
 * Model-provider abstraction.
 *
 * The orchestrator (packages/ai/src/orchestrator.ts) depends only on the
 * `ModelProvider` interface. The concrete Anthropic implementation lives in
 * ./AnthropicProvider.ts; tests use ./MockProvider.ts. Provider choice is
 * deliberately not load-bearing — see ARCH-007.
 *
 * This layer deals in raw messages and tool definitions, NOT in
 * AIMessageSegments. Segment assembly is the orchestrator's job.
 */

export interface ModelMessage {
  role: 'user' | 'assistant';
  /**
   * Either a plain string (most turns) or an array of typed content blocks
   * (a turn that mixes text with tool_use / tool_result).
   */
  content: string | ModelContentBlock[];
}

export type ModelContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError?: boolean;
    };

export interface ToolDefinition {
  name: string;
  description: string;
  /**
   * JSON Schema for the tool's input. The orchestrator supplies these; the
   * provider passes them through to the underlying model unchanged.
   */
  inputSchema: Record<string, unknown>;
}

export interface ModelRequest {
  messages: ModelMessage[];
  tools: ToolDefinition[];
  systemPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ModelResponse {
  /** Concatenated assistant text. Empty when the model only called tools. */
  text: string;
  /** Tool calls the model requested. Empty on a final text turn. */
  toolCalls: ToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'error';
  usage?: { inputTokens: number; outputTokens: number };
}

export type ModelStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use'; call: ToolCall }
  | { type: 'stop'; reason: ModelResponse['stopReason'] };

export interface ModelProvider {
  /**
   * Non-streaming single turn. Used in tests and by any call site that does
   * not need incremental output. Must NOT be used from the tRPC subscription
   * path — see stream().
   */
  complete(input: ModelRequest): Promise<ModelResponse>;

  /**
   * Streaming single turn. Emits text deltas as they arrive, then any
   * tool_use events, then a terminal `stop` event. The orchestrator loops
   * over this to drive the tool-calling conversation.
   */
  stream(input: ModelRequest): AsyncIterable<ModelStreamEvent>;
}