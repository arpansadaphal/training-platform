// Phase 1 seed script — canonical reference data.
//
// IMPORTANT: Every numeric value in this file is CONTENT DATA, not a
// scientific threshold. Involvement factors are provisional, unvalidated,
// and open to review. No [SCIENTIFIC INPUT REQUIRED] value is invented here.
// The one GoalProfileDefinition seeded (HYPERTROPHY) is deliberately
// validated: false, configVersion: "0.0.1-unvalidated", thresholds: {}.

import { PrismaClient, type MovementPattern } from "@prisma/client";

const prisma = new PrismaClient();

// ───────────────────── Muscle groups ─────────────────────

const MUSCLE_GROUPS = [
  "chest",
  "lats",
  "upper back",
  "front delts",
  "side delts",
  "rear delts",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
  "obliques",
  "lower back",
  "traps",
  "adductors",
] as const;

// ───────────────────── Exercises ─────────────────────
//
// Each entry: { name, movementPattern, equipment?, involvements: { muscle: factor } }
// Involvement factors: 1.0 (primary mover), 0.5 (synergist), omitted = 0.
// Content data, provisional, not validated — do not treat as scientific thresholds.

interface SeedExercise {
  name: string;
  movementPattern: MovementPattern;
  equipment?: string;
  involvements: Record<string, number>;
}

