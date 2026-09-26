// Repository layer for ProgramVersion and its nested structure rows.
//
// Per ARCH-012, a ProgramVersion stores BOTH:
//   1. structureSnapshot — canonical immutable JSON
//   2. normalized WorkoutDay/ExercisePrescription rows — derived projection
//
// Both are written in the same transaction and never independently edited.
//
// Phase 4 changes:
//  - TRANSACTION_OPTIONS is now exported so the commit service composes the
//    wider commit transaction (version + revision + snapshot + active-pointer
//    + draft-status) under the same timeout/maxWait policy (ARCH-026).
//  - The inner write of createProgramVersion is extracted to
//    createProgramVersionInTx(tx, input) so the service can call it inside an
//    outer transaction. The original createProgramVersion(input) remains as a
//    thin wrapper, so any Phase-1-era caller keeps working.
//  - createRevisionInTx and createAssessmentSnapshotInTx are added.
//
// TRANSACTION TIMEOUT NOTE:
// Remote Neon dev branch latency can exceed Prisma's default 5s transaction
// timeout; 20s gives headroom without masking genuine deadlocks (Postgres
// still enforces its own lock timeout). The maxWait bump (default 2s -> 10s)
// accounts for the same latency when acquiring a connection from the pool.
// This only affects the interactive-transaction path — single-statement
// calls in the other repositories are unaffected.

import { type Prisma } from "@prisma/client";
import { prisma } from "../client";

export type VersionOrigin = "MANUAL_COMMIT" | "AI_APPLIED_SIMULATION";
export type RevisionTrigger = "MANUAL_COMMIT" | "AI_APPLIED_SIMULATION";
export type AssessmentSnapshotReason =
  | "COMMIT"
  | "BLOCK_END"
  | "MANUAL_RECOMPUTE";

export interface ProgramVersionRecord {
  id: string;
  programId: string;
  versionNumber: number;
  structureSnapshot: unknown; // ProgramStructure — see @training/domain types
  createdVia: VersionOrigin;
  createdAt: Date;
}

export interface RevisionRecord {
  id: string;
  programId: string;
  fromVersionId: string | null;
  toVersionId: string;
  trigger: RevisionTrigger;
  sourceSimulationId: string | null;
  userNote: string | null;
  createdAt: Date;
}

export interface AssessmentSnapshotRecord {
  id: string;
  programVersionId: string;
  goalId: string;
  engineVersion: string;
  thresholdsVersion: string;
  metrics: unknown; // Analysis payload
  assessment: unknown; // Assessment payload
  fitScore: unknown; // FitScore payload
  reason: AssessmentSnapshotReason;
  computedAt: Date;
}

/**
 * Explicit transaction options, exported so the commit service (packages/api)
 * uses the same numbers as the version-write path (ARCH-026).
 */
export const TRANSACTION_OPTIONS = {
  timeout: 20000,
  maxWait: 10000,
} as const;

const VERSION_SELECT = {
  id: true,
  programId: true,
  versionNumber: true,
  structureSnapshot: true,
  createdVia: true,
  createdAt: true,
} as const;

const REVISION_SELECT = {
  id: true,
  programId: true,
  fromVersionId: true,
  toVersionId: true,
  trigger: true,
  sourceSimulationId: true,
  userNote: true,
  createdAt: true,
} as const;

const SNAPSHOT_SELECT = {
  id: true,
  programVersionId: true,
  goalId: true,
  engineVersion: true,
  thresholdsVersion: true,
  metrics: true,
  assessment: true,
  fitScore: true,
  reason: true,
  computedAt: true,
} as const;

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
 * Returns the latest committed ProgramVersion for a Program, or null if none.
 * "Latest" is by versionNumber, which is monotonic per Program (enforced by
 * @@unique([programId, versionNumber])).
 */
