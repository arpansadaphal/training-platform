// packages/api/src/services/observationService.ts
//
// Orchestration for Observation. An Observation may attach to a Session, to
// a TrainingBlock, or stand alone — 03-domain-model.md's scope rule and the
// Phase 1 schema both allow both FKs to be null simultaneously. This service
// permits the standalone case deliberately: "how did you sleep last night"
// is a real observation that belongs to neither a session nor a block.
//
// structuredFields is opaque JSON — the schema stores it as Json? and the
// domain does not shape it in Phase 6. A future phase may give it a typed
// shape (sleep hours, soreness 1-5, stress 1-5); until then it is `unknown`
// on the wire and passed through verbatim.

import {
  createObservation,
  listObservationsForBlock,
  listObservationsForSession,
  type ObservationRecord,
} from "@training/db";
import {
  loadOwnedSessionOrThrow,
  loadOwnedTrainingBlockOrThrow,
} from "./loadOwnedExecution";

export interface CreateObservationInput {
  sessionId?: string | null;
  trainingBlockId?: string | null;
  content: string;
  structuredFields?: unknown;
}

/**
 * Creates an Observation owned by the caller. When sessionId is provided,
 * the caller must own that session's block; when trainingBlockId is
 * provided, the caller must own that block. Both null is allowed — a
 * standalone observation is not an error.
 */
export async function createMyObservation(
  userId: string,
  input: CreateObservationInput,
): Promise<ObservationRecord> {
  if (input.sessionId) {
    await loadOwnedSessionOrThrow(userId, input.sessionId);
  }
  if (input.trainingBlockId) {
    await loadOwnedTrainingBlockOrThrow(userId, input.trainingBlockId);
  }
  return createObservation({
    userId,
    sessionId: input.sessionId ?? null,
    trainingBlockId: input.trainingBlockId ?? null,
    content: input.content,
    structuredFields: input.structuredFields,
  });
}

/**
 * Every observation relevant to a block, oldest-first. Includes observations
 * attached directly to the block AND observations attached to sessions
 * within the block — the natural "what did the user say during this block"
 * view, which is what Phase 7's Review reads.
 */
export async function listMyObservationsForBlock(
  userId: string,
  blockId: string,
): Promise<ObservationRecord[]> {
  await loadOwnedTrainingBlockOrThrow(userId, blockId);
  return listObservationsForBlock(blockId);
}

export async function listMyObservationsForSession(
  userId: string,
  sessionId: string,
): Promise<ObservationRecord[]> {
  await loadOwnedSessionOrThrow(userId, sessionId);
  return listObservationsForSession(sessionId);
}