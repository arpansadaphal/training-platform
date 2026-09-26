// Repository layer for reference data: Exercise, MuscleGroup,
// ExerciseMuscleInvolvement. Read-only for Phase 1 — no user-facing CRUD.
//
// Phase 4 addition: listAllInvolvements — used by packages/api's
// referenceDataService to build the ExerciseReferenceData the Analysis
// engine consumes. The existing per-exercise variant is kept for callers
// that already know the exercise id.

import { prisma } from "../client";

export type MovementPattern =
  | "SQUAT"
  | "HINGE"
  | "HORIZONTAL_PUSH"
  | "VERTICAL_PUSH"
  | "HORIZONTAL_PULL"
  | "VERTICAL_PULL"
  | "CARRY"
  | "ISOLATION"
  | "OTHER";

export interface ExerciseRecord {
  id: string;
  name: string;
  movementPattern: MovementPattern;
  equipment: string | null;
}

export interface MuscleGroupRecord {
  id: string;
  name: string;
}

export interface ExerciseMuscleInvolvementRecord {
  exerciseId: string;
  muscleGroupId: string;
  involvementFactor: number;
}

export async function listExercises(): Promise<ExerciseRecord[]> {
  return prisma.exercise.findMany({
    select: {
      id: true,
      name: true,
      movementPattern: true,
      equipment: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function findExerciseById(
  id: string,
): Promise<ExerciseRecord | null> {
  return prisma.exercise.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      movementPattern: true,
      equipment: true,
    },
  });
}

export async function listMuscleGroups(): Promise<MuscleGroupRecord[]> {
  return prisma.muscleGroup.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listInvolvementsForExercise(
  exerciseId: string,
): Promise<ExerciseMuscleInvolvementRecord[]> {
  const rows = await prisma.exerciseMuscleInvolvement.findMany({
    where: { exerciseId },
    select: {
      exerciseId: true,
      muscleGroupId: true,
      involvementFactor: true,
    },
  });
  // Prisma returns Decimal for involvementFactor; convert to number for domain.
  return rows.map((r) => ({
    exerciseId: r.exerciseId,
    muscleGroupId: r.muscleGroupId,
    involvementFactor: Number(r.involvementFactor),
  }));
}

/**
 * Returns every ExerciseMuscleInvolvement row. Used to assemble the
 * ExerciseReferenceData the Analysis engine needs — the engine's per-muscle-
 * group axes (VOLUME, FREQUENCY) read all involvements at once.
 *
 * The seed data is a few hundred rows; a full read is cheap and simpler than
 * a per-exercise fan-out. No ordering is required by any consumer.
 */
export async function listAllInvolvements(): Promise<
  ExerciseMuscleInvolvementRecord[]
> {
  const rows = await prisma.exerciseMuscleInvolvement.findMany({
    select: {
      exerciseId: true,
      muscleGroupId: true,
      involvementFactor: true,
    },
  });
  return rows.map((r) => ({
    exerciseId: r.exerciseId,
    muscleGroupId: r.muscleGroupId,
    involvementFactor: Number(r.involvementFactor),
  }));
}