export async function getLatestVersionForProgram(
  programId: string,
): Promise<ProgramVersionRecord | null> {
  return prisma.programVersion.findFirst({
    where: { programId },
    orderBy: { versionNumber: "desc" },
    select: VERSION_SELECT,
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

export interface CreateProgramVersionInput {
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
}

/**
 * Transaction-aware: writes a new ProgramVersion plus its derived normalized
 * rows. Does NOT open its own transaction — the caller (either
 * createProgramVersion below, or the commit service) is inside one.
 *
 * Does NOT flip the Program's activeVersionId — that is the service's job,
 * also inside the same outer transaction.
 */
export async function createProgramVersionInTx(
  tx: Prisma.TransactionClient,
  input: CreateProgramVersionInput,
): Promise<ProgramVersionRecord> {
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
}

/**
 * Writes a new ProgramVersion together with its derived normalized rows in a
 * single transaction. Thin wrapper around createProgramVersionInTx for callers
 * that do not need to compose a wider transaction.
 */
export async function createProgramVersion(
  input: CreateProgramVersionInput,
): Promise<ProgramVersionRecord> {
  return prisma.$transaction(
    (tx) => createProgramVersionInTx(tx, input),
    TRANSACTION_OPTIONS,
  );
}

/**
 * Transaction-aware: records the Revision that produced toVersionId from
 * fromVersionId. fromVersionId is null for a Program's very first commit.
 *
 * Phase 4 always sets trigger to "MANUAL_COMMIT" and sourceSimulationId to
 * null; Phase 8 will set trigger to "AI_APPLIED_SIMULATION" and populate
 * sourceSimulationId. The service layer decides.
 */
export async function createRevisionInTx(
  tx: Prisma.TransactionClient,
  input: {
    programId: string;
    fromVersionId: string | null;
    toVersionId: string;
    trigger: RevisionTrigger;
    sourceSimulationId?: string | null;
    userNote?: string | null;
  },
): Promise<RevisionRecord> {
  return tx.revision.create({
    data: {
      programId: input.programId,
      fromVersionId: input.fromVersionId,
      toVersionId: input.toVersionId,
      trigger: input.trigger,
      sourceSimulationId: input.sourceSimulationId ?? null,
      userNote: input.userNote ?? null,
    },
    select: REVISION_SELECT,
  });
}

/**
 * Transaction-aware: freezes the Assessment produced at Commit (or at
 * Block-End, which is Phase 5+; Phase 4 only writes COMMIT). Historical
 * snapshots must remain readable after engineVersion / thresholdsVersion
 * change, so all three payloads are stored verbatim and never recomputed for
 * a historical version (07-versioning-and-simulation.md, "Historical
 * reproducibility").
 *
 * metrics = Analysis, assessment = Assessment, fitScore = FitScore.
 * computedAt is the caller's responsibility — the service uses the
 * Assessment's own computedAt so the snapshot matches what the user saw.
 */
export async function createAssessmentSnapshotInTx(
  tx: Prisma.TransactionClient,
  input: {
    programVersionId: string;
    goalId: string;
    engineVersion: string;
    thresholdsVersion: string;
    metrics: unknown;
    assessment: unknown;
    fitScore: unknown;
    reason: AssessmentSnapshotReason;
    computedAt: Date;
  },
): Promise<AssessmentSnapshotRecord> {
  return tx.assessmentSnapshot.create({
    data: {
      programVersionId: input.programVersionId,
      goalId: input.goalId,
      engineVersion: input.engineVersion,
      thresholdsVersion: input.thresholdsVersion,
      metrics: input.metrics as Prisma.InputJsonValue,
      assessment: input.assessment as Prisma.InputJsonValue,
      fitScore: input.fitScore as Prisma.InputJsonValue,
      reason: input.reason,
      computedAt: input.computedAt,
    },
    select: SNAPSHOT_SELECT,
  });
}

/**
 * Returns the most recent AssessmentSnapshot for a ProgramVersion, or null
 * if none exists.
 *
 * Phase 4's commit flow writes exactly one snapshot per committed version
 * (reason: COMMIT). A later phase will add BLOCK_END and MANUAL_RECOMPUTE
 * snapshots against the same version; this function returns the latest by
 * computedAt, which is "what the user most recently saw" — the semantic that
 * Review (Phase 7) needs. Callers that want a specific reason should filter
 * client-side, or a future variant can take a reason argument.
 */
export async function findLatestAssessmentSnapshotForVersion(
  versionId: string,
): Promise<AssessmentSnapshotRecord | null> {
  return prisma.assessmentSnapshot.findFirst({
    where: { programVersionId: versionId },
    orderBy: { computedAt: "desc" },
    select: SNAPSHOT_SELECT,
  });
}

/**
 * Returns the highest versionNumber currently used for a Program, or 0 if none.
 * Caller computes the next number (N+1). No separate counter table.
 *
 * Note: this is a read outside the commit transaction. The commit transaction
 * relies on @@unique([programId, versionNumber]) to catch races — if two
 * commits compute the same N+1 concurrently, exactly one wins the unique
 * constraint and the loser retries against the fresh max.
 */
export async function getMaxVersionNumber(programId: string): Promise<number> {
  const row = await prisma.programVersion.findFirst({
    where: { programId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return row?.versionNumber ?? 0;
}