const EXERCISES: SeedExercise[] = [
  // SQUAT
  { name: "Back Squat", movementPattern: "SQUAT", equipment: "barbell",
    involvements: { quads: 1.0, glutes: 0.5 } },
  { name: "Front Squat", movementPattern: "SQUAT", equipment: "barbell",
    involvements: { quads: 1.0, glutes: 0.5 } },
  { name: "Hack Squat", movementPattern: "SQUAT", equipment: "machine",
    involvements: { quads: 1.0, glutes: 0.5 } },
  { name: "Leg Press", movementPattern: "SQUAT", equipment: "machine",
    involvements: { quads: 1.0, glutes: 0.5 } },

  // HINGE
  { name: "Conventional Deadlift", movementPattern: "HINGE", equipment: "barbell",
    involvements: { glutes: 1.0, hamstrings: 0.5 } },
  { name: "Romanian Deadlift", movementPattern: "HINGE", equipment: "barbell",
    involvements: { hamstrings: 1.0, glutes: 0.5 } },
  { name: "Sumo Deadlift", movementPattern: "HINGE", equipment: "barbell",
    involvements: { glutes: 1.0, hamstrings: 0.5, quads: 0.5 } },
  { name: "Hip Thrust", movementPattern: "HINGE", equipment: "barbell",
    involvements: { glutes: 1.0, hamstrings: 0.5 } },
  { name: "Good Morning", movementPattern: "HINGE", equipment: "barbell",
    involvements: { hamstrings: 1.0, glutes: 0.5 } },

  // HORIZONTAL_PUSH
  { name: "Barbell Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "barbell",
    involvements: { chest: 1.0, "front delts": 0.5, triceps: 0.5 } },
  { name: "Dumbbell Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "dumbbell",
    involvements: { chest: 1.0, "front delts": 0.5, triceps: 0.5 } },
  { name: "Incline Barbell Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "barbell",
    involvements: { chest: 1.0, "front delts": 0.5, triceps: 0.5 } },
  { name: "Push-Up", movementPattern: "HORIZONTAL_PUSH", equipment: "bodyweight",
    involvements: { chest: 1.0, "front delts": 0.5, triceps: 0.5 } },
  { name: "Cable Chest Fly", movementPattern: "HORIZONTAL_PUSH", equipment: "cable",
    involvements: { chest: 1.0 } },

  // VERTICAL_PUSH
  { name: "Overhead Press", movementPattern: "VERTICAL_PUSH", equipment: "barbell",
    involvements: { "front delts": 1.0, "side delts": 0.5, triceps: 0.5 } },
  { name: "Dumbbell Shoulder Press", movementPattern: "VERTICAL_PUSH", equipment: "dumbbell",
    involvements: { "front delts": 1.0, "side delts": 0.5, triceps: 0.5 } },
  { name: "Arnold Press", movementPattern: "VERTICAL_PUSH", equipment: "dumbbell",
    involvements: { "front delts": 1.0, "side delts": 0.5, triceps: 0.5 } },
  { name: "Machine Shoulder Press", movementPattern: "VERTICAL_PUSH", equipment: "machine",
    involvements: { "front delts": 1.0, "side delts": 0.5, triceps: 0.5 } },

  // HORIZONTAL_PULL
  { name: "Barbell Row", movementPattern: "HORIZONTAL_PULL", equipment: "barbell",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 } },
  { name: "Dumbbell Row", movementPattern: "HORIZONTAL_PULL", equipment: "dumbbell",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 } },
  { name: "Seated Cable Row", movementPattern: "HORIZONTAL_PULL", equipment: "cable",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 } },
  { name: "Chest-Supported Row", movementPattern: "HORIZONTAL_PULL", equipment: "machine",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 } },
  { name: "T-Bar Row", movementPattern: "HORIZONTAL_PULL", equipment: "barbell",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 } },

  // VERTICAL_PULL
  { name: "Pull-Up", movementPattern: "VERTICAL_PULL", equipment: "bodyweight",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5 } },
  { name: "Chin-Up", movementPattern: "VERTICAL_PULL", equipment: "bodyweight",
    involvements: { lats: 1.0, biceps: 0.5, "upper back": 0.5 } },
  { name: "Lat Pulldown", movementPattern: "VERTICAL_PULL", equipment: "cable",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5 } },
  { name: "Straight-Arm Pulldown", movementPattern: "VERTICAL_PULL", equipment: "cable",
    involvements: { lats: 1.0 } },

  // CARRY
  { name: "Farmer's Carry", movementPattern: "CARRY", equipment: "dumbbell",
    involvements: { forearms: 1.0, traps: 0.5 } },
  { name: "Suitcase Carry", movementPattern: "CARRY", equipment: "dumbbell",
    involvements: { forearms: 1.0, obliques: 1.0 } },
  { name: "Overhead Carry", movementPattern: "CARRY", equipment: "dumbbell",
    involvements: {} },

  // ISOLATION
  { name: "Barbell Curl", movementPattern: "ISOLATION", equipment: "barbell",
    involvements: { biceps: 1.0 } },
  { name: "Hammer Curl", movementPattern: "ISOLATION", equipment: "dumbbell",
    involvements: { biceps: 1.0, forearms: 0.5 } },
  { name: "Tricep Pushdown", movementPattern: "ISOLATION", equipment: "cable",
    involvements: { triceps: 1.0 } },
  { name: "Overhead Tricep Extension", movementPattern: "ISOLATION", equipment: "cable",
    involvements: { triceps: 1.0 } },
  { name: "Lateral Raise", movementPattern: "ISOLATION", equipment: "dumbbell",
    involvements: { "side delts": 1.0 } },
  { name: "Rear Delt Fly", movementPattern: "ISOLATION", equipment: "dumbbell",
    involvements: { "rear delts": 1.0, "upper back": 0.5 } },
  { name: "Leg Curl", movementPattern: "ISOLATION", equipment: "machine",
    involvements: { hamstrings: 1.0 } },
  { name: "Leg Extension", movementPattern: "ISOLATION", equipment: "machine",
    involvements: { quads: 1.0 } },
  { name: "Standing Calf Raise", movementPattern: "ISOLATION", equipment: "machine",
    involvements: { calves: 1.0 } },
  { name: "Cable Crunch", movementPattern: "ISOLATION", equipment: "cable",
    involvements: { abs: 1.0 } },
  { name: "Plank", movementPattern: "ISOLATION", equipment: "bodyweight",
    involvements: { abs: 1.0, obliques: 0.5 } },

  // OTHER
  { name: "Face Pull", movementPattern: "OTHER", equipment: "cable",
    involvements: { "rear delts": 1.0, "upper back": 0.5 } },
  { name: "Shrug", movementPattern: "OTHER", equipment: "dumbbell",
    involvements: { traps: 1.0 } },
];

