import {
  createConstraint as repoCreateConstraint,
  createTemporaryConstraint as repoCreateTemporaryConstraint,
  deleteConstraint as repoDeleteConstraint,
  findConstraintById,
  listConstraintsForUser as repoListConstraintsForUser,
  listTemporaryConstraintsForConversation as repoListTemporaryConstraintsForConversation,
  updateConstraint as repoUpdateConstraint,
} from '@training/db';

import type {
  ConstraintKind,
  ConstraintRecord,
  TemporaryConstraintRecord,
} from '@training/db';

import { loadConversationOwner } from './coachConversationService';

/**
 * Constraint service — the orchestration layer between the tRPC routers (and
 * the Coach's tool deps) and the persistence layer.
 *
 * Two responsibilities:
 *
 *   1. Ownership enforcement. Every `*Owned*` function takes `userId` as a
 *      session-derived argument and returns null when the row exists but is
 *      not owned by that user. The caller turns null into NOT_FOUND (ARCH-040
 *      non-disclosure: "not yours" and "does not exist" are indistinguishable
 *      to the client).
 *
 *   2. The TemporaryConstraint scope trap. Every function in that section
 *      says `conversation`, never `session`. AIConversation, not workout
 *      Session. See 03-domain-model.md's terminology note.
 */

// ---------------------------------------------------------------------------
// Persistent Constraint (user-scoped)
// ---------------------------------------------------------------------------

export async function listConstraintsForUser(input: {
  userId: string;
  limit: number;
}): Promise<ConstraintRecord[]> {
  return repoListConstraintsForUser(input.userId, { limit: input.limit });
}

export async function loadOwnedConstraint(input: {
  userId: string;
  constraintId: string;
}): Promise<ConstraintRecord | null> {
  const row = await findConstraintById(input.constraintId);
  if (!row || row.userId !== input.userId) return null;
  return row;
}

export async function createConstraint(input: {
  userId: string;
  kind: ConstraintKind;
  note: string;
}): Promise<ConstraintRecord> {
  return repoCreateConstraint({
    userId: input.userId,
    kind: input.kind,
    note: input.note,
  });
}

export async function updateOwnedConstraint(input: {
  userId: string;
  constraintId: string;
  kind: ConstraintKind;
  note: string;
}): Promise<ConstraintRecord> {
  const owned = await loadOwnedConstraint({
    userId: input.userId,
    constraintId: input.constraintId,
  });
  if (!owned) {
    throw new Error('Constraint not found or not owned by caller.');
  }
  return repoUpdateConstraint(input.constraintId, {
    kind: input.kind,
    note: input.note,
  });
}

export async function deleteOwnedConstraint(input: {
  userId: string;
  constraintId: string;
}): Promise<boolean> {
  const owned = await loadOwnedConstraint({
    userId: input.userId,
    constraintId: input.constraintId,
  });
  if (!owned) return false;
  return repoDeleteConstraint(input.constraintId);
}

// ---------------------------------------------------------------------------
// TemporaryConstraint (scoped to an AIConversation)
//
// `loadConversationOwner` is imported directly rather than injected. Its only
// use here is the ownership check below; there is no cycle with
// coachConversationService (which does not import this file), and a
// single-field DI bag with two callers was ceremony without payoff. If a
// cycle ever emerges, reintroduce the injection with a note explaining why.
// ---------------------------------------------------------------------------

export async function createTemporaryConstraintForConversation(input: {
  userId: string;
  conversationId: string;
  note: string;
}): Promise<TemporaryConstraintRecord | null> {
  const conversation = await loadConversationOwner(input.conversationId);
  if (!conversation || conversation.userId !== input.userId) return null;
  return repoCreateTemporaryConstraint({
    userId: input.userId,
    aiConversationId: input.conversationId,
    note: input.note,
  });
}

export async function listTemporaryConstraintsForConversation(input: {
  userId: string;
  conversationId: string;
  limit: number;
}): Promise<TemporaryConstraintRecord[] | null> {
  const conversation = await loadConversationOwner(input.conversationId);
  if (!conversation || conversation.userId !== input.userId) return null;
  return repoListTemporaryConstraintsForConversation(input.conversationId, {
    limit: input.limit,
  });
}