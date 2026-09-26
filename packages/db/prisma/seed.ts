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
// Involvement factors are 0..1, provisional, and not validated.

interface SeedExercise {
  name: string;
  movementPattern: MovementPattern;
  equipment?: string;
  involvements: Record<string, number>;
}

const EXERCISES: SeedExercise[] = [
  // SQUAT
  {
    name: "Back Squat",
    movementPattern: "SQUAT",
    equipment: "barbell",
    involvements: { quads: 0.7, glutes: 0.6, hamstrings: 0.4, "lower back": 0.3, abs: 0.2, adductors: 0.2 } as Record<string, number>,
  },
  {
    name: "Front Squat",
    movementPattern: "SQUAT",
    equipment: "barbell",
    involvements: { quads: 0.8, glutes: 0.5, "lower back": 0.3, abs: 0.3 },
  },
  {
    name: "Hack Squat",
    movementPattern: "SQUAT",
    equipment: "machine",
    involvements: { quads: 0.8, glutes: 0.4, hamstrings: 0.3 },
  },
  {
    name: "Leg Press",
    movementPattern: "SQUAT",
    equipment: "machine",
    involvements: { quads: 0.7, glutes: 0.5, hamstrings: 0.3 },
  },

  // HINGE
  {
    name: "Conventional Deadlift",
    movementPattern: "HINGE",
    equipment: "barbell",
    involvements: { hamstrings: 0.7, glutes: 0.7, "lower back": 0.6, traps: 0.4, lats: 0.3, forearms: 0.3, abs: 0.3 },
  },
  {
    name: "Romanian Deadlift",
    movementPattern: "HINGE",
    equipment: "barbell",
    involvements: { hamstrings: 0.8, glutes: 0.6, "lower back": 0.4, forearms: 0.3 },
  },
  {
    name: "Sumo Deadlift",
    movementPattern: "HINGE",
    equipment: "barbell",
    involvements: { glutes: 0.7, hamstrings: 0.5, quads: 0.5, "lower back": 0.4, traps: 0.3 },
  },
  {
    name: "Hip Thrust",
    movementPattern: "HINGE",
    equipment: "barbell",
    involvements: { glutes: 0.9, hamstrings: 0.4 },
  },
  {
    name: "Good Morning",
    movementPattern: "HINGE",
    equipment: "barbell",
    involvements: { hamstrings: 0.6, glutes: 0.5, "lower back": 0.5 },
  },

  // HORIZONTAL_PUSH
  {
    name: "Barbell Bench Press",
    movementPattern: "HORIZONTAL_PUSH",
    equipment: "barbell",
    involvements: { chest: 0.7, "front delts": 0.4, triceps: 0.4 },
  },
  {
    name: "Dumbbell Bench Press",
    movementPattern: "HORIZONTAL_PUSH",
    equipment: "dumbbell",
    involvements: { chest: 0.7, "front delts": 0.4, triceps: 0.4 },
  },
  {
    name: "Incline Barbell Bench Press",
    movementPattern: "HORIZONTAL_PUSH",
    equipment: "barbell",
    involvements: { chest: 0.6, "front delts": 0.6, triceps: 0.4 },
  },
  {
    name: "Push-Up",
    movementPattern: "HORIZONTAL_PUSH",
    equipment: "bodyweight",
    involvements: { chest: 0.6, "front delts": 0.3, triceps: 0.3, abs: 0.2 },
  },
  {
    name: "Cable Chest Fly",
    movementPattern: "HORIZONTAL_PUSH",
    equipment: "cable",
    involvements: { chest: 0.8, "front delts": 0.2 },
  },

  // VERTICAL_PUSH
  {
    name: "Overhead Press",
    movementPattern: "VERTICAL_PUSH",
    equipment: "barbell",
    involvements: { "front delts": 0.7, "side delts": 0.4, triceps: 0.4, abs: 0.2 },
  },
  {
    name: "Dumbbell Shoulder Press",
    movementPattern: "VERTICAL_PUSH",
    equipment: "dumbbell",
    involvements: { "front delts": 0.7, "side delts": 0.4, triceps: 0.4 },
  },
  {
    name: "Arnold Press",
    movementPattern: "VERTICAL_PUSH",
    equipment: "dumbbell",
    involvements: { "front delts": 0.7, "side delts": 0.5, triceps: 0.3 },
  },
  {
    name: "Machine Shoulder Press",
    movementPattern: "VERTICAL_PUSH",
    equipment: "machine",
    involvements: { "front delts": 0.7, "side delts": 0.3, triceps: 0.4 },
  },

  // HORIZONTAL_PULL
  {
    name: "Barbell Row",
    movementPattern: "HORIZONTAL_PULL",
    equipment: "barbell",
    involvements: { lats: 0.6, "upper back": 0.6, biceps: 0.4, "rear delts": 0.4, "lower back": 0.3 },
  },
  {
    name: "Dumbbell Row",
    movementPattern: "HORIZONTAL_PULL",
    equipment: "dumbbell",
    involvements: { lats: 0.6, "upper back": 0.5, biceps: 0.4, "rear delts": 0.3 },
  },
  {
    name: "Seated Cable Row",
    movementPattern: "HORIZONTAL_PULL",
    equipment: "cable",
    involvements: { lats: 0.6, "upper back": 0.6, biceps: 0.3, "rear delts": 0.3 },
  },
  {
    name: "Chest-Supported Row",
    movementPattern: "HORIZONTAL_PULL",
    equipment: "machine",
    involvements: { lats: 0.6, "upper back": 0.6, biceps: 0.3, "rear delts": 0.3 },
  },
  {
    name: "T-Bar Row",
    movementPattern: "HORIZONTAL_PULL",
    equipment: "barbell",
    involvements: { lats: 0.6, "upper back": 0.6, biceps: 0.4, "rear delts": 0.3 },
  },

  // VERTICAL_PULL
  {
    name: "Pull-Up",
    movementPattern: "VERTICAL_PULL",
    equipment: "bodyweight",
    involvements: { lats: 0.8, "upper back": 0.5, biceps: 0.4, forearms: 0.3, abs: 0.2 },
  },
  {
    name: "Chin-Up",
    movementPattern: "VERTICAL_PULL",
    equipment: "bodyweight",
    involvements: { lats: 0.7, biceps: 0.6, "upper back": 0.4, forearms: 0.3 },
  },
  {
    name: "Lat Pulldown",
    movementPattern: "VERTICAL_PULL",
    equipment: "cable",
    involvements: { lats: 0.7, "upper back": 0.4, biceps: 0.4 },
  },
  {
    name: "Straight-Arm Pulldown",
    movementPattern: "VERTICAL_PULL",
    equipment: "cable",
    involvements: { lats: 0.8, "upper back": 0.3 },
  },

  // CARRY
  {
    name: "Farmer's Carry",
    movementPattern: "CARRY",
    equipment: "dumbbell",
    involvements: { forearms: 0.7, traps: 0.5, abs: 0.5, obliques: 0.4 },
  },
  {
    name: "Suitcase Carry",
    movementPattern: "CARRY",
    equipment: "dumbbell",
    involvements: { forearms: 0.6, obliques: 0.6, abs: 0.4 },
  },
  {
    name: "Overhead Carry",
    movementPattern: "CARRY",
    equipment: "dumbbell",
    involvements: { "front delts": 0.5, "side delts": 0.5, abs: 0.5, triceps: 0.3 },
  },

  // ISOLATION
  {
    name: "Barbell Curl",
    movementPattern: "ISOLATION",
    equipment: "barbell",
    involvements: { biceps: 0.9, forearms: 0.4 },
  },
  {
    name: "Hammer Curl",
    movementPattern: "ISOLATION",
    equipment: "dumbbell",
    involvements: { biceps: 0.8, forearms: 0.6 },
  },
  {
    name: "Tricep Pushdown",
    movementPattern: "ISOLATION",
    equipment: "cable",
    involvements: { triceps: 0.9 },
  },
  {
    name: "Overhead Tricep Extension",
    movementPattern: "ISOLATION",
    equipment: "cable",
    involvements: { triceps: 0.9 },
  },
  {
    name: "Lateral Raise",
    movementPattern: "ISOLATION",
    equipment: "dumbbell",
    involvements: { "side delts": 0.9 },
  },
  {
    name: "Rear Delt Fly",
    movementPattern: "ISOLATION",
    equipment: "dumbbell",
    involvements: { "rear delts": 0.8, "upper back": 0.3 },
  },
  {
    name: "Leg Curl",
    movementPattern: "ISOLATION",
    equipment: "machine",
    involvements: { hamstrings: 0.9 },
  },
  {
    name: "Leg Extension",
    movementPattern: "ISOLATION",
    equipment: "machine",
    involvements: { quads: 0.9 },
  },
  {
    name: "Standing Calf Raise",
    movementPattern: "ISOLATION",
    equipment: "machine",
    involvements: { calves: 0.9 },
  },
  {
    name: "Cable Crunch",
    movementPattern: "ISOLATION",
    equipment: "cable",
    involvements: { abs: 0.8, obliques: 0.3 },
  },
  {
    name: "Plank",
    movementPattern: "ISOLATION",
    equipment: "bodyweight",
    involvements: { abs: 0.7, obliques: 0.5, "lower back": 0.2 },
  },

  // OTHER — a couple for coverage
  {
    name: "Face Pull",
    movementPattern: "OTHER",
    equipment: "cable",
    involvements: { "rear delts": 0.7, "upper back": 0.5, traps: 0.3 },
  },
  {
    name: "Shrug",
    movementPattern: "OTHER",
    equipment: "dumbbell",
    involvements: { traps: 0.9, forearms: 0.3 },
  },
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
    for (const [muscleName, factor] of Object.entries(ex.involvements)) {
      const muscleId = muscleByName.get(muscleName);
      if (!muscleId) {
        // Unknown muscle in the involvements map — fail loudly rather than skip silently.
        throw new Error(
          `Seed exercise "${ex.name}" references unknown muscle group "${muscleName}"`,
        );
      }
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