// ───────────────────── Main ─────────────────────

async function main() {
  console.log("Seeding canonical reference data (idempotent)...");

  // Muscle groups — upsert by unique name
  for (const name of MUSCLE_GROUPS) {
    await prisma.muscleGroup.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`  ✓ ${MUSCLE_GROUPS.length} muscle groups`);

  // Load muscle groups into a lookup by name
  const muscleRows = await prisma.muscleGroup.findMany();
  const muscleByName = new Map(muscleRows.map((m) => [m.name, m.id]));

  // Exercises — upsert by name (name is not unique in schema; guard by findFirst)
  let exerciseCount = 0;
  for (const ex of EXERCISES) {
    let existing = await prisma.exercise.findFirst({ where: { name: ex.name } });
    if (!existing) {
      existing = await prisma.exercise.create({
        data: {
          name: ex.name,
          movementPattern: ex.movementPattern,
          equipment: ex.equipment ?? null,
        },
      });
      exerciseCount += 1;
    }

    // Involvements — upsert by composite id
       // Involvements — upsert the new list, then delete anything no longer listed.
    //
    // The deleteMany pass is load-bearing. Without it, an exercise whose
    // involvement list shrinks (e.g. Back Squat losing its hamstrings/lower
    // back/abs/adductors credits) keeps the old rows forever — upsert cannot
    // remove them, only update or insert.
    const newMuscleIds: string[] = [];
    for (const [muscleName, factor] of Object.entries(ex.involvements)) {
      const muscleId = muscleByName.get(muscleName);
      if (!muscleId) {
        // Unknown muscle in the involvements map — fail loudly rather than skip silently.
        throw new Error(
          `Seed exercise "${ex.name}" references unknown muscle group "${muscleName}"`,
        );
      }
      newMuscleIds.push(muscleId);

      await prisma.exerciseMuscleInvolvement.upsert({
        where: {
          exerciseId_muscleGroupId: {
            exerciseId: existing.id,
            muscleGroupId: muscleId,
          },
        },
        update: { involvementFactor: factor },
        create: {
          exerciseId: existing.id,
          muscleGroupId: muscleId,
          involvementFactor: factor,
        },
      });
    }

    // Delete involvements no longer in the new mapping. For Overhead Carry
    // (empty involvements), notIn: [] deletes every prior row — intended.
    await prisma.exerciseMuscleInvolvement.deleteMany({
      where: {
        exerciseId: existing.id,
        muscleGroupId: { notIn: newMuscleIds },
      },
    });
  }
  console.log(`  ✓ ${EXERCISES.length} exercises (${exerciseCount} newly created)`);

  // GoalProfileDefinition — HYPERTROPHY only
  //
  // thresholds is deliberately an empty object. Bounds, weights, and band
  // edges are [SCIENTIFIC INPUT REQUIRED] and must not be invented here.
  await prisma.goalProfileDefinition.upsert({
    where: { key: "HYPERTROPHY" },
    update: {},
    create: {
      key: "HYPERTROPHY",
      displayName: "Hypertrophy",
      configVersion: "0.0.1-unvalidated",
      thresholds: {},
      validated: false,
      sourceNote: "UNRESOLVED — SCIENTIFIC INPUT REQUIRED",
    },
  });
  console.log("  ✓ GoalProfileDefinition HYPERTROPHY (validated: false, thresholds: {})");

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  // Re-throw so tsx exits non-zero and prisma migrate dev fails loudly
  // rather than leaving the database half-populated.
  throw err;
});