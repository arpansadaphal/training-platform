// packages/domain/src/analysis/progressionSoundness.ts
//
// Progression Scheme Soundness — program-wide internal-consistency check.
//
// 05-analysis-engine.md example: "a load scheme referencing a percentage of
// 1RM with no way to establish 1RM". The domain model has no explicit
// "1RM test" concept, so Phase 2 uses a structural heuristic:
//
//   "way to establish 1RM" := at least one prescription with
//                              targetRepsLow === 1 && targetRepsHigh === 1
//                             (a true single).
//
// Issue rule:
//   - Program uses PERCENT_1RM in any prescription AND
//     has no "way to establish 1RM"   -> +1 issue.
//   - Otherwise                        -> no issue from this rule.
//
// This is a deterministic, fully-structural check; the rule set is expected
// to grow as more soundness checks are specified. metricValue = issue count
// (integer), so 0 falls into the "Sound" band and any positive value into
// "Issue found" when a config supplies real bounds.

import type { ProgramStructure } from "../types";
import type {
  AnalysisAxisResult,
  ExerciseReferenceData,
  GoalProfileConfig,
} from "./types";
import { resolveBand } from "./bandResolution";

function usesPercentOneRm(structure: ProgramStructure): boolean {
  return structure.workoutDays.some((day) =>
    day.prescriptions.some((p) => p.loadScheme.type === "PERCENT_1RM"),
  );
}

function hasWayToEstablishOneRm(structure: ProgramStructure): boolean {
  return structure.workoutDays.some((day) =>
    day.prescriptions.some(
      (p) => p.targetRepsLow === 1 && p.targetRepsHigh === 1,
    ),
  );
}

export function computeProgressionSoundnessAxis(
  structure: ProgramStructure,
  _referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
): AnalysisAxisResult {
  let issueCount = 0;
  if (usesPercentOneRm(structure) && !hasWayToEstablishOneRm(structure)) {
    issueCount += 1;
  }

  return {
    axisType: "PROGRESSION_SOUNDNESS",
    scopeKey: null,
    metricValue: issueCount,
    status: resolveBand(issueCount, config.statusBands.PROGRESSION_SOUNDNESS),
  };
}