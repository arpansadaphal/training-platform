// Repository layer for ProgramVersion and its nested structure rows.
//
// Per ARCH-012, a ProgramVersion stores BOTH:
//   1. structureSnapshot — canonical immutable JSON
//   2. normalized WorkoutDay/ExercisePrescription rows — derived projection
//
// Both are written in the same transaction and never independently edited.
//
// TRANSACTION TIMEOUT NOTE:
// Remote Neon dev branch latency can exceed Prisma's default 5s transaction
// timeout; 20s gives headroom without masking genuine deadlocks (Postgres
// still enforces its own lock timeout). The maxWait bump (default 2s -> 10s)
// accounts for the same latency when acquiring a connection from the pool.
// This only affects the interactive-transaction path — single-statement
// calls in the other repositories are unaffected.

import { Prisma } from "@prisma/client";
import { prisma } from "../client";

export type VersionOrigin = "MANUAL_COMMIT" | "AI_APPLIED_SIMULATION";

export interface ProgramVersionRecord {
  id: string;
  programId: string;
  versionNumber: number;
  structureSnapshot: unknown; // ProgramStructure — see @training/domain types
  createdVia: VersionOrigin;
  createdAt: Date;
}

const VERSION_SELECT = {
  id: true,
  programId: true,
  versionNumber: true,
  structureSnapshot: true,
  createdVia: true,
  createdAt: true,
} as const;

// Explicit transaction options for the one interactive transaction in this
// file. Exported so a test can reference the same numbers rather than
// hardcoding them.
const TRANSACTION_OPTIONS = { timeout: 20000, maxWait: 10000 } as const;

export async function findVersionById(
  id: string,
): Promise<ProgramVersionRecord | null> {
  return prisma.programVersion.findUnique({
    where: { id },
    select: VERSION_SELECT,
  });
}

export async function listVersionsByProgram(
  programId: string,
): Promise<ProgramVersionRecord[]> {
  return prisma.programVersion.findMany({
    where: { programId },
    select: VERSION_SELECT,
    orderBy: { versionNumber: "desc" },
  });
}

/**
 * Round-trip read: returns a ProgramVersion with its normalized
 * WorkoutDay / ExercisePrescription rows expanded, for tests and for
 * any caller that wants the projected view.
 */
export async function findVersionWithStructure(id: string) {
  return prisma.programVersion.findUnique({
    where: { id },
    select: {
      ...VERSION_SELECT,
      workoutDays: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          orderIndex: true,
          name: true,
          prescriptions: {
            orderBy: { orderIndex: "asc" },
            select: {
              id: true,
              orderIndex: true,
              exerciseId: true,
              targetSets: true,
              targetRepsLow: true,
              targetRepsHigh: true,
              targetRpe: true,
              loadScheme: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Writes a new ProgramVersion together with its derived normalized rows
 * in a single transaction. The `structureSnapshot` is authoritative;
 * the `workoutDays`/`prescriptions` input is the derived projection of it.
 *
 * This function does NOT flip the Program's activeVersionId — that is done
 * by the service layer, in the same surrounding transaction, per Phase 4's
 * eventual Commit flow.
 */
export async function createProgramVersion(input: {
  programId: string;
  versionNumber: number;
  structureSnapshot: unknown;
  createdVia: VersionOrigin;
  workoutDays: Array<{
    orderIndex: number;
    name: string;
    prescriptions: Array<{
      orderIndex: number;
      exerciseId: string;
      targetSets: number;
      targetRepsLow: number;
      targetRepsHigh: number;
      targetRpe?: number | null;
      loadScheme: unknown;
    }>;
  }>;
}): Promise<ProgramVersionRecord> {
  return prisma.$transaction(async (tx) => {
    const version = await tx.programVersion.create({
      data: {
        programId: input.programId,
        versionNumber: input.versionNumber,
        structureSnapshot: input.structureSnapshot as Prisma.InputJsonValue,
        createdVia: input.createdVia,
      },
      select: VERSION_SELECT,
    });

    for (const day of input.workoutDays) {
      const createdDay = await tx.workoutDay.create({
        data: {
          programVersionId: version.id,
          orderIndex: day.orderIndex,
          name: day.name,
        },
        select: { id: true },
      });

      for (const p of day.prescriptions) {
        await tx.exercisePrescription.create({
          data: {
            workoutDayId: createdDay.id,
            orderIndex: p.orderIndex,
            exerciseId: p.exerciseId,
            targetSets: p.targetSets,
            targetRepsLow: p.targetRepsLow,
            targetRepsHigh: p.targetRepsHigh,
            targetRpe: p.targetRpe ?? null,
            loadScheme: p.loadScheme as Prisma.InputJsonValue,
          },
        });
      }
    }

    return version;
  }, TRANSACTION_OPTIONS);
}

/**
 * Returns the highest versionNumber currently used for a Program, or 0 if none.
 * Caller computes the next number (N+1). No separate counter table.
 */
export async function getMaxVersionNumber(programId: string): Promise<number> {
  const row = await prisma.programVersion.findFirst({
    where: { programId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return row?.versionNumber ?? 0;
}