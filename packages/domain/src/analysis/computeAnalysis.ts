// packages/domain/src/analysis/computeAnalysis.ts
//
// The single entry point for the Analysis engine. Pure function: same input -> same output modulo the
// injected clock (used only for `computedAt`). E9: options.recoveryCostCalculator replaces the provisional
// recovery-cost calculator for this run. options.context (AnalysisContext) is accepted and, for now, not read by
// any calculator: it is the foundation later items build on.

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
import { computeCrossMuscleRatios } from "./ratios";

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
    computeRecoveryCostAxis(structure, referenceData, config, options.recoveryCostCalculator),
  ];

  return {
    programVersionId,
    axisResults,
    computedAt: now().toISOString(),
    ratios: computeCrossMuscleRatios(structure, referenceData, config),
  };
}