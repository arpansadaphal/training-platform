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