// packages/domain/src/analysis/computeAnalysis.ts
//
// The single entry point for the Analysis engine. Pure function: same input
// -> same output modulo the injected clock (used only for `computedAt`).
//
// Signature note: 05-analysis-engine.md shows `computeAnalysis(structure,
// referenceData)`, but the axis banding is config-driven, so Phase 2 adds an
// explicit `config: GoalProfileConfig` parameter. The config is passed in by
// the caller rather than looked up from a registry — this keeps the domain
// layer free of I/O and of any implicit global state, matching ARCH-010.
// Phase 3 (Assessment) will own the registry lookup path; the engine here
// stays pure.

import type { ProgramStructure } from "../types";
import type {
  Analysis,
  AnalysisAxisResult,
  ComputeAnalysisOptions,
  ExerciseReferenceData,
  GoalProfileConfig,
} from "./types";
import { computeVolumeAxis } from "./volume";
import { computeFrequencyAxis } from "./frequency";
import { computeExerciseSelectionBalanceAxis } from "./exerciseSelectionBalance";
import { computeProgressionSoundnessAxis } from "./progressionSoundness";
import { computeRecoveryCostAxis } from "./recoveryCost";

export function computeAnalysis(
  structure: ProgramStructure,
  referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
  options: ComputeAnalysisOptions = {},
): Analysis {
  const programVersionId = options.programVersionId ?? null;
  const now = options.now ?? (() => new Date());

  const axisResults: AnalysisAxisResult[] = [
    ...computeVolumeAxis(structure, referenceData, config),
    ...computeFrequencyAxis(structure, referenceData, config),
    computeExerciseSelectionBalanceAxis(structure, referenceData, config),
    computeProgressionSoundnessAxis(structure, referenceData, config),
    computeRecoveryCostAxis(structure, referenceData, config),
  ];

  return {
    programVersionId,
    axisResults,
    computedAt: now().toISOString(),
  };
}