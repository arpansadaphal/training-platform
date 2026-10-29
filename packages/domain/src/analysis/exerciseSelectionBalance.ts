// packages/domain/src/analysis/exerciseSelectionBalance.ts
//
// Exercise Selection Balance: program-wide movement-pattern coverage check (E7).
//
// The required pattern set now comes from config.requiredMovementPatterns, defaulting to the hypertrophy
// recommendation: SQUAT, HINGE, HORIZONTAL_PUSH, VERTICAL_PUSH, HORIZONTAL_PULL, VERTICAL_PULL.
// CARRY and ISOLATION are NO LONGER required: no hypertrophy evidence requires loaded carries, and
// per-muscle coverage is already judged by VOLUME. "OTHER" is never a required pattern.
//
// metricValue = (required patterns present) / (required patterns). An empty required list is vacuously
// covered (1). Band names come from the config; the domain never hard-codes them. `facts.missingPatterns` lists
// the required patterns no exercise has (ARCH-063 / B2), so a finding can name them.
// Regional rules (triceps overhead, hamstring knee flexion) are DEFERRED.

import type { ProgramStructure } from "../types";
import type {
  AnalysisAxisResult,
  ExerciseReferenceData,
  GoalProfileConfig,
  MovementPattern,
} from "./types";
import { resolveBand } from "./bandResolution";

export const DEFAULT_REQUIRED_MOVEMENT_PATTERNS: readonly MovementPattern[] = [
  "SQUAT",
  "HINGE",
  "HORIZONTAL_PUSH",
  "VERTICAL_PUSH",
  "HORIZONTAL_PULL",
  "VERTICAL_PULL",
];

export function computeExerciseSelectionBalanceAxis(
  structure: ProgramStructure,
  referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
): AnalysisAxisResult {
  const required = new Set<MovementPattern>(
    config.requiredMovementPatterns ?? DEFAULT_REQUIRED_MOVEMENT_PATTERNS,
  );

  const patternByExercise = new Map<string, MovementPattern>();
  for (const ex of referenceData.exercises) {
    patternByExercise.set(ex.id, ex.movementPattern);
  }

  const present = new Set<MovementPattern>();
  for (const day of structure.workoutDays) {
    for (const p of day.prescriptions) {
      const pattern = patternByExercise.get(p.exerciseId);
      if (pattern !== undefined) present.add(pattern);
    }
  }

  let covered = 0;
  const missingPatterns: MovementPattern[] = [];
  for (const pattern of required) {
    if (present.has(pattern)) covered += 1;
    else missingPatterns.push(pattern);
  }
  const rawRatio = required.size === 0 ? 1 : covered / required.size;
  const coverageRatio = Math.round(rawRatio * 1e6) / 1e6;

  return {
    axisType: "EXERCISE_SELECTION_BALANCE",
    scopeKey: null,
    metricValue: coverageRatio,
    status: resolveBand(coverageRatio, config.statusBands.EXERCISE_SELECTION_BALANCE),
    // ARCH-063 / B2: WHICH patterns are missing (in required order). Omitted when none, so a covered program
    // keeps exactly the shape it had.
    ...(missingPatterns.length > 0 ? { facts: { missingPatterns } } : {}),
  };
}