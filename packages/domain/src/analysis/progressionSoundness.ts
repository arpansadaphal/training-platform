// packages/domain/src/analysis/progressionSoundness.ts
//
// Progression Scheme Soundness (E8): program-wide, deterministic, structure-only checks.
// Replaces the single "%1RM without a 1-rep set" rule. metricValue = number of FAILED checks (0-4).
//
//   EFFORT_DEFINED           >= minShareEffortDefined (0.8) of PRESCRIPTIONS state an effort
//                            (targetRpe, or an RPE_BASED load scheme).
//   FAR_FROM_FAILURE         <= maxShareFarFromFailure (0.25) of SETS are prescribed at RIR >= 5 (RPE <= 5).
//                            Prescriptions with no stated effort are not counted as far from failure.
//   REP_RANGE                >= minShareInAcceptedRepRange (0.8) of SETS have a rep range wholly inside 5-30.
//   PERCENT_1RM_FEASIBILITY  no %1RM prescription asks for more reps than the percentage allows.
//
// Not computable without a ProgramStructure schema change (DEFERRED): overload mechanism (load / rep /
// set progression), planned weekly increments, deloads, multi-week structure.
//
// INTERIM: rep-max-at-percentage uses the Epley equation (reps = 30 x (1 - p) / p). Nuzzo et al. 2023 is the
// intended source and was not retrieved. Epley is least reliable above ~10 reps. Replace epleyMaxReps with
// the table when it is available.
//
// LoadScheme.percent has no stated unit; values > 1 are read as whole percents (75 -> 0.75). Verify that
// against the follow-up normalisation before relying on it.

import type { ExercisePrescriptionStructure, ProgramStructure } from "../types";
import type {
  AnalysisAxisResult,
  ExerciseReferenceData,
  GoalProfileConfig,
  ProgressionRulesConfig,
} from "./types";
import { resolveBand } from "./bandResolution";
import { prescribedRpe } from "./hardSetCredit";

export const DEFAULT_PROGRESSION_RULES: ProgressionRulesConfig = {
  minShareEffortDefined: 0.8,
  farFromFailureMinRir: 5,
  maxShareFarFromFailure: 0.25,
  acceptedRepRange: [5, 30],
  minShareInAcceptedRepRange: 0.8,
  percent1RmRepTolerance: 1,
};

export type ProgressionCheckId =
  | "EFFORT_DEFINED"
  | "FAR_FROM_FAILURE"
  | "REP_RANGE"
  | "PERCENT_1RM_FEASIBILITY";

export interface ProgressionCheck {
  readonly id: ProgressionCheckId;
  readonly failed: boolean;
  readonly detail: string;
}

const EPS = 1e-9;
const pct = (share: number): string => `${Math.round(share * 1000) / 10}%`;

/** Maximum reps to failure at a fraction of 1RM (Epley, interim). Never below 1. */
export function epleyMaxReps(fraction: number): number {
  if (!(fraction > 0)) return Number.POSITIVE_INFINITY;
  return Math.max(1, (30 * (1 - fraction)) / fraction);
}

/** 0.75 -> 0.75; 75 -> 0.75. */
export function normalizePercentFraction(percent: number): number {
  return percent > 1 ? percent / 100 : percent;
}

export function evaluateProgressionChecks(
  structure: ProgramStructure,
  config: GoalProfileConfig,
): readonly ProgressionCheck[] {
  const rules = config.progressionRules ?? DEFAULT_PROGRESSION_RULES;

  const all: ExercisePrescriptionStructure[] = [];
  for (const day of structure.workoutDays) {
    for (const p of day.prescriptions) all.push(p);
  }
  const totalSets = all.reduce((sum, p) => sum + p.targetSets, 0);

  if (all.length === 0 || totalSets <= 0) {
    const none = "no prescriptions to evaluate";
    return [
      { id: "EFFORT_DEFINED", failed: false, detail: none },
      { id: "FAR_FROM_FAILURE", failed: false, detail: none },
      { id: "REP_RANGE", failed: false, detail: none },
      { id: "PERCENT_1RM_FEASIBILITY", failed: false, detail: none },
    ];
  }

  // 1. effort defined (share of prescriptions)
  const definedCount = all.filter((p) => prescribedRpe(p) !== null).length;
  const definedShare = definedCount / all.length;

  // 2 + 3. far-from-failure and rep-range shares (share of sets)
  const [repLo, repHi] = rules.acceptedRepRange;
  let farSets = 0;
  let inRangeSets = 0;
  for (const p of all) {
    const rpe = prescribedRpe(p);
    if (rpe !== null && 10 - rpe >= rules.farFromFailureMinRir - EPS) farSets += p.targetSets;
    if (p.targetRepsLow >= repLo && p.targetRepsHigh <= repHi) inRangeSets += p.targetSets;
  }
  const farShare = farSets / totalSets;
  const inRangeShare = inRangeSets / totalSets;

  // 4. %1RM feasibility (any infeasible prescription fails the check)
  const infeasible: string[] = [];
  for (const p of all) {
    if (p.loadScheme.type !== "PERCENT_1RM") continue;
    const fraction = normalizePercentFraction(p.loadScheme.percent);
    const rpe = prescribedRpe(p);
    const rir = rpe === null ? 0 : Math.max(0, 10 - rpe); // unstated effort: judge feasibility to failure
    const maxReps = epleyMaxReps(fraction);
    if (p.targetRepsHigh + rir > maxReps + rules.percent1RmRepTolerance + EPS) {
      infeasible.push(
        `${p.id}: ${p.targetRepsHigh} reps + ${rir} RIR at ${Math.round(fraction * 100)}% exceeds ~${Math.floor(maxReps)} reps`,
      );
    }
  }

  return [
    {
      id: "EFFORT_DEFINED",
      failed: definedShare < rules.minShareEffortDefined - EPS,
      detail: `effort stated on ${pct(definedShare)} of prescriptions (needs ${pct(rules.minShareEffortDefined)})`,
    },
    {
      id: "FAR_FROM_FAILURE",
      failed: farShare > rules.maxShareFarFromFailure + EPS,
      detail: `${pct(farShare)} of sets at RIR >= ${rules.farFromFailureMinRir} (max ${pct(rules.maxShareFarFromFailure)})`,
    },
    {
      id: "REP_RANGE",
      failed: inRangeShare < rules.minShareInAcceptedRepRange - EPS,
      detail: `${pct(inRangeShare)} of sets inside ${repLo}-${repHi} reps (needs ${pct(rules.minShareInAcceptedRepRange)})`,
    },
    {
      id: "PERCENT_1RM_FEASIBILITY",
      failed: infeasible.length > 0,
      detail: infeasible.length === 0 ? "no infeasible %1RM prescription" : infeasible.join("; "),
    },
  ];
}

export function computeProgressionSoundnessAxis(
  structure: ProgramStructure,
  _referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
): AnalysisAxisResult {
  const failedChecks = evaluateProgressionChecks(structure, config).filter((c) => c.failed).length;

  return {
    axisType: "PROGRESSION_SOUNDNESS",
    scopeKey: null,
    metricValue: failedChecks,
    status: resolveBand(failedChecks, config.statusBands.PROGRESSION_SOUNDNESS),
  };
}