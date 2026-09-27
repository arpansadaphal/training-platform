import { z } from 'zod';

import {
  buildCoachContext,
  type CoachContext,
  type ContextBuilderDeps,
} from './context-builder';
import { checkGrounding, dropOffendingAndAddWarning } from './grounding';
import type {
  ModelContentBlock,
  ModelMessage,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ToolCall,
  ToolDefinition,
} from './provider';
import {
  aiMessageSegmentSchema,
  modelOutputSchema,
  parseModelOutput,
} from './schema';
import { buildSystemPrompt } from './system-prompt';
import {
  buildModelFacingTools,
  buildToolExecutor,
  toModelToolDefinitions,
  ToolExecutionError,
} from './tools';
import type { CoachToolDeps, ToolExecutionContext } from './tools/types';
import type { AIMessageSegment, CoachStreamChunk } from './types';

/**
 * The Coach's request loop.
 *
 * Responsibilities:
 *
 *   1. Persist the user message, build context, run the tool-calling loop
 *      against the model provider, validate the final structured response,
 *      ground it against the turn's context + tool results, and persist the
 *      assistant message.
 *
 *   2. Enforce the retry budget: ONE retry per turn, shared between the JSON
 *      validation axis and the grounding axis. See MAX_ATTEMPTS below.
 *
 *   3. Enforce the confirmation boundary. This file has NO import path to
 *      anything commit-shaped. The only mutating tool is
 *      note_constraint/note_temporary_constraint (low-risk, reversible,
 *      visible). The apply action is a client-side call the orchestrator
 *      never initiates — `prepare_apply_confirmation` returns a render
 *      payload, which the orchestrator persists, and the client renders as
 *      a button (ARCH-018).
 *
 * What this file does NOT do:
 *
 *   - It does not apply program changes. No path here does, and none may be
 *     added without explicit documented justification (ARCH-011).
 *   - It does not emit `delta` chunks. The final turn's text is JSON, and
 *     streaming it token-by-token has no client-side use; tool-use turns'
 *     text is scaffolding and is discarded (see "Pre-tool text" below). The
 *     `CoachStreamChunk.delta` type is reserved for a future where the final
 *     turn can be meaningfully streamed.
 * 
 * 
  * On retry, the message history resets to baseMessages + the rejected
 * assistant text + a problem statement. Tool-use/tool-result blocks from the
 * prior attempt are NOT carried forward — the model sees a clean retry prompt
 * and is free to re-call tools if it wants. `toolResultsRaw` nonetheless
 * continues to accumulate across attempts, because the grounding check's
 * allowed-numbers set is "material we possess this turn" — a tool result from
 * attempt 0 remains legitimate material even though the model can no longer
 * see it on retry. In practice this means a number the model forgot by
 * attempt 1 is still allowed if a tool produced it on attempt 0.
 *
 * Tool segments accumulate across attempts and are included in the final
 * message regardless of which attempt succeeded. Rationale: a tool like
 * `simulate_program_change` has already persisted a Simulation row and
 * already emitted its apply-button segment to the client by the time the
 * grounding check runs. Losing that segment on a retry would orphan the
 * persisted artifact — the user saw a button appear, then saw it disappear
 * when the retry succeeded without re-calling the tool. The trade-off — a
 * retry that calls tools again could produce a second apply button for the
 * same Simulation — is accepted; Phase 8's tests exercise the single-call
 * case only, and a duplicate button for the same `simulationId` is inert
 * (the client's commit call uses the id, and the second click hits
 * `STALE_SIMULATION` or is idempotent).
 *
 * "Pre-tool text": when the model emits text alongside a tool call, that
 * text is included in the message history sent back to the model (so the
 * model sees its own reasoning) but is never emitted to the client. Only the
 * final turn — stop_reason 'end_turn' — produces user-visible content.
 */

// ============================================================================
// Public deps and input
// ============================================================================

export interface PersistMessageInput {
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  segments: AIMessageSegment[];
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
  /**
   * Set on assistant messages the orchestrator persisted on an error path,
   * so an operator can distinguish "the Coach replied" from "the Coach was
   * unable to reply." Not exposed to the model or the user.
   */
  errorCode?: string;
}

