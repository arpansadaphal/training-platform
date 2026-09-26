// packages/domain/src/index.ts
//
// Public surface of @training/domain.
//
// Phase 1 exposed type definitions only. Phase 2 added the pure Analysis
// engine (computeAnalysis and its axis calculators) plus the GoalProfile
// registry surface. Phase 3 adds the Assessment engine (computeAssessment,
// computeFitScore), the launch gate, and the assessment-layer types.
//
// Mutation/Simulation arrive in Phase 4+ and are still not exported here.

export type {
  EvidenceTag,
  LoadScheme,
  ExercisePrescriptionStructure,
  WorkoutDayStructure,
  ProgramStructure,
} from "./types";

// --- Analysis-layer types ---

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
  // Phase-3 additions to the analysis layer (see ARCH-029):
  Severity,
  Weight,
  Leverage,
  SeverityMap,
  SeverityWeightTable,
  FitScoreBand,
  FitScoreProjection,
} from "./analysis/types";

// --- Analysis engine ---

export { computeAnalysis } from "./analysis/computeAnalysis";
export { computeVolumeAxis } from "./analysis/volume";
export { computeFrequencyAxis } from "./analysis/frequency";
export { computeExerciseSelectionBalanceAxis } from "./analysis/exerciseSelectionBalance";
export { computeProgressionSoundnessAxis } from "./analysis/progressionSoundness";
export {
  computeRecoveryCostAxis,
  provisionalRecoveryCostCalculator,
} from "./analysis/recoveryCost";

// --- Goal-profile registry ---

export type {
  GoalProfileDefinition,
  GoalProfileRegistry,
} from "./goal-profiles/types";
export {
  goalProfileRegistry,
  InMemoryGoalProfileRegistry,
} from "./goal-profiles/registry";
export { HYPERTROPHY_CONFIG, hypertrophyProfile } from "./goal-profiles/hypertrophy";

// --- Assessment-layer types ---

export type {
  AssessedAxis,
  ActionSuggestion,
  Assessment,
  AssessmentResult,
  ComputeAssessmentOptions,
  FitScore,
  FitScoreResult,
} from "./assessment/types";

// --- Assessment engine ---

export { computeAssessment } from "./assessment/computeAssessment";
export { computeFitScore } from "./assessment/computeFitScore";
export { rollUpLeverage } from "./assessment/rollup";
export type { RollUpOutcome, RollUpOk, RollUpBlocked } from "./assessment/rollup";
export { actionTemplateFor } from "./assessment/actionTemplates";
export type { ActionTemplateResult } from "./assessment/actionTemplates";

// --- Launch gate ---

export {
  assertNoUnvalidatedProfilesInProduction,
  PRODUCTION_ENV,
} from "./assessment/launchGate";