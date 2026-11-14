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

export type CueKind = "setup" | "action" | "feel";

export interface CueStep {
  kind: CueKind;
  text: string;
}

export interface ExerciseRecord {
  id: string;
  name: string;
  movementPattern: MovementPattern;
  equipment: string | null;
  /** The session screen's "Cues" toggle: setup / action / feel lines; [] where none are written. */
  cues: CueStep[];
  /** false = drafted, not yet read by the founder: shown with a "(beta)" label. */
  cuesReviewed: boolean;
}

/**
 * The record without its cues. Only the session screen shows cues, so every other reader (the Builder's picker,
 * the public /check library) drops them rather than ship 110 exercises' text it never renders.
 */
export function withoutCues(e: ExerciseRecord): ExerciseRecord {
  return { ...e, cues: [], cuesReviewed: false };
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

const CUE_KINDS: readonly string[] = ["setup", "action", "feel"];

/**
 * The cues of a row. `cueSteps` (JSON) wins when it holds at least one well-formed step; otherwise the legacy
 * `cues` text lines are each an "action" step, so a database migrated but not yet reseeded still shows its cues.
 */
export function cueStepsOf(row: { cues: string[]; cueSteps: unknown }): CueStep[] {
  if (Array.isArray(row.cueSteps)) {
    const steps = row.cueSteps.filter(
      (s): s is CueStep =>
        typeof s === "object" &&
        s !== null &&
        CUE_KINDS.includes((s as CueStep).kind) &&
        typeof (s as CueStep).text === "string" &&
        (s as CueStep).text.trim() !== "",
    );
    if (steps.length > 0) return steps;
  }
  return row.cues.map((text) => ({ kind: "action" as const, text }));
}

const EXERCISE_SELECT = {
  id: true,
  name: true,
  movementPattern: true,
  equipment: true,
  cues: true,
  cueSteps: true,
  cuesReviewed: true,
} as const;

function toRecord(row: {
  id: string;
  name: string;
  movementPattern: MovementPattern;
  equipment: string | null;
  cues: string[];
  cueSteps: unknown;
  cuesReviewed: boolean;
}): ExerciseRecord {
  const { cueSteps: _steps, ...rest } = row;
  return { ...rest, cues: cueStepsOf(row) };
}

const exercisesCache = cached<ExerciseRecord[]>(async () =>
  (
    await prisma.exercise.findMany({ select: EXERCISE_SELECT, orderBy: { name: "asc" } })
  ).map(toRecord),
);

/** Every exercise, by name. Cached per process (see the reference-data cache above). */
export function listExercises(): Promise<ExerciseRecord[]> {
  return exercisesCache.get();
}

export async function findExerciseById(
  id: string,
): Promise<ExerciseRecord | null> {
  const row = await prisma.exercise.findUnique({ where: { id }, select: EXERCISE_SELECT });
  return row ? toRecord(row) : null;
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