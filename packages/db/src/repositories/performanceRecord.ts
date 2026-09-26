// packages/db/src/repositories/performanceRecord.ts
//
// Repository layer for PerformanceRecord (a logged set).
//
// The "honesty requirement" (08-training-execution-and-evidence.md) is a
// SERVICE-layer rule, not a repository rule: a PerformanceRecord stores
// exactly what the user logged, even when it deviates from the prescription.
// This file performs no validation and no reconciliation against
// ExercisePrescription — it inserts whatever it is handed.
//
// Decimal handling: actualLoad and actualRpe are Prisma.Decimal columns.
// Prisma returns them as Prisma.Decimal instances, which JSON-serialize as
// strings and would reach the tRPC client as strings rather than numbers.
// The mapper below converts to plain numbers at the packages/db boundary,
// so packages/api and the web UI only ever see `number | null`. This is the
// same boundary discipline as the `as Prisma.InputJsonValue` casts (ARCH-010)
// — the repository is where Prisma-shaped values stop.

import { type Prisma } from "@prisma/client";
import { prisma } from "../client";

export interface PerformanceRecordRecord {
  id: string;
  sessionId: string;
  exercisePrescriptionId: string;
  setIndex: number;
  actualReps: number | null;
  actualLoad: number | null;
  actualRpe: number | null;
  completedAt: Date;
}

const PERFORMANCE_RECORD_SELECT = {
  id: true,
  sessionId: true,
  exercisePrescriptionId: true,
  setIndex: true,
  actualReps: true,
  actualLoad: true,
  actualRpe: true,
  completedAt: true,
} as const;

interface RawPerformanceRecord {
  id: string;
  sessionId: string;
  exercisePrescriptionId: string;
  setIndex: number;
  actualReps: number | null;
  actualLoad: Prisma.Decimal | null;
  actualRpe: Prisma.Decimal | null;
  completedAt: Date;
}

function toRecord(row: RawPerformanceRecord): PerformanceRecordRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    exercisePrescriptionId: row.exercisePrescriptionId,
    setIndex: row.setIndex,
    actualReps: row.actualReps,
    actualLoad: row.actualLoad === null ? null : row.actualLoad.toNumber(),
    actualRpe: row.actualRpe === null ? null : row.actualRpe.toNumber(),
    completedAt: row.completedAt,
  };
}

export interface CreatePerformanceRecordInput {
  sessionId: string;
  exercisePrescriptionId: string;
  setIndex: number;
  actualReps?: number | null;
  actualLoad?: number | null;
  actualRpe?: number | null;
}

export async function createPerformanceRecord(
  input: CreatePerformanceRecordInput,
): Promise<PerformanceRecordRecord> {
  const row = await prisma.performanceRecord.create({
    data: {
      sessionId: input.sessionId,
      exercisePrescriptionId: input.exercisePrescriptionId,
      setIndex: input.setIndex,
      actualReps: input.actualReps ?? null,
      actualLoad: input.actualLoad ?? null,
      actualRpe: input.actualRpe ?? null,
    },
    select: PERFORMANCE_RECORD_SELECT,
  });
  return toRecord(row);
}

/**
 * Batch-insert in a single transaction. `performance.logBatch` uses this to
 * minimize round-trips during an actual workout (one HTTP call for a whole
 * exercise's sets rather than N).
 *
 * Preserves input order in the returned array — Prisma's array-form
 * $transaction resolves to an array of results in input order.
 *
 * Empty input is a no-op returning [] rather than issuing a degenerate
 * transaction.
 */
export async function createPerformanceRecordsBatch(
  inputs: CreatePerformanceRecordInput[],
): Promise<PerformanceRecordRecord[]> {
  if (inputs.length === 0) return [];
  const rows = await prisma.$transaction(
    inputs.map((input) =>
      prisma.performanceRecord.create({
        data: {
          sessionId: input.sessionId,
          exercisePrescriptionId: input.exercisePrescriptionId,
          setIndex: input.setIndex,
          actualReps: input.actualReps ?? null,
          actualLoad: input.actualLoad ?? null,
          actualRpe: input.actualRpe ?? null,
        },
        select: PERFORMANCE_RECORD_SELECT,
      }),
    ),
  );
  return rows.map(toRecord);
}

/**
 * Lists every logged set for a Session, oldest-first. Phase 7's Review reads
 * from this to compute per-prescription adherence summaries; Phase 6 uses
 * it only for the session-detail page.
 */
export async function listPerformanceRecordsForSession(
  sessionId: string,
): Promise<PerformanceRecordRecord[]> {
  const rows = await prisma.performanceRecord.findMany({
    where: { sessionId },
    orderBy: [{ completedAt: "asc" }, { setIndex: "asc" }],
    select: PERFORMANCE_RECORD_SELECT,
  });
  return rows.map(toRecord);
}