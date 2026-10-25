// Repository layer for reference data: Exercise, MuscleGroup,
// ExerciseMuscleInvolvement. Read-only for Phase 1 — no user-facing CRUD.
//
// Phase 4 addition: listAllInvolvements — used by packages/api's
// referenceDataService to build the ExerciseReferenceData the Analysis
// engine consumes. The existing per-exercise variant is kept for callers
// that already know the exercise id.

import { prisma } from "../client";

// ---- Reference-data cache --------------------------------------------------
//
// Exercises, muscle groups and involvements are seed data: only prisma/seed.ts
// writes them. A request used to read the 110-exercise list up to three times,
// each a round trip to the database. They are now read at most once per
// process per REFERENCE_TTL_MS. The TTL is a safety net for a reseed while a
// server is running; clearReferenceDataCache() is the explicit reset.

const REFERENCE_TTL_MS = 10 * 60 * 1000;

interface Cached<T> {
  value: Promise<T>;
  loadedAt: number;
}

function cached<T>(load: () => Promise<T>): { get: () => Promise<T>; clear: () => void } {
  let entry: Cached<T> | null = null;
  return {
    get() {
      const now = Date.now();
      if (entry === null || now - entry.loadedAt > REFERENCE_TTL_MS) {
        const value = load();
        entry = { value, loadedAt: now };
        // A failed load must not be remembered.
        value.catch(() => {
          if (entry !== null && entry.value === value) entry = null;
        });
      }
      return entry.value;
    },
    clear() {
      entry = null;
    },
  };
}

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

const exercisesCache = cached<ExerciseRecord[]>(() =>
  prisma.exercise.findMany({
    select: {
      id: true,
      name: true,
      movementPattern: true,
      equipment: true,
    },
    orderBy: { name: "asc" },
  }),
);

/** Every exercise, by name. Cached per process (see the reference-data cache above). */
export function listExercises(): Promise<ExerciseRecord[]> {
  return exercisesCache.get();
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

const muscleGroupsCache = cached<MuscleGroupRecord[]>(() =>
  prisma.muscleGroup.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  }),
);

/** Every muscle group, by name. Cached per process. */
export function listMuscleGroups(): Promise<MuscleGroupRecord[]> {
  return muscleGroupsCache.get();
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
const involvementsCache = cached<ExerciseMuscleInvolvementRecord[]>(async () => {
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
});

export function listAllInvolvements(): Promise<ExerciseMuscleInvolvementRecord[]> {
  return involvementsCache.get();
}

/** Drops the cached reference data. Only a reseed (or a test that changes it) needs this. */
export function clearReferenceDataCache(): void {
  exercisesCache.clear();
  muscleGroupsCache.clear();
  involvementsCache.clear();
}