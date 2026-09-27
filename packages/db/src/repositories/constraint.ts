import type { Constraint, TemporaryConstraint } from '@prisma/client';

import { prisma } from '../client';

/**
 * Constraint and TemporaryConstraint repositories.
 *
 * SCOPE (read this before changing any name in this file):
 *   - Constraint is scoped to a USER. It persists across programs and
 *     conversations.
 *   - TemporaryConstraint is scoped to an AIConversation — a Coach chat
 *     thread. NOT a workout Session. The FK column is `aiConversationId`,
 *     not `conversationId`. Every parameter and variable in that section
 *     says `conversation`, matching the entity it references.
 *
 * Field names are matched to schema.prisma exactly:
 *
 *   Constraint:          id, userId, kind, exerciseId, movementPattern,
 *                        note, active, createdAt
 *   TemporaryConstraint: id, userId, aiConversationId, note, createdAt
 *
 * If a future phase adds columns, extend the record and mapper together.
 */

export type ConstraintKind =
  | 'EXERCISE_AVOIDANCE'
  | 'MOVEMENT_PATTERN_AVOIDANCE'
  | 'FREEFORM';

export interface ConstraintRecord {
  id: string;
  userId: string;
  kind: ConstraintKind;
  exerciseId: string | null;
  movementPattern: string | null;
  note: string;
  active: boolean;
  createdAt: Date;
}

export interface TemporaryConstraintRecord {
  id: string;
  userId: string;
  aiConversationId: string;
  note: string;
  createdAt: Date;
}

function toConstraintRecord(row: Constraint): ConstraintRecord {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind as ConstraintKind,
    exerciseId: row.exerciseId,
    movementPattern: row.movementPattern as string | null,
    note: row.note,
    active: row.active,
    createdAt: row.createdAt,
  };
}

function toTemporaryConstraintRecord(
  row: TemporaryConstraint,
): TemporaryConstraintRecord {
  return {
    id: row.id,
    userId: row.userId,
    aiConversationId: row.aiConversationId,
    note: row.note,
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Constraint (persistent, user-scoped)
// ---------------------------------------------------------------------------

export async function createConstraint(input: {
  userId: string;
  kind: ConstraintKind;
  note: string;
}): Promise<ConstraintRecord> {
  const row = await prisma.constraint.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      note: input.note,
    },
  });
  return toConstraintRecord(row);
}

export async function findConstraintById(
  id: string,
): Promise<ConstraintRecord | null> {
  const row = await prisma.constraint.findUnique({ where: { id } });
  return row ? toConstraintRecord(row) : null;
}

export async function listConstraintsForUser(
  userId: string,
  options: { limit: number },
): Promise<ConstraintRecord[]> {
  const rows = await prisma.constraint.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: options.limit,
  });
  return rows.map(toConstraintRecord);
}

export async function updateConstraint(
  id: string,
  input: { kind: ConstraintKind; note: string },
): Promise<ConstraintRecord> {
  const row = await prisma.constraint.update({
    where: { id },
    data: { kind: input.kind, note: input.note },
  });
  return toConstraintRecord(row);
}

export async function deleteConstraint(id: string): Promise<boolean> {
  const result = await prisma.constraint.deleteMany({ where: { id } });
  return result.count > 0;
}

// ---------------------------------------------------------------------------
// TemporaryConstraint (scoped to an AIConversation, not a workout Session)
// ---------------------------------------------------------------------------

export async function createTemporaryConstraint(input: {
  userId: string;
  aiConversationId: string;
  note: string;
}): Promise<TemporaryConstraintRecord> {
  const row = await prisma.temporaryConstraint.create({
    data: {
      userId: input.userId,
      aiConversationId: input.aiConversationId,
      note: input.note,
    },
  });
  return toTemporaryConstraintRecord(row);
}

export async function findTemporaryConstraintById(
  id: string,
): Promise<TemporaryConstraintRecord | null> {
  const row = await prisma.temporaryConstraint.findUnique({ where: { id } });
  return row ? toTemporaryConstraintRecord(row) : null;
}

export async function listTemporaryConstraintsForConversation(
  aiConversationId: string,
  options: { limit: number },
): Promise<TemporaryConstraintRecord[]> {
  const rows = await prisma.temporaryConstraint.findMany({
    where: { aiConversationId },
    orderBy: { createdAt: 'asc' },
    take: options.limit,
  });
  return rows.map(toTemporaryConstraintRecord);
}