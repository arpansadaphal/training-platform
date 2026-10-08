// packages/domain/src/goal-profiles/types.ts
//
// Goal profile registry surface. The registry is a stub in Phase 2 — it
// registers exactly one profile (HYPERTROPHY) whose `GoalProfileConfig` has
// `validated: false` and null bounds throughout. Phase 3 will populate the
// real config (weights, bands) once sports-science sign-off lands.
//
// Adding a second goal profile must never require touching computeAnalysis or
// computeAssessment — that is the whole point of this interface.

import type { AxisType, GoalProfileConfig } from "../analysis/types";

export interface GoalProfileDefinition {
  key: string;
  relevantAxes: readonly AxisType[];
  loadConfig(): GoalProfileConfig;
}

export interface GoalProfileRegistry {
  register(profile: GoalProfileDefinition): void;
  get(key: string): GoalProfileDefinition;
  list(): readonly GoalProfileDefinition[];
}

export interface GoalProfileDefinition {
  key: string;
  relevantAxes: readonly AxisType[];
  /**
   * Muscle-group names (matching MuscleGroup.name) that this goal treats as
   * in-scope. The reference-data loader filters
   * ExerciseReferenceData.muscleGroups to exactly these names before the
   * Analysis engine sees it — see scopeReferenceDataToGoal.
   *
   * Names, not ids: MuscleGroup.id is a cuid, unstable across environments;
   * name is @unique and stable.
   *
   * Phase 10.2 / E3. Non-goal muscle groups read Low under the current
   * volume rules and drive a bogus NEEDS_WORK. Interim fix: scope them out.
   * Long-term fix: scoped N/A bands keep the metric visible without
   * judging it.
   */
  relevantMuscleGroups: readonly string[];
  loadConfig(): GoalProfileConfig;
}