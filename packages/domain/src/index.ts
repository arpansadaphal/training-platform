// packages/domain/src/index.ts
//
// Public surface of @training/domain.
//
// Phase 1 exposed type definitions only. Phase 2 adds the pure Analysis
// engine (computeAnalysis and its axis calculators) plus the GoalProfile
// registry surface. Assessment/Mutation/Simulation arrive in Phase 3+ and
// are still not exported from here.

export type {
  EvidenceTag,
  LoadScheme,
  ExercisePrescriptionStructure,
  WorkoutDayStructure,
  ProgramStructure,
} from "./types";

export type {
  AxisType,
  AxisStatus,
  AxisBandDefinition,
  AxisWeight,
  Analysis,
  AnalysisAxisResult,
  ComputeAnalysisOptions,
  ExerciseMuscleInvolvementReference,
  ExerciseReference,
  ExerciseReferenceData,
  GoalProfileConfig,
  MovementPattern,
  MuscleGroupReference,
  RecoveryCostCalculator,
} from "./analysis/types";

export { computeAnalysis } from "./analysis/computeAnalysis";
export { computeVolumeAxis } from "./analysis/volume";
export { computeFrequencyAxis } from "./analysis/frequency";
export { computeExerciseSelectionBalanceAxis } from "./analysis/exerciseSelectionBalance";
export { computeProgressionSoundnessAxis } from "./analysis/progressionSoundness";
export {
  computeRecoveryCostAxis,
  provisionalRecoveryCostCalculator,
} from "./analysis/recoveryCost";

export type {
  GoalProfileDefinition,
  GoalProfileRegistry,
} from "./goal-profiles/types";
export { goalProfileRegistry } from "./goal-profiles/registry";
export { HYPERTROPHY_CONFIG, hypertrophyProfile } from "./goal-profiles/hypertrophy";