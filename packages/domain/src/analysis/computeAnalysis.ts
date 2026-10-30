// packages/domain/src/analysis/computeAnalysis.ts
//
// The single entry point for the Analysis engine. Pure function: same input -> same output modulo the
// injected clock (used only for `computedAt`). E9: options.recoveryCostCalculator replaces the provisional
// recovery-cost calculator for this run. options.context (AnalysisContext): daysPerWeek is read by VOLUME and
// FREQUENCY (runsPerWeek.ts, ARCH-063 Session C1); nothing else in it is read by a calculator yet.

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
import { runsPerWeek } from "./runsPerWeek";

export function computeAnalysis(
  structure: ProgramStructure,
  referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
  options: ComputeAnalysisOptions = {},
): Analysis {
  const programVersionId = options.programVersionId ?? null;
  const now = options.now ?? (() => new Date());
  const runs = runsPerWeek(structure, options.context);

  const axisResults: AnalysisAxisResult[] = [
    ...computeVolumeAxis(structure, referenceData, config, runs),
    ...computeFrequencyAxis(structure, referenceData, config, runs),
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