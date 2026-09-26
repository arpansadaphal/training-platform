// packages/db/src/repositories/observation.ts
//
// Repository layer for Observation.
//
// An Observation is user-entered subjective data (RPE notes, soreness,
// life-context notes). Per 03-domain-model.md, it may attach to a Session,
// to a TrainingBlock, or stand alone — both sessionId and trainingBlockId
// are nullable by schema and Phase 6 does not require at least one.
//
// structuredFields is opaque JSON from Prisma's perspective. It arrives as
// a plain object from the caller; the `as Prisma.InputJsonValue` cast at
// the boundary is the same discipline as elsewhere in this package
// (ARCH-010). A caller that wants a specific shape validates it upstream.
//
// IMPORTANT for Json columns: a raw `null` is NOT assignable to Prisma's
// `InputJsonValue` — the column type is a union of
// `NullableJsonNullValueInput | InputJsonValue`, where the null-ish value
// must be `Prisma.DbNull` (SQL NULL) or `Prisma.JsonNull` (the JSON literal
// `null`). Phase 6 uses SQL NULL, which is what an absent field means here.
// The cleanest way to express that is to OMIT the key entirely when the
// caller did not supply structuredFields — Prisma then writes SQL NULL for
// the column. (Setting the key to `Prisma.DbNull` would also work; omission
// keeps the create call free of any Prisma-specific sentinel.)

import { type Prisma } from "@prisma/client";
import { prisma } from "../client";

export interface ObservationRecord {
  id: string;
  userId: string;
  sessionId: string | null;
  trainingBlockId: string | null;
  content: string;
  structuredFields: unknown;
  createdAt: Date;
}

const OBSERVATION_SELECT = {
  id: true,
  userId: true,
  sessionId: true,
  trainingBlockId: true,
  content: true,
  structuredFields: true,
  createdAt: true,
} as const;

export interface CreateObservationInput {
  userId: string;
  sessionId?: string | null;
  trainingBlockId?: string | null;
  content: string;
  structuredFields?: unknown;
}

export async function createObservation(
  input: CreateObservationInput,
): Promise<ObservationRecord> {
  return prisma.observation.create({
    data: {
      userId: input.userId,
      sessionId: input.sessionId ?? null,
      trainingBlockId: input.trainingBlockId ?? null,
      content: input.content,
      // Spread-conditional: the `structuredFields` key is present only when
      // the caller supplied a value. When absent, Prisma writes SQL NULL
      // for the Json column — matching the semantics of the interface
      // (`structuredFields?: unknown`). Assigning `null` directly would be
      // a type error: Prisma requires `Prisma.DbNull` / `Prisma.JsonNull`
      // sentinels for explicit nulls on Json columns.
      ...(input.structuredFields === undefined
        ? {}
        : {
            structuredFields: input.structuredFields as Prisma.InputJsonValue,
          }),
    },
    select: OBSERVATION_SELECT,
  });
}

export async function findObservationById(
  id: string,
): Promise<ObservationRecord | null> {
  return prisma.observation.findUnique({
    where: { id },
    select: OBSERVATION_SELECT,
  });
}

/**
 * Every observation relevant to a block, oldest-first. Returns both:
 *   - observations attached directly to the block (trainingBlockId = blockId)
 *   - observations attached to any Session within the block
 *
 * That union is the natural "what did the user say during this block" view,
 * which is what Phase 7's Review needs. A caller that wants only the
 * block-level ones filters client-side.
 */
export async function listObservationsForBlock(
  blockId: string,
): Promise<ObservationRecord[]> {
  return prisma.observation.findMany({
    where: {
      OR: [
        { trainingBlockId: blockId },
        { session: { trainingBlockId: blockId } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: OBSERVATION_SELECT,
  });
}

export async function listObservationsForSession(
  sessionId: string,
): Promise<ObservationRecord[]> {
  return prisma.observation.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: OBSERVATION_SELECT,
  });
}