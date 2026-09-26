// packages/api/src/services/loadOwnedExecution.ts
//
// Ownership helpers for Phase 6's execution entities (Session, TrainingBlock).
// Mirrors loadOwnedProgramOrThrow's non-disclosure rule exactly: a caller who
// does not own the entity receives NOT_FOUND, never FORBIDDEN, so the API does
// not leak the existence of another user's data.
//
// Both helpers live in one file (unlike loadOwnedProgram.ts's single helper)
// because they are always used together by the four Phase 6 services and are
// never imported separately. The module's responsibility is "ownership checks
// for the execution layer," and both functions serve exactly that.

import { TRPCError } from "@trpc/server";
import {
  findSessionById,
  findTrainingBlockById,
  type SessionRecord,
  type TrainingBlockRecord,
} from "@training/db";

/**
 * Loads a workout Session by id, then verifies the caller owns the
 * TrainingBlock it belongs to. Returns NOT_FOUND if either the Session does
 * not exist or the block's userId is not the caller's — same non-disclosure
 * rule as loadOwnedProgramOrThrow.
 */
export async function loadOwnedSessionOrThrow(
  userId: string,
  sessionId: string,
): Promise<SessionRecord> {
  const session = await findSessionById(sessionId);
  if (!session) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
  }
  const block = await findTrainingBlockById(session.trainingBlockId);
  if (!block || block.userId !== userId) {
    // Deliberately NOT_FOUND, not FORBIDDEN — do not reveal that another
    // user's Session exists.
    throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
  }
  return session;
}

/**
 * Loads a TrainingBlock by id, then verifies the caller owns it. Same
 * non-disclosure rule.
 */
export async function loadOwnedTrainingBlockOrThrow(
  userId: string,
  blockId: string,
): Promise<TrainingBlockRecord> {
  const block = await findTrainingBlockById(blockId);
  if (!block || block.userId !== userId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Training block not found",
    });
  }
  return block;
}