export interface OrchestratorDeps {
  provider: ModelProvider;
  toolDeps: CoachToolDeps;
  contextDeps: ContextBuilderDeps;
  /**
   * Persist an AIMessage. The orchestrator calls this exactly twice per
   * successful turn (user, then assistant) plus at most once more on an
   * error path. It is injected rather than imported so the orchestrator
   * has no direct dependency on packages/db.
   */
  persistMessage(input: PersistMessageInput): Promise<{ messageId: string }>;
  /** Whether L2 (Historian) is enabled. Phase 8 ships false. */
  l2Enabled: boolean;
  /** Model string for the persisted message row. From environment config. */
  model: string;
}

export interface CoachTurnInput {
  userId: string;
  conversationId: string;
  userMessageText: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * One original attempt plus one retry, TOTAL. The retry budget is not
 * per-axis: a JSON-validation failure on attempt 0 uses the retry, and if
 * attempt 1 fails grounding, there is no third attempt. See file header.
 */
const MAX_ATTEMPTS = 2;

// ============================================================================
// Entry point
// ============================================================================

export async function* runCoachTurn(
  deps: OrchestratorDeps,
  input: CoachTurnInput,
): AsyncGenerator<CoachStreamChunk> {
  // --- 1. Persist the user message -----------------------------------------
  // Persisted before context is built, so the context builder's conversation
  // history (which the orchestrator also feeds the model) ends with it.
  try {
    await deps.persistMessage({
      conversationId: input.conversationId,
      role: 'USER',
      segments: [{ type: 'text', content: input.userMessageText }],
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to persist user message.';
    yield { type: 'error', code: 'PERSIST_FAILED', message };
    return;
  }

  // --- 2. Build context ----------------------------------------------------
  let context: CoachContext;
  try {
    context = await buildCoachContext(
      deps.contextDeps,
      { userId: input.userId, conversationId: input.conversationId },
      { l2Enabled: deps.l2Enabled },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to assemble context.';
    yield { type: 'error', code: 'CONTEXT_BUILD_FAILED', message };
    return;
  }

  // --- 3. Assemble tools, executor, prompt, execution context --------------
  const toolsOptions = { l2Enabled: deps.l2Enabled };
  const modelFacingTools = buildModelFacingTools(deps.toolDeps, toolsOptions);
  const toolDefs: ToolDefinition[] = toModelToolDefinitions(modelFacingTools);
  const executor = buildToolExecutor(deps.toolDeps, toolsOptions);
  const systemPrompt = buildSystemPrompt(context);

  const execCtx: ToolExecutionContext = {
    userId: input.userId,
    conversationId: input.conversationId,
    currentProgramId: context.currentProgramVersion?.programId ?? null,
    currentProgramVersionId:
      context.currentProgramVersion?.programVersionId ?? null,
  };

  // --- 4. Conversation seed -------------------------------------------------
  const baseMessages: ModelMessage[] = context.conversationHistory.map((m) => ({
    role: m.role === 'USER' ? 'user' : 'assistant',
    content: m.textContent,
  }));

  // --- 5. Attempt loop ------------------------------------------------------
  //
  // `toolSegments` and `toolResultsRaw` ACCUMULATE across attempts. If the
  // model called `simulate_program_change` on attempt 0 and then failed
  // grounding, the Simulation row is already persisted (and its apply-button
  // segment already yielded to the client). A retry that only corrects prose
  // must not remove the affordance the user already saw appear.
  const toolSegments: AIMessageSegment[] = [];
  const toolResultsRaw: unknown[] = [];
  let previousAttempt: { text: string; problem: string } | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const messages: ModelMessage[] = previousAttempt
      ? [
          ...baseMessages,
          { role: 'assistant', content: previousAttempt.text },
          { role: 'user', content: buildRetryMessage(previousAttempt.problem) },
        ]
      : [...baseMessages];

    // --- 5a. Provider tool-calling loop -----------------------------------
    let finalText: string | null = null;

    while (finalText === null) {
      const request: ModelRequest = {
        messages,
        tools: toolDefs,
        systemPrompt,
      };

      let buffer = '';
      const pendingToolCalls: ToolCall[] = [];
      let stopReason: ModelResponse['stopReason'] | null = null;

      try {
        for await (const event of deps.provider.stream(request)) {
          switch (event.type) {
            case 'text_delta':
              buffer += event.text;
              break;
            case 'tool_use':
              pendingToolCalls.push(event.call);
              break;
            case 'stop':
              stopReason = event.reason;
              break;
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Provider call failed.';
        await persistErrorPath(
          deps,
          input.conversationId,
          toolSegments,
          'PROVIDER_ERROR',
        );
        yield { type: 'error', code: 'PROVIDER_ERROR', message };
        return;
      }

      if (stopReason === 'end_turn') {
        finalText = buffer;
        break;
      }

      if (stopReason === 'tool_use' && pendingToolCalls.length > 0) {
        // Record the assistant turn in the model's message history. Text
        // emitted alongside a tool call is scaffolding — it goes into the
        // history the model sees on the next iteration but is NOT emitted
        // to the client.
        const assistantBlocks: ModelContentBlock[] = [];
        if (buffer.length > 0) {
          assistantBlocks.push({ type: 'text', text: buffer });
        }
        for (const call of pendingToolCalls) {
          assistantBlocks.push({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: call.input,
          });
        }
        messages.push({ role: 'assistant', content: assistantBlocks });

        // Execute tools and emit any segments they produce.
        const toolResultBlocks: ModelContentBlock[] = [];
        for (const call of pendingToolCalls) {
          try {
            const result = await executor(call.name, call.input, execCtx);
            toolResultBlocks.push({
              type: 'tool_result',
              toolUseId: call.id,
              content: JSON.stringify(result.modelContent),
            });
            toolResultsRaw.push(result.modelContent);
            if (result.segments) {
              for (const seg of result.segments) {
                toolSegments.push(seg);
                yield { type: 'segment', segment: seg };
              }
            }
          } catch (err) {
            // A tool-execution error surfaces to the model as an is_error
            // tool_result. The model narrates it. It does NOT abort the
            // subscription — the only abort paths are provider failure and
            // the structured-output failure below.
            const message =
              err instanceof ToolExecutionError
                ? err.message
                : 'Tool execution failed.';
            toolResultBlocks.push({
              type: 'tool_result',
              toolUseId: call.id,
              content: message,
              isError: true,
            });
          }
        }
        messages.push({ role: 'user', content: toolResultBlocks });
        continue; // next iteration of the inner provider loop
      }

      // stopReason is max_tokens, error, or null — the provider stopped
      // without an end_turn or a tool_use. This is an unrecoverable turn.
      await persistErrorPath(
        deps,
        input.conversationId,
        toolSegments,
        'MODEL_STOPPED_UNEXPECTEDLY',
      );
      yield {
        type: 'error',
        code: 'MODEL_STOPPED_UNEXPECTEDLY',
        message: `The model stopped unexpectedly (stop_reason: ${stopReason}).`,
      };
      return;
    }

    // --- 5b. Parse and validate the final JSON ----------------------------
    let parsedSegments: AIMessageSegment[] | null = null;
    let problem: string | null = null;

    try {
      const parsed = parseModelOutput(finalText);
      const result = modelOutputSchema.safeParse(parsed);
      if (!result.success) {
        problem = `The response did not match the required schema: ${result.error.message}`;
      } else {
        parsedSegments = result.data.segments as AIMessageSegment[];
      }
    } catch (err) {
      problem =
        err instanceof Error
          ? err.message
          : 'The response could not be parsed as JSON.';
    }

    if (problem !== null || parsedSegments === null) {
      if (attempt === MAX_ATTEMPTS - 1) {
        // Retry exhausted on the JSON axis. There are no valid segments to
        // show, so a partial is impossible — emit the error path and persist
        // a minimal message.
        await persistErrorPath(
          deps,
          input.conversationId,
          toolSegments,
          'STRUCTURED_OUTPUT_FAILED',
        );
        yield {
          type: 'error',
          code: 'STRUCTURED_OUTPUT_FAILED',
          message:
            'The Coach produced output that could not be validated against ' +
            'the required schema.',
        };
        return;
      }
      previousAttempt = {
        text: finalText,
        problem: problem ?? 'Unknown validation problem.',
      };
      continue;
    }

    // --- 5c. Grounding check ----------------------------------------------
    const grounded = checkGrounding({
      context,
      toolResults: toolResultsRaw,
      segments: parsedSegments,
    });

    if (!grounded.ok) {
      if (attempt === MAX_ATTEMPTS - 1) {
        // Retry exhausted on the grounding axis. Q7 path: drop the offending
        // segments, keep the grounded ones, append a visible warning. The
        // whole turn does NOT fail — the user sees the parts of the response
        // that could be trusted, plus a statement that something was
        // withheld. A number is never silently dropped.
        const withWarning = dropOffendingAndAddWarning(
          parsedSegments,
          grounded.offendingSegmentIndices,
        );
        const finalSegments = [...withWarning, ...toolSegments];
        let saved: { messageId: string };
        try {
          saved = await deps.persistMessage({
            conversationId: input.conversationId,
            role: 'ASSISTANT',
            segments: finalSegments,
            model: deps.model,
            errorCode: 'GROUNDING_FAILED',
          });
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : 'Failed to persist assistant message.';
          yield { type: 'error', code: 'PERSIST_FAILED', message };
          return;
        }
        yield {
          type: 'final',
          messageId: saved.messageId,
          segments: finalSegments,
        };
        return;
      }
      const tokens = grounded.offendingTokens
        .map((t) => `"${t.token}"`)
        .join(', ');
      previousAttempt = {
        text: finalText,
        problem:
          `These numeric values did not appear anywhere in the context ` +
          `block or in a tool result this turn: ${tokens}. Every number you ` +
          `state must be grounded in the context block or in a tool result ` +
          `produced this turn.`,
      };
      continue;
    }

    // --- 5d. Success ------------------------------------------------------
    let merged: AIMessageSegment[];
    try {
      merged = mergeSegments(parsedSegments, toolSegments);
    } catch (err) {
      // The merged array failed Zod validation. This is a bug in the
      // orchestrator or a tool, not in the model. Surface it.
      const message =
        err instanceof Error ? err.message : 'Internal assembly failure.';
      await persistErrorPath(
        deps,
        input.conversationId,
        toolSegments,
        'INTERNAL_ERROR',
      );
      yield { type: 'error', code: 'INTERNAL_ERROR', message };
      return;
    }

    let saved: { messageId: string };
    try {
      saved = await deps.persistMessage({
        conversationId: input.conversationId,
        role: 'ASSISTANT',
        segments: merged,
        model: deps.model,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to persist assistant message.';
      yield { type: 'error', code: 'PERSIST_FAILED', message };
      return;
    }

    yield { type: 'final', messageId: saved.messageId, segments: merged };
    return;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function buildRetryMessage(problem: string): string {
  return (
    'Your previous response could not be accepted. The problem was:\n\n' +
    problem +
    '\n\nPlease respond again with ONLY the JSON object, no prose, no ' +
    'markdown fences.'
  );
}

/**
 * Merge the model's validated final-turn segments with the segments produced
 * by tools during the turn. Tool segments are appended AFTER the model's
 * segments — a `constraint_notice` or `apply_confirmation` is a system
 * affordance that reads naturally at the end of the narrative response.
 *
 * The merged array is re-validated against the full segment schema. This
 * catches a tool that produced a segment with an unknown type or a malformed
 * payload, which would otherwise be persisted unrendered.
 */
function mergeSegments(
  finalSegments: AIMessageSegment[],
  toolSegments: AIMessageSegment[],
): AIMessageSegment[] {
  const merged = [...finalSegments, ...toolSegments];
  const validation = z.array(aiMessageSegmentSchema).safeParse(merged);
  if (!validation.success) {
    throw new Error(
      `Merged segment array failed validation: ${validation.error.message}`,
    );
  }
  return validation.data as AIMessageSegment[];
}

/**
 * Persist a minimal assistant message on an error path. The message keeps
 * any tool segments the turn managed to produce (so an apply button the user
 * already saw appear is not lost from the record) and appends a visible
 * warning.
 *
 * The warning segment is `grounding_warning` — the same type used by Q7's
 * partial path — because it is the only segment type that says "content was
 * withheld." A more specific error type could be added, but that would
 * require widening the persisted segment union and the client renderer, and
 * Phase 8 does not need it (see the phase-file's "no new application-level
 * error classes" ruling).
 */
async function persistErrorPath(
  deps: OrchestratorDeps,
  conversationId: string,
  toolSegments: AIMessageSegment[],
  errorCode: string,
): Promise<void> {
  const warning: AIMessageSegment = {
    type: 'grounding_warning',
    content:
      'The Coach response could not be completed. Please try again.',
  };
  try {
    await deps.persistMessage({
      conversationId,
      role: 'ASSISTANT',
      segments: [warning, ...toolSegments],
      model: deps.model,
      errorCode,
    });
  } catch {
    // Best-effort. If persistence of the error path fails, the error chunk
    // already yielded to the client is the only record. Do not throw — the
    // subscription must terminate cleanly.
  }
}