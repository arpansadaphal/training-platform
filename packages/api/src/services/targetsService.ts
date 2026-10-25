// packages/api/src/services/targetsService.ts
//
// Maps logged history into the domain's next-session targets (ARCH-062). The
// rule itself is pure and lives in @training/domain; this file only decides
// which sets go in, in which unit, and how long the lifter has been away.
//
// Computed whenever a page is read; nothing here is stored or written.

import type { ExercisePerformanceRecord } from "@training/db";
import {
  computeNextTargets,
  type NextTarget,
  type WeightUnit,
} from "@training/domain";
import { groupBySession, unitOf } from "./exerciseHistory";

const MS_PER_DAY = 86_400_000;

/** Whole days between two instants, or null when there was no earlier one. */
export function wholeDaysSince(then: Date | null, now: Date): number | null {
  if (then === null) return null;
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / MS_PER_DAY));
}

export interface TargetablePrescription {
  id: string;
  exerciseId: string;
  targetSets: number;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe: number | null;
  loadScheme: unknown;
}

export interface PrescriptionTarget extends NextTarget {
  prescriptionId: string;
  exerciseId: string;
  /** The unit `weight` is in: the one the prescription is logged in. */
  unit: WeightUnit;
}

/**
 * A target for each prescription. `history` is the lifter's earlier COMPLETED
 * sets of these exercises, newest Session first; loads are converted into the
 * prescription's own unit before the rule reads them.
 */
export function computeTargetsForPrescriptions(args: {
  prescriptions: readonly TargetablePrescription[];
  equipmentByExerciseId: ReadonlyMap<string, string | null>;
  history: readonly ExercisePerformanceRecord[];
  daysSinceLastTraining: number | null;
}): PrescriptionTarget[] {
  return args.prescriptions.map((p) => {
    const unit = unitOf(p.loadScheme);
    const sessions = groupBySession(
      args.history.filter((r) => r.exerciseId === p.exerciseId),
      unit,
    );
    const target = computeNextTargets({
      history: sessions,
      prescription: {
        targetSets: p.targetSets,
        repsLow: p.targetRepsLow,
        repsHigh: p.targetRepsHigh,
        plannedRpe: p.targetRpe,
      },
      equipment: args.equipmentByExerciseId.get(p.exerciseId) ?? null,
      unit,
      daysSinceLastTraining: args.daysSinceLastTraining,
    });
    return { ...target, prescriptionId: p.id, exerciseId: p.exerciseId, unit };
  });
}
