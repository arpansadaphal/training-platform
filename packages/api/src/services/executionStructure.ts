// packages/api/src/services/executionStructure.ts
//
// ARCH-058: the structure execution data must be joined against.
//
// Sessions reference WorkoutDay row ids and PerformanceRecords reference
// ExercisePrescription row ids. Those are database cuids assigned at commit,
// while ProgramVersion.structureSnapshot keeps the Builder's client-local ids
// ("day-…", "rx-…"). Joining logged data against the snapshot therefore
// matched nothing for any Builder-made program. This helper projects the
// normalized rows back into a ProgramStructure, so adherence code can keep its
// ProgramStructure-shaped inputs while joining on the ids execution actually
// uses. The snapshot stays the source for the assessment (ARCH-015).

import { findVersionWithStructure } from "@training/db";
import type { LoadScheme, ProgramStructure } from "@training/domain";

export async function loadExecutionStructure(
  versionId: string,
): Promise<ProgramStructure> {
  const version = await findVersionWithStructure(versionId);
  if (!version) {
    throw new Error(`ProgramVersion ${versionId} not found`);
  }
  return {
    workoutDays: version.workoutDays.map((d) => ({
      id: d.id,
      orderIndex: d.orderIndex,
      name: d.name,
      ...(d.isRestDay ? { isRestDay: true } : {}),
      prescriptions: d.prescriptions.map((p) => ({
        id: p.id,
        orderIndex: p.orderIndex,
        exerciseId: p.exerciseId,
        targetSets: p.targetSets,
        targetRepsLow: p.targetRepsLow,
        targetRepsHigh: p.targetRepsHigh,
        ...(p.targetRpe === null ? {} : { targetRpe: Number(p.targetRpe) }),
        loadScheme: p.loadScheme as LoadScheme,
      })),
    })),
  };
}
