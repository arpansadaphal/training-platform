import type { AIConversation, AIMessage } from '@prisma/client';
import { type Prisma } from '@prisma/client';

import { prisma } from '../client';

/**
 * AIConversation and AIMessage repositories.
 *
 * SCOPE: AIConversation is a Coach chat thread. Never a workout Session.
 * The overloaded word "session" is why every parameter and field in this
 * file says `conversation`, never `session`. See 03-domain-model.md.
 *
 * Records are plain TypeScript — Prisma types never escape this boundary
 * (ARCH-010). Field names are matched to schema.prisma exactly:
 *
 *   AIConversation: id, userId, programId, programVersionId, lastMessageAt,
 *                   createdAt
 *   AIMessage:      id, aiConversationId, role, segments, rawToolCalls,
 *                   createdAt
 *
 * If the schema is extended in a later phase, extend the record and the
 * mapper together — never add a field to the record before the column exists.
 */

export type AIMessageRole = 'USER' | 'ASSISTANT' | 'TOOL';

export interface AIConversationRecord {
  id: string;
  userId: string;
  programId: string | null;
  programVersionId: string | null;
  lastMessageAt: Date;
  createdAt: Date;
}

export interface AIMessageRecord {
  id: string;
  aiConversationId: string;
  role: AIMessageRole;
  segments: unknown;
  rawToolCalls: unknown;
  createdAt: Date;
}

function toConversationRecord(row: AIConversation): AIConversationRecord {
  return {
    id: row.id,
    userId: row.userId,
    programId: row.programId,
    programVersionId: row.programVersionId,
    lastMessageAt: row.lastMessageAt,
    createdAt: row.createdAt,
  };
}

function toMessageRecord(row: AIMessage): AIMessageRecord {
  return {
    id: row.id,
    aiConversationId: row.aiConversationId,
    role: row.role as AIMessageRole,
    segments: row.segments,
    rawToolCalls: row.rawToolCalls,
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export async function createAIConversation(input: {
  userId: string;
  programId: string | null;
  programVersionId: string | null;
}): Promise<AIConversationRecord> {
  const row = await prisma.aIConversation.create({
    data: {
      userId: input.userId,
      programId: input.programId,
      programVersionId: input.programVersionId,
    },
  });
  return toConversationRecord(row);
}

export async function findAIConversationById(
  id: string,
): Promise<AIConversationRecord | null> {
  const row = await prisma.aIConversation.findUnique({ where: { id } });
  return row ? toConversationRecord(row) : null;
}

export async function listAIConversationsForUser(
  userId: string,
  options: { limit: number },
): Promise<AIConversationRecord[]> {
  const rows = await prisma.aIConversation.findMany({
    where: { userId },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    take: options.limit,
  });
  return rows.map(toConversationRecord);
}

/**
 * Find the conversation scoped to a (userId, programId, programVersionId)
 * tuple, or null if none exists yet.
 *
 * When both programId and programVersionId are null, this is a "general"
 * conversation (the dedicated /app/coach route's new-conversation case).
 */
export async function findScopedConversation(input: {
  userId: string;
  programId: string | null;
  programVersionId: string | null;
}): Promise<AIConversationRecord | null> {
  const row = await prisma.aIConversation.findFirst({
    where: {
      userId: input.userId,
      programId: input.programId,
      programVersionId: input.programVersionId,
    },
    orderBy: { createdAt: 'desc' },
  });
  return row ? toConversationRecord(row) : null;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function createAIMessage(input: {
  aiConversationId: string;
  role: AIMessageRole;
  segments: unknown;
  rawToolCalls?: unknown;
}): Promise<AIMessageRecord> {
  const data: Prisma.AIMessageUncheckedCreateInput = {
    aiConversationId: input.aiConversationId,
    role: input.role,
    segments: input.segments as Prisma.InputJsonValue,
    ...(input.rawToolCalls !== undefined
      ? { rawToolCalls: input.rawToolCalls as Prisma.InputJsonValue }
      : {}),
  };
  const row = await prisma.aIMessage.create({ data });
  return toMessageRecord(row);
}

export async function listAIMessagesForConversation(
  conversationId: string,
  options: { limit: number },
): Promise<AIMessageRecord[]> {
  const rows = await prisma.aIMessage.findMany({
    where: { aiConversationId: conversationId },
    orderBy: { createdAt: 'asc' },
    take: options.limit,
  });
  return rows.map(toMessageRecord);
}

/**
 * Update the conversation's lastMessageAt to now. Called after each message
 * write so the conversation list orders by recency.
 */
export async function touchConversationLastMessageAt(
  id: string,
): Promise<void> {
  await prisma.aIConversation.update({
    where: { id },
    data: { lastMessageAt: new Date() },
  });
}