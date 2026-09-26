// packages/domain/src/analysis/exerciseSelectionBalance.ts
//
// Exercise Selection Balance — program-wide movement-pattern coverage check.
//
// 05-analysis-engine.md: "Movement-pattern coverage check across all
// prescriptions — resolvable from structural logic alone, no external
// validation needed."
//
// Required pattern set: all MovementPattern values except "OTHER". "OTHER"
// is a catch-all and is never treated as a required pattern. If Phase 3+
// wants this configurable, add a config field then; not in Phase 2.
//
// metricValue = coverage ratio in [0, 1] = (required patterns present) / (all required patterns).
// The band names "Balanced" / "Gaps present" come from the config; the domain
// never hard-codes those strings.

import type { MovementPattern } from "./types";
import type { ProgramStructure } from "../types";
import type {
  AnalysisAxisResult,
  ExerciseReferenceData,
  GoalProfileConfig,
} from "./types";
import { resolveBand } from "./bandResolution";

const REQUIRED_PATTERNS: readonly MovementPattern[] = [
  "SQUAT",
  "HINGE",
  "HORIZONTAL_PUSH",
  "VERTICAL_PUSH",
  "HORIZONTAL_PULL",
  "VERTICAL_PULL",
  "CARRY",
  "ISOLATION",
];

export function computeExerciseSelectionBalanceAxis(
  structure: ProgramStructure,
  referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
): AnalysisAxisResult {
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

  const coveredCount = REQUIRED_PATTERNS.filter((p) => present.has(p)).length;
  const coverageRatio = coveredCount / REQUIRED_PATTERNS.length;

  return {
    axisType: "EXERCISE_SELECTION_BALANCE",
    scopeKey: null,
    metricValue: coverageRatio,
    status: resolveBand(coverageRatio, config.statusBands.EXERCISE_SELECTION_BALANCE),
  };
}