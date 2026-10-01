import {
  createAIConversation,
  createAIMessage,
  findAIConversationById,
  findScopedConversation,
  findVersionById,
  listAIConversationsForUser,
  listAIMessagesForConversation,
  touchConversationLastMessageAt,
  type AIConversationRecord,
  type AIMessageRecord,
  type AIMessageRole,
} from '@training/db';
import { TRPCError } from '@trpc/server';

import type { AIMessageForContext } from '@training/ai';
import { loadOwnedProgramOrThrow } from './loadOwnedProgram';

/**
 * Coach conversation service — orchestration between the coach router (and
 * the Coach's context builder) and the AIConversation / AIMessage persistence
 * layer.
 *
 * SCOPE discipline: AIConversation is a Coach chat thread. Never a workout
 * Session. Every function in this file says `conversation`, never `session`.
 *
 * OWNERSHIP discipline: every load* function takes `userId` from the caller's
 * session and returns null when the row exists but is not owned. Callers map
 * null to NOT_FOUND (ARCH-040).
 *
 * ARCH-049 (Phase 9 hardening fix): getOrCreateScopedConversation now
 * verifies the caller owns any explicitly-supplied programId /
 * programVersionId before creating a conversation row. Before the fix, the
 * openConversation router procedure accepted arbitrary scope inputs without
 * an ownership check — a caller could create an AIConversation row whose
 * `programId` pointed at a Program they do not own. The conversation was
 * only ever readable by its creator (the find path filters on userId), so
 * this was a data-integrity issue rather than a cross-user leak: the user
 * would end up with a Coach whose context builder silently returns null
 * because loadScopedProgramVersion's ownership check rejects the foreign
 * programId, and they would have no way to diagnose why the Coach seemed to
 * not know about the program they thought they were chatting about.
 */

export async function listConversationsForUser(
  userId: string,
  options: { limit: number },
): Promise<AIConversationRecord[]> {
  return listAIConversationsForUser(userId, { limit: options.limit });
}

export async function loadOwnedConversation(
  userId: string,
  conversationId: string,
): Promise<AIConversationRecord | null> {
  const row = await findAIConversationById(conversationId);
  if (!row || row.userId !== userId) return null;
  return row;
}

export async function getOrCreateScopedConversation(
  userId: string,
  scope: {
    programId: string | null;
    programVersionId: string | null;
  },
  options: { forceNew?: boolean } = {},
): Promise<AIConversationRecord> {
  // ARCH-049: verify the caller owns the scope. A conversation must never
  // point at a Program the userId does not own.
  //
  // Two shapes of non-null scope are legal in the input schema:
  //   (programId, programVersionId)  — the Review path via
  //                                    openConversationForBlock. Caller must
  //                                    own the program.
  //   (programId, null)              — the program-scoped Coach path.
  //                                    Caller must own the program.
  //   (null, programVersionId)       — theoretically reachable via the
  //                                    openConversation input schema, but
  //                                    no current caller produces it. We
  //                                    resolve the version's parent program
  //                                    and check ownership on it.
  //
  // The scope-less path (null, null) is not checked here — the router's
  // auto-scope branch resolves it via getPrimaryProgramId, which already
  // returns an owned program id (or null).
  //
  // Placed in the service rather than the router so both call sites
  // (openConversation and openConversationForBlock) get the check, and so
  // this file's test suite exercises it.
  if (scope.programId !== null) {
    await loadOwnedProgramOrThrow(userId, scope.programId);
  } else if (scope.programVersionId !== null) {
    const version = await findVersionById(scope.programVersionId);
    if (!version) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Program version not found.',
      });
    }
    await loadOwnedProgramOrThrow(userId, version.programId);
  }

  // forceNew: skip the lookup and always create. Used by /app/coach's
  // "+ New" button, whose label promises a fresh chat. Callers that want
  // the canonical conversation for a scope (the Review path, and any
  // future "open my program chat" affordance) leave this unset and get
  // get-or-create behavior.
  if (!options.forceNew) {
    const existing = await findScopedConversation({
      userId,
      programId: scope.programId,
      programVersionId: scope.programVersionId,
    });
    if (existing) return existing;
  }
  return createAIConversation({
    userId,
    programId: scope.programId,
    programVersionId: scope.programVersionId,
  });
}

export async function listMessagesForConversation(
  conversationId: string,
): Promise<AIMessageRecord[]> {
  return listAIMessagesForConversation(conversationId, { limit: 500 });
}

/**
 * Persist an AIMessage, and touch the conversation's lastMessageAt so the
 * conversation list orders by recency.
 *
 * The two writes are sequential, not transactional. If the touch fails, the
 * message is still written and the list will lag by one — a benign
 * degradation. A transaction here would be correct but the failure mode is
 * cosmetic and the extra round-trip is per-message; left sequential
 * deliberately.
 */
export async function persistConversationMessage(input: {
  conversationId: string;
  role: AIMessageRole;
  segments: unknown[];
  /**
   * Accepted but not persisted — the AIMessage schema has no column for
   * these. Kept on the interface so the orchestrator's PersistMessageInput
   * shape is stable; a later phase that adds columns forwards them here.
   */
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
  errorCode?: string;
}): Promise<{ messageId: string }> {
  const row = await createAIMessage({
    aiConversationId: input.conversationId,
    role: input.role,
    segments: input.segments,
  });
  await touchConversationLastMessageAt(input.conversationId);
  return { messageId: row.id };
}

/**
 * Project persisted messages to the shape the context builder consumes.
 *
 * `textContent` concatenates text and claim segment contents. Non-text
 * segments (apply_confirmation, constraint_notice, grounding_warning) are
 * UI affordances and are deliberately omitted — the model sees the
 * conversational content, not the render payloads.
 */
export async function listRecentMessagesForContext(input: {
  conversationId: string;
  limit: number;
}): Promise<AIMessageForContext[]> {
  const rows = await listAIMessagesForConversation(input.conversationId, {
    limit: input.limit,
  });
  return rows
    .filter((r) => r.role === 'USER' || r.role === 'ASSISTANT')
    .map((r) => ({
      id: r.id,
      role: r.role as 'USER' | 'ASSISTANT',
      textContent: extractTextContent(r.segments),
      createdAtISO: r.createdAt.toISOString(),
    }));
}

function extractTextContent(segments: unknown): string {
  if (!Array.isArray(segments)) return '';
  const parts: string[] = [];
  for (const seg of segments) {
    if (!seg || typeof seg !== 'object') continue;
    const s = seg as Record<string, unknown>;
    if (
      (s.type === 'text' || s.type === 'claim') &&
      typeof s.content === 'string'
    ) {
      parts.push(s.content);
    }
  }
  return parts.join('\n\n');
}

/**
 * Ownership-check hook consumed by constraintService's temporary-constraint
 * functions. Lives here rather than in constraintService to keep the
 * conversation repository import in one place.
 */
export async function loadConversationOwner(
  conversationId: string,
): Promise<{ userId: string } | null> {
  const row = await findAIConversationById(conversationId);
  return row ? { userId: row.userId } : null;
}