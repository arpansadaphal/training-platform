import {
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type Part,
  type Tool,
} from '@google/genai';

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

export interface GeminiProviderConfig {
  apiKey: string;
  /**
   * The exact model string, e.g. "gemini-3.8-flash". Passed in from
   * environment configuration — never hard-coded here (ARCH-007).
   */
  model: string;
}

/**
 * Concrete ModelProvider backed by Google's Gemini API via the unified
 * @google/genai SDK (ARCH-045), using the API-key (AI Studio) authentication
 * path.
 *
 * Stateless with respect to conversation: each call constructs a fresh
 * request against the shared SDK client. The orchestrator owns conversation
 * state.
 *
 * Mapping notes:
 *
 *   - Gemini uses role "model" where our ModelMessage uses "assistant".
 *   - Gemini 3.x returns a unique id on every functionCall and requires it
 *     echoed back on the matching functionResponse. We preserve that id as
 *     the ToolCall.id and maintain a name map across the message history so
 *     tool_result blocks — which carry only the id — can resolve back to the
 *     function name Gemini also requires alongside the id.
 *   - Gemini 3.x attaches a `thoughtSignature` to functionCall parts and
 *     requires it echoed back verbatim on the next turn's matching part.
 *     Without it, the follow-up request fails with 400 INVALID_ARGUMENT
 *     ("Function call is missing a thought_signature"). We capture it into
 *     ToolCall.thoughtSignature and re-emit it in toGeminiParts.
 *   - Gemini's functionResponse.response is an object, not a string. The
 *     orchestrator's tool_result content is a JSON string; we parse it and
 *     wrap it if it is not already an object.
 *   - Gemini reports FinishReason.STOP for both a final text turn and a
 *     tool-calling turn. We disambiguate by checking whether any function
 *     calls were present in the response.
 */
export class GeminiProvider implements ModelProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(config: GeminiProviderConfig) {
    if (!config.apiKey) {
      throw new Error('GeminiProvider requires a non-empty apiKey');
    }
    if (!config.model) {
      throw new Error('GeminiProvider requires a non-empty model string');
    }
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = config.model;
  }

  async complete(input: ModelRequest): Promise<ModelResponse> {
    const nameMap = buildToolUseNameMap(input.messages);
    const contents = toGeminiContents(input.messages, nameMap);
    const tools = toGeminiTools(input.tools);

    const config: GenerateContentConfig = {
      systemInstruction: input.systemPrompt,
      ...(tools.length > 0 ? { tools } : {}),
      ...(input.maxTokens !== undefined
        ? { maxOutputTokens: input.maxTokens }
        : {}),
      ...(input.temperature !== undefined
        ? { temperature: input.temperature }
        : {}),
    };

    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config,
    });

    return toModelResponse(response);
  }

  async *stream(input: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const nameMap = buildToolUseNameMap(input.messages);
    const contents = toGeminiContents(input.messages, nameMap);
    const tools = toGeminiTools(input.tools);

    const config: GenerateContentConfig = {
      systemInstruction: input.systemPrompt,
      ...(tools.length > 0 ? { tools } : {}),
      ...(input.maxTokens !== undefined
        ? { maxOutputTokens: input.maxTokens }
        : {}),
      ...(input.temperature !== undefined
        ? { temperature: input.temperature }
        : {}),
    };

    const stream = await this.client.models.generateContentStream({
      model: this.model,
      contents,
      config,
    });

    let sawToolCalls = false;
    let lastFinishReason: string | undefined;

    // Iterate the raw parts rather than the aggregate `chunk.text` /
    // `chunk.functionCalls` accessors. The accessors flatten across parts and
    // drop the per-part `thoughtSignature`, which Gemini 3.x requires us to
    // echo back on the next turn. Reading parts directly keeps each
    // functionCall associated with its own signature.
    for await (const chunk of stream) {
      const parts: Part[] = chunk.candidates?.[0]?.content?.parts ?? [];

      for (const part of parts) {
        if (part.text) {
          yield { type: 'text_delta', text: part.text };
        }

        if (part.functionCall) {
          sawToolCalls = true;
          const fc = part.functionCall;
          const signature = part.thoughtSignature;
          yield {
            type: 'tool_use',
            call: {
              id: fc.id ?? fc.name ?? '',
              name: fc.name ?? '',
              input: fc.args ?? {},
              ...(signature ? { thoughtSignature: signature } : {}),
            },
          };
        }
      }

      const finishReason = chunk.candidates?.[0]?.finishReason;
      if (finishReason !== undefined) {
        lastFinishReason = finishReason as string;
      }
    }

    yield {
      type: 'stop',
      reason: mapFinishReason(lastFinishReason, sawToolCalls),
    };
  }
}

