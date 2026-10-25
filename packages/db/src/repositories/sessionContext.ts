// packages/db/src/repositories/sessionContext.ts
//
// Flat, single-statement reads for assembling a Session's context (its block,
// workout day, prescriptions, program, position in the block). They replace a
// chain of reads where each needed the id returned by the one before
// (session -> block -> version -> program) with reads that all hang off the
// Session's own ids, so a caller can run them side by side. The relation
// filters here (a Program found through "has a version that has this block")
// are what make that possible without nested selects, which Prisma turns into
// extra statements run one after another.

import { prisma } from "../client";

export interface WorkoutDayRow {
  id: string;
  programVersionId: string;
  orderIndex: number;
  name: string;
  isRestDay: boolean;
}

export async function findWorkoutDayRow(id: string): Promise<WorkoutDayRow | null> {
  return prisma.workoutDay.findUnique({
    where: { id },
    select: { id: true, programVersionId: true, orderIndex: true, name: true, isRestDay: true },
  });
}

export interface PrescriptionRow {
  id: string;
  orderIndex: number;
  exerciseId: string;
  targetSets: number;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe: number | null;
  loadScheme: unknown;
}

export async function listPrescriptionRowsForDay(workoutDayId: string): Promise<PrescriptionRow[]> {
  const rows = await prisma.exercisePrescription.findMany({
    where: { workoutDayId },
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
  });
  return rows.map((r) => ({
    ...r,
    targetRpe: r.targetRpe === null ? null : Number(r.targetRpe),
  }));
}

/** The Program a TrainingBlock belongs to (block -> version -> program), in one statement. */
export async function findProgramOfBlock(
  blockId: string,
): Promise<{ id: string; name: string } | null> {
  return prisma.program.findFirst({
    where: { versions: { some: { trainingBlocks: { some: { id: blockId } } } } },
    select: { id: true, name: true },
  });
}

/** COMPLETED Sessions in a block up to and including `sequenceIndex` ("Session 8 (4 completed)"). */
export async function countCompletedInBlockThrough(
  blockId: string,
  sequenceIndex: number,
): Promise<number> {
  return prisma.session.count({
    where: {
      trainingBlockId: blockId,
      status: "COMPLETED",
      sequenceIndex: { lte: sequenceIndex },
    },
  });
}

// ---- /app landing reads ----------------------------------------------------
// Same idea: each is one flat statement keyed off ids the caller already has,
// so the landing page can fire them together.

/** The workout day of the block's PLANNED or IN_PROGRESS Session (at most one exists), or null. */
export async function findDayOfActiveSession(
  blockId: string,
): Promise<{ name: string; isRestDay: boolean } | null> {
  return prisma.workoutDay.findFirst({
    where: {
      sessions: {
        some: { trainingBlockId: blockId, status: { in: ["PLANNED", "IN_PROGRESS"] } },
      },
    },
    select: { name: true, isRestDay: true },
  });
}

/** When the block's newest set was logged in an IN_PROGRESS Session, or null (staleness, ARCH-057). */
export async function findLatestSetTimeInOpenSessions(blockId: string): Promise<Date | null> {
  const row = await prisma.performanceRecord.findFirst({
    where: { session: { trainingBlockId: blockId, status: "IN_PROGRESS" } },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });
  return row?.completedAt ?? null;
}

/**
 * The Program's newest closed (not ACTIVE) block that has at least one
 * COMPLETED Session: empty blocks left by archive/unarchive never qualify.
 */
export async function findRecentClosedBlockWithSessions(programId: string) {
  return prisma.trainingBlock.findFirst({
    where: {
      programVersion: { programId },
      status: { not: "ACTIVE" },
      sessions: { some: { status: "COMPLETED" } },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true, status: true, startedAt: true, endedAt: true },
  });
}

/** How many versions a Program has (the dashboard only shows the number; no snapshots are read). */
export async function countVersionsOfProgram(programId: string): Promise<number> {
  return prisma.programVersion.count({ where: { programId } });
}

/** Every workout day of a version, in rotation order (the dashboard's Today card). */
export async function listWorkoutDayRowsForVersion(
  programVersionId: string,
): Promise<WorkoutDayRow[]> {
  return prisma.workoutDay.findMany({
    where: { programVersionId },
    orderBy: { orderIndex: "asc" },
    select: { id: true, programVersionId: true, orderIndex: true, name: true, isRestDay: true },
  });
}

/** Every prescription of a version, tagged with its day. */
export async function listPrescriptionRowsForVersion(
  programVersionId: string,
): Promise<Array<PrescriptionRow & { workoutDayId: string }>> {
  const rows = await prisma.exercisePrescription.findMany({
    where: { workoutDay: { programVersionId } },
    orderBy: [{ workoutDayId: "asc" }, { orderIndex: "asc" }],
    select: {
      id: true,
      workoutDayId: true,
      orderIndex: true,
      exerciseId: true,
      targetSets: true,
      targetRepsLow: true,
      targetRepsHigh: true,
      targetRpe: true,
      loadScheme: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    targetRpe: r.targetRpe === null ? null : Number(r.targetRpe),
  }));
}
