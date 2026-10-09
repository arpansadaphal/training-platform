// packages/domain/src/analysis/hardSetCredit.ts
//
// E5: effort-aware hard-set credit, and the ONE place that decides what effort a prescription has.
// Shared by volume.ts, frequency.ts, recoveryCost.ts and progressionSoundness.ts.
//
// Effort source, in order: targetRpe, then an RPE_BASED loadScheme's rpe, else undefined.
// RIR = 10 - RPE. Undefined effort is ASSUMED to be RIR 2 (hardSetCredit.assumedRirWhenUndefined), so a
// prescription that states no effort neither gains nor loses credit; PROGRESSION_SOUNDNESS flags the
// missing effort separately.
//
// Credit: RIR <= fullCreditMaxRir -> 1; RIR >= zeroCreditMinRir -> 0; strictly between -> halfCredit.
// With the defaults (3 / 5 / 0.5) RIR 4 earns half credit, and so does any fractional RIR in (3, 5).
// All values are Tier 3/4 engine boundaries (see goal-profiles/hypertrophy.ts), not biological cutoffs.

import type { ExercisePrescriptionStructure } from "../types";
import type { GoalProfileConfig, HardSetCreditConfig } from "./types";

export const DEFAULT_HARD_SET_CREDIT: HardSetCreditConfig = {
  fullCreditMaxRir: 3,
  zeroCreditMinRir: 5,
  halfCredit: 0.5,
  assumedRirWhenUndefined: 2,
};

export function resolveHardSetCreditConfig(
  config?: Pick<GoalProfileConfig, "hardSetCredit">,
): HardSetCreditConfig {
  return config?.hardSetCredit ?? DEFAULT_HARD_SET_CREDIT;
}

/** The prescription's stated effort as RPE, or null when it states none. */
export function prescribedRpe(p: ExercisePrescriptionStructure): number | null {
  if (typeof p.targetRpe === "number" && Number.isFinite(p.targetRpe)) return p.targetRpe;
  if (p.loadScheme.type === "RPE_BASED" && Number.isFinite(p.loadScheme.rpe)) return p.loadScheme.rpe;
  return null;
}

export function hasDefinedEffort(p: ExercisePrescriptionStructure): boolean {
  return prescribedRpe(p) !== null;
}

/** Reps in reserve: 10 - RPE, or the assumed RIR when effort is undefined. */
export function prescribedRir(
  p: ExercisePrescriptionStructure,
  credit: HardSetCreditConfig = DEFAULT_HARD_SET_CREDIT,
): number {
  const rpe = prescribedRpe(p);
  return rpe === null ? credit.assumedRirWhenUndefined : 10 - rpe;
}

/** Credit for ONE set of this prescription: 1, halfCredit or 0. */
export function hardSetCredit(
  p: ExercisePrescriptionStructure,
  credit: HardSetCreditConfig = DEFAULT_HARD_SET_CREDIT,
): number {
  const rir = prescribedRir(p, credit);
  if (rir <= credit.fullCreditMaxRir) return 1;
  if (rir >= credit.zeroCreditMinRir) return 0;
  return credit.halfCredit;
}

/** targetSets x credit: the prescription's hard-set equivalents before muscle involvement is applied. */
export function creditedSets(
  p: ExercisePrescriptionStructure,
  credit: HardSetCreditConfig = DEFAULT_HARD_SET_CREDIT,
): number {
  return p.targetSets * hardSetCredit(p, credit);
}