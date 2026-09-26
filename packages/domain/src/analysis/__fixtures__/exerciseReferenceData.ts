// packages/domain/src/analysis/__fixtures__/exerciseReferenceData.ts
//
// Test-only reference data. Deliberately tiny, hand-built, and self-contained
// so the analysis tests need no database. Every test that references
// a GoalProfileConfig must use a config from ./testGoalProfiles.ts, and every
// config there is marked `validated: false` (see configValidation.test.ts).

import type { ExerciseReferenceData } from "../types";

export const testReferenceData: ExerciseReferenceData = {
  muscleGroups: [
    { id: "chest", name: "Chest" },
    { id: "back", name: "Back" },
    { id: "quads", name: "Quads" },
    { id: "hamstrings", name: "Hamstrings" },
    { id: "shoulders", name: "Shoulders" },
  ],
  exercises: [
    { id: "bench", name: "Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "barbell" },
    { id: "incline-bench", name: "Incline Bench", movementPattern: "HORIZONTAL_PUSH", equipment: "barbell" },
    { id: "ohp", name: "Overhead Press", movementPattern: "VERTICAL_PUSH", equipment: "barbell" },
    { id: "row", name: "Barbell Row", movementPattern: "HORIZONTAL_PULL", equipment: "barbell" },
    { id: "pullup", name: "Pull-up", movementPattern: "VERTICAL_PULL", equipment: "bodyweight" },
    { id: "squat", name: "Back Squat", movementPattern: "SQUAT", equipment: "barbell" },
    { id: "deadlift", name: "Deadlift", movementPattern: "HINGE", equipment: "barbell" },
    { id: "curl", name: "Biceps Curl", movementPattern: "ISOLATION", equipment: "dumbbell" },
    { id: "farmer", name: "Farmer Carry", movementPattern: "CARRY", equipment: "dumbbell" },
  ],
  involvements: [
    { exerciseId: "bench", muscleGroupId: "chest", involvementFactor: 1 },
    { exerciseId: "bench", muscleGroupId: "shoulders", involvementFactor: 0.4 },
    { exerciseId: "incline-bench", muscleGroupId: "chest", involvementFactor: 0.9 },
    { exerciseId: "incline-bench", muscleGroupId: "shoulders", involvementFactor: 0.6 },
    { exerciseId: "ohp", muscleGroupId: "shoulders", involvementFactor: 1 },
    { exerciseId: "row", muscleGroupId: "back", involvementFactor: 1 },
    { exerciseId: "pullup", muscleGroupId: "back", involvementFactor: 1 },
    { exerciseId: "squat", muscleGroupId: "quads", involvementFactor: 1 },
    { exerciseId: "squat", muscleGroupId: "hamstrings", involvementFactor: 0.3 },
    { exerciseId: "deadlift", muscleGroupId: "hamstrings", involvementFactor: 0.8 },
    { exerciseId: "deadlift", muscleGroupId: "back", involvementFactor: 0.5 },
    { exerciseId: "curl", muscleGroupId: "back", involvementFactor: 0 }, // explicitly zero
  ],
};