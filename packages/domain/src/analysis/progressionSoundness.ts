// packages/domain/src/analysis/progressionSoundness.ts
//
// Progression Scheme Soundness (E8): program-wide, deterministic, structure-only checks.
// Replaces the single "%1RM without a 1-rep set" rule. metricValue = number of FAILED checks (0-5).
//
//   EFFORT_DEFINED           >= minShareEffortDefined (0.8) of PRESCRIPTIONS state an effort
//                            (targetRpe, or an RPE_BASED load scheme).
//   FAR_FROM_FAILURE         <= maxShareFarFromFailure (0.25) of SETS are prescribed at RIR >= 5 (RPE <= 5).
//                            Prescriptions with no stated effort are not counted as far from failure.
//   REP_RANGE                >= minShareInAcceptedRepRange (0.8) of SETS have a rep range wholly inside 5-30.
//   PERCENT_1RM_FEASIBILITY  no %1RM prescription asks for more reps than the percentage allows.
//   NEAR_FAILURE             <= maxShareAtFailure (0.5) of SETS are prescribed at RIR 0 (RPE 10). Added in
//                            ARCH-063 / B3: the checks above only ever caught effort that was too LOW, so a
//                            program with every set to failure read "Sound". Tier 4 cutpoint ("more than half"
//                            is an engine boundary, not a measurement); the direction is Tier 3-4 (growth rises
//                            as sets approach failure but failure itself is unnecessary: Refalo 2023, Robinson
//                            2024). Prescriptions with no stated effort are not counted as at failure.
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
  maxShareAtFailure: 0.5,
  acceptedRepRange: [5, 30],
  minShareInAcceptedRepRange: 0.8,
  percent1RmRepTolerance: 1,
};

export type ProgressionCheckId =
  | "EFFORT_DEFINED"
  | "FAR_FROM_FAILURE"
  | "REP_RANGE"
  | "PERCENT_1RM_FEASIBILITY"
  | "NEAR_FAILURE";

export interface ProgressionCheck {
  readonly id: ProgressionCheckId;
  readonly failed: boolean;
  readonly detail: string;
  /** The share (0-1) the check measured, when it measures one. PERCENT_1RM_FEASIBILITY does not. */
  readonly share?: number;
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
      { id: "NEAR_FAILURE", failed: false, detail: none },
    ];
  }

  // 1. effort defined (share of prescriptions)
  const definedCount = all.filter((p) => prescribedRpe(p) !== null).length;
  const definedShare = definedCount / all.length;

  // 2 + 3 + 5. far-from-failure, rep-range and at-failure shares (share of sets)
  const [repLo, repHi] = rules.acceptedRepRange;
  let farSets = 0;
  let inRangeSets = 0;
  let atFailureSets = 0;
  for (const p of all) {
    const rpe = prescribedRpe(p);
    if (rpe !== null && 10 - rpe >= rules.farFromFailureMinRir - EPS) farSets += p.targetSets;
    if (rpe !== null && rpe >= 10 - EPS) atFailureSets += p.targetSets; // RIR 0; unstated effort is not counted
    if (p.targetRepsLow >= repLo && p.targetRepsHigh <= repHi) inRangeSets += p.targetSets;
  }
  const farShare = farSets / totalSets;
  const inRangeShare = inRangeSets / totalSets;
  const atFailureShare = atFailureSets / totalSets;

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
      share: definedShare,
    },
    {
      id: "FAR_FROM_FAILURE",
      failed: farShare > rules.maxShareFarFromFailure + EPS,
      detail: `${pct(farShare)} of sets at RIR >= ${rules.farFromFailureMinRir} (max ${pct(rules.maxShareFarFromFailure)})`,
      share: farShare,
    },
    {
      id: "REP_RANGE",
      failed: inRangeShare < rules.minShareInAcceptedRepRange - EPS,
      detail: `${pct(inRangeShare)} of sets inside ${repLo}-${repHi} reps (needs ${pct(rules.minShareInAcceptedRepRange)})`,
      share: inRangeShare,
    },
    {
      id: "PERCENT_1RM_FEASIBILITY",
      failed: infeasible.length > 0,
      detail: infeasible.length === 0 ? "no infeasible %1RM prescription" : infeasible.join("; "),
    },
    {
      id: "NEAR_FAILURE",
      failed: atFailureShare > rules.maxShareAtFailure + EPS,
      detail: `${pct(atFailureShare)} of sets at RIR 0 (max ${pct(rules.maxShareAtFailure)})`,
      share: atFailureShare,
    },
  ];
}

export function computeProgressionSoundnessAxis(
  structure: ProgramStructure,
  _referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
): AnalysisAxisResult {
  const failed = evaluateProgressionChecks(structure, config).filter((c) => c.failed);
  const failedChecks = failed.length;

  return {
    axisType: "PROGRESSION_SOUNDNESS",
    scopeKey: null,
    metricValue: failedChecks,
    status: resolveBand(failedChecks, config.statusBands.PROGRESSION_SOUNDNESS),
    // ARCH-063 / B3: WHICH checks failed, so a finding can say so. Omitted when none failed.
    ...(failed.length > 0
      ? {
          facts: {
            failedChecks: failed.map((c) => ({
              id: c.id,
              detail: c.detail,
              ...(c.share === undefined ? {} : { share: c.share }),
            })),
          },
        }
      : {}),
  };
}
