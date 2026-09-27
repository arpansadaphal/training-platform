import {
  createAIConversation,
  createAIMessage,
  findAIConversationById,
  findScopedConversation,
  listAIConversationsForUser,
  listAIMessagesForConversation,
  touchConversationLastMessageAt,
  type AIConversationRecord,
  type AIMessageRecord,
  type AIMessageRole,
} from '@training/db';

import type { AIMessageForContext } from '@training/ai';

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
): Promise<AIConversationRecord> {
  const existing = await findScopedConversation({
    userId,
    programId: scope.programId,
    programVersionId: scope.programVersionId,
  });
  if (existing) return existing;
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