// packages/domain/src/index.ts
//
// Public surface of @training/domain.
//
// Phase 1 exposed type definitions only. Phase 2 added the pure Analysis
// engine (computeAnalysis and its axis calculators) plus the GoalProfile
// registry surface. Phase 3 added the Assessment engine (computeAssessment,
// computeFitScore), the launch gate, and the assessment-layer types. Phase 4
// added the shared mutation function (applyMutation) and its MutationSpec
// union. Phase 5 adds the pure simulation composition (simulate) and the
// two diff functions (diffAssessments / diffStructures), plus the types
// they are expressed in.
//
// Explicit named re-exports, not `export *` — the public surface is a
// deliberate contract; a new internal module should not silently become part
// of it.

// ── Mutation / simulation ───────────────────────────────────────────────────

export type {
  MutationSpec,
  MutationOp,
  MutationErrorCode,
  SimulationNet,
  SimulationResult,
  StructureDiffEntry,
  WhatChangedResult,
} from "./mutation/types";
export { MutationError } from "./mutation/types";
export { applyMutation } from "./mutation/apply-mutation";
export { simulate } from "./mutation/simulate";
export type { SimulateOptions } from "./mutation/simulate";
export { diffAssessments } from "./mutation/diff-assessments";
export type { AssessmentDiff } from "./mutation/diff-assessments";
export { diffStructures } from "./mutation/diff-structures";
export { scopeReferenceDataToGoal } from "./reference/scopeReferenceData";

// ── Base domain types ───────────────────────────────────────────────────────

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
export {
  EVIDENCE_TIER_DEFINITIONS,
  formatTierRange,
  primarySources,
  thresholdTierSpan,
  tiersIn,
} from "./goal-profiles/evidence";
export type { EvidenceTierDefinition } from "./goal-profiles/evidence";
export type {
  AxisEvidence,
  EvidenceClaim,
  EvidenceTier,
  EvidenceTierRange,
  GoalProfileEvidence,
} from "./analysis/types";

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
export { computeFitScore, projectFitBand } from "./assessment/computeFitScore";
export type { FitBandProjection } from "./assessment/computeFitScore";
export { isClassified, provisionalFitBand } from "./assessment/provisionalFit";
export { rollUpLeverage } from "./assessment/rollup";
export type { RollUpOutcome, RollUpOk, RollUpBlocked } from "./assessment/rollup";
export { actionTemplateFor } from "./assessment/actionTemplates";
export type { ActionTemplateResult } from "./assessment/actionTemplates";

// --- Launch gate ---

export {
  assertNoUnvalidatedProfilesInProduction,
  PRODUCTION_ENV,
} from "./assessment/launchGate";

export { ASSESSMENT_ENGINE_VERSION } from "./assessment/version";
export type { HardSetCreditConfig, FrequencyDistributionConfig, ProgressionRulesConfig } from "./analysis/types";
export {
  DEFAULT_HARD_SET_CREDIT, hardSetCredit, creditedSets, prescribedRpe, prescribedRir, hasDefinedEffort,
} from "./analysis/hardSetCredit";
export { evaluateProgressionChecks, epleyMaxReps } from "./analysis/progressionSoundness";
export type { ProgressionCheck, ProgressionCheckId } from "./analysis/progressionSoundness";
// --- Progress (Phase A3a) ---
// Pure, outside analysis/ and assessment/: nothing here feeds the engine.

export { epleyE1rm, convertLoad } from "./progress/e1rm";
export type { WeightUnit } from "./progress/e1rm";
export { topSetOf, totalVolumeOf, buildExerciseHistory } from "./progress/history";
export type {
  LoggedSet, SessionSets, TopSet, ExerciseSessionRecord,
} from "./progress/history";
export {
  computeProgressVerdict, progressVerdictLine,
  VERDICT_WINDOW, VERDICT_MIN_SESSIONS, VERDICT_THRESHOLD_PERCENT,
} from "./progress/verdict";
export type { ProgressVerdict, ProgressVerdictKind } from "./progress/verdict";
export { computeSessionSummary } from "./progress/sessionSummary";
export type {
  SessionSummary, SessionSummaryInput, SummaryExerciseInput,
  MuscleInvolvement, MuscleVolumeDelta, NewPersonalRecord,
} from "./progress/sessionSummary";

// --- Session logging choices (Phase A3c) ---
export {
  weightOptions, weightOption, weightTarget, WEIGHT_STEP, WEIGHT_MAX, DEFAULT_TARGET,
  RPE_OPTIONS, rpeOptionText, rpeLabel, nearestRpeOption,
} from "./session/loggingOptions";
export type { WeightOption, RpeOption } from "./session/loggingOptions";
