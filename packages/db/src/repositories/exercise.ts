// Repository layer for reference data: Exercise, MuscleGroup,
// ExerciseMuscleInvolvement. Read-only for Phase 1 — no user-facing CRUD.

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