// ===========================================================================
// Mapping helpers
// ===========================================================================

/**
 * Map from native functionCall.id to function name.
 *
 * Gemini 3.x returns a unique id on every functionCall and requires it echoed
 * back on the matching functionResponse. The name is still required alongside
 * it. This map lets a tool_result block — which carries only the id — resolve
 * back to the name Gemini expects.
 */
function buildToolUseNameMap(messages: ModelMessage[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const msg of messages) {
    if (typeof msg.content === 'string') continue;
    for (const block of msg.content) {
      if (block.type === 'tool_use') {
        map.set(block.id, block.name);
      }
    }
  }
  return map;
}

function toGeminiContents(
  messages: ModelMessage[],
  nameMap: Map<string, string>,
): Content[] {
  return messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: toGeminiParts(msg.content, nameMap),
  }));
}

function toGeminiParts(
  content: string | ModelContentBlock[],
  nameMap: Map<string, string>,
): Part[] {
  if (typeof content === 'string') {
    return [{ text: content }];
  }
  return content.map((block) => {
    switch (block.type) {
      case 'text':
        return { text: block.text };

      case 'tool_use': {
        const part: Part = {
          functionCall: {
            id: block.id,
            name: block.name,
            args: toFunctionCallArgs(block.input),
          },
        };
        // Echo the thought signature back on the same part it arrived on.
        // Gemini 3.x rejects the request with 400 INVALID_ARGUMENT if the
        // first functionCall part of any step in the current turn is missing
        // its signature. Anthropic and mock providers never set this, so the
        // field is absent for them and the part is unchanged.
        if (block.thoughtSignature) {
          part.thoughtSignature = block.thoughtSignature;
        }
        return part;
      }

      case 'tool_result': {
        const name = nameMap.get(block.toolUseId) ?? block.toolUseId;
        return {
          functionResponse: {
            id: block.toolUseId,
            name,
            response: parseToolResultContent(block.content),
          },
        };
      }
    }
  });
}

function toFunctionCallArgs(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

/**
 * Gemini's functionResponse.response is an object. The orchestrator supplies
 * the tool result as a JSON string. Parse it when it is an object; otherwise
 * wrap the parsed value under a `result` key so the shape is always an object.
 */
function parseToolResultContent(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { result: parsed };
  } catch {
    return { result: content };
  }
}

function toGeminiTools(tools: ToolDefinition[]): Tool[] {
  if (tools.length === 0) return [];
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as FunctionDeclaration['parameters'],
      })),
    },
  ];
}

function toModelResponse(response: GenerateContentResponse): ModelResponse {
  // Read from the raw parts, not response.functionCalls, for the same reason
  // the streaming path does: the aggregate accessor drops per-part
  // thoughtSignature metadata.
  const parts: Part[] = response.candidates?.[0]?.content?.parts ?? [];
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const part of parts) {
    if (part.text) {
      textParts.push(part.text);
    }
    if (part.functionCall) {
      const fc = part.functionCall;
      const signature = part.thoughtSignature;
      toolCalls.push({
        id: fc.id ?? fc.name ?? '',
        name: fc.name ?? '',
        input: fc.args ?? {},
        ...(signature ? { thoughtSignature: signature } : {}),
      });
    }
  }

  return {
    text: textParts.join(''),
    toolCalls,
    stopReason: mapFinishReason(
      response.candidates?.[0]?.finishReason as string | undefined,
      toolCalls.length > 0,
    ),
    usage: {
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

/**
 * Gemini reports FinishReason.STOP for both a final text turn and a
 * tool-calling turn. Disambiguate on the presence of function calls, matching
 * the contract the orchestrator relies on (stopReason 'tool_use' means "call
 * the tools and loop"; 'end_turn' means "this is the final JSON").
 */
function mapFinishReason(
  reason: string | undefined,
  hasToolCalls: boolean,
): ModelResponse['stopReason'] {
  if (hasToolCalls) return 'tool_use';
  switch (reason) {
    case 'STOP':
      return 'end_turn';
    case 'MAX_TOKENS':
      return 'max_tokens';
    case 'STOP_SEQUENCE':
      return 'stop_sequence';
    default:
      return 'error';
  }
}