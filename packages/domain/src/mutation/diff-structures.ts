// packages/domain/src/mutation/diff-structures.ts
//
// diffStructures — a pure, on-demand structural diff between two
// ProgramStructures.
//
// PURE: no I/O, no Prisma, no HTTP.
//
// This is NOT the "What Changed" payload the simulation surfaces to a user.
// That payload is assessment-level (see diff-assessments.ts). This diff is
// the raw structural difference, useful for a future history view that wants
// to answer "what did version 4 actually change from version 3" without
// replaying the mutation spec. Per 03-domain-model.md §Revision, this diff is
// computed on demand and never stored — invariant 3 forbids retrofitting it
// onto a committed ProgramVersion.
//
// Matching is by id:
//   - workout days     → WorkoutDayStructure.id
//   - prescriptions    → ExercisePrescriptionStructure.id
//
// Ids are stable within a mutation for ADD/MODIFY/REORDER; a REPLACE_STRUCTURE
// mutation that rebuilds everything from scratch will produce a full "remove
// everything, add everything" diff, which is correct but noisy. Consumers
// that want a semantic label on manual edits should read the mutation spec
// (which the Simulation persists) rather than this diff.
//
// Deterministic ordering: entries are emitted in a fixed traversal order —
// day add/remove/reorder first, then per-day prescription add/remove/
// modify/reorder. Iterating the mutated structure first for ADDs and the
// base structure first for REMOVEs means the output list order is stable
// across runs given the same inputs, satisfying the same determinism
// discipline the rest of the engine holds to.

import type {
  ExercisePrescriptionStructure,
  ProgramStructure,
  WorkoutDayStructure,
} from "../types";
import type { StructureDiffEntry } from "./types";

/**
 * Structural equality of a prescription's editable fields. `id` and
 * `orderIndex` are deliberately excluded — id is the identity (a change of
 * id means remove+add, not modify) and orderIndex is what the REORDERED
 * op reports, not MODIFIED.
 *
 * `targetRpe` is normalized through `?? null` on both sides so undefined and
 * null compare equal — matching how the Prisma repository normalizes it
 * (`targetRpe: p.targetRpe ?? null`).
 *
 * `loadScheme` is compared by JSON-serialization because LoadScheme is a
 * discriminated union whose branches have different field sets; a
 * field-by-field comparison would need one branch per `type`, and the JSON
 * form is stable (key insertion order is deterministic given the object
 * literal construction in apply-mutation's cloneLoadScheme). Not the fastest
 * comparison, but this diff is computed on demand, not in a hot path.
 */
function prescriptionEditedFields(
  base: ExercisePrescriptionStructure,
  mutated: ExercisePrescriptionStructure,
): string[] {
  const changed: string[] = [];
  if (base.exerciseId !== mutated.exerciseId) changed.push("exerciseId");
  if (base.targetSets !== mutated.targetSets) changed.push("targetSets");
  if (base.targetRepsLow !== mutated.targetRepsLow) changed.push("targetRepsLow");
  if (base.targetRepsHigh !== mutated.targetRepsHigh) changed.push("targetRepsHigh");
  if ((base.targetRpe ?? null) !== (mutated.targetRpe ?? null)) {
    changed.push("targetRpe");
  }
  if (
    JSON.stringify(base.loadScheme) !== JSON.stringify(mutated.loadScheme)
  ) {
    changed.push("loadScheme");
  }
  return changed;
}

/**
 * Compute the structural diff from `base` to `mutated`.
 *
 * The returned array may be empty if the two structures are structurally
 * identical (including orderIndex). A mutation that produced no visible
 * structural change still produces an empty array — this function does not
 * inspect the mutation spec, only the before/after structures.
 */
export function diffStructures(
  base: ProgramStructure,
  mutated: ProgramStructure,
): StructureDiffEntry[] {
  const entries: StructureDiffEntry[] = [];

  const baseDaysById = new Map<string, WorkoutDayStructure>();
  for (const d of base.workoutDays) baseDaysById.set(d.id, d);

  const mutatedDaysById = new Map<string, WorkoutDayStructure>();
  for (const d of mutated.workoutDays) mutatedDaysById.set(d.id, d);

  // ── Day-level add / remove / reorder ──────────────────────────────────────
  //
  // ADDs iterate `mutated` so the emitted order matches the target day
  // order; REMOVEs iterate `base` for the same reason against the source.

  for (const d of mutated.workoutDays) {
    if (!baseDaysById.has(d.id)) {
      entries.push({
        op: "ADDED_WORKOUT_DAY",
        workoutDayId: d.id,
        name: d.name,
        orderIndex: d.orderIndex,
      });
    }
  }

  for (const d of base.workoutDays) {
    if (!mutatedDaysById.has(d.id)) {
      entries.push({
        op: "REMOVED_WORKOUT_DAY",
        workoutDayId: d.id,
        name: d.name,
        orderIndex: d.orderIndex,
      });
    }
  }

  for (const d of mutated.workoutDays) {
    const baseDay = baseDaysById.get(d.id);
    if (baseDay === undefined) continue; // newly added; already reported
    if (baseDay.orderIndex !== d.orderIndex) {
      entries.push({
        op: "REORDERED_WORKOUT_DAY",
        workoutDayId: d.id,
        fromIndex: baseDay.orderIndex,
        toIndex: d.orderIndex,
      });
    }
  }

  // ── Prescription-level diff, per surviving day ────────────────────────────
  //
  // Days that appear in only one structure are reported at the day level
  // above and their inner prescriptions are NOT enumerated — a whole-day
  // add/remove already communicates "everything inside this day changed" and
  // enumerating each prescription would double the signal without adding
  // information.

  for (const mutatedDay of mutated.workoutDays) {
    const baseDay = baseDaysById.get(mutatedDay.id);
    if (baseDay === undefined) continue;

    const basePrescById = new Map<string, ExercisePrescriptionStructure>();
    for (const p of baseDay.prescriptions) basePrescById.set(p.id, p);

    const mutatedPrescById = new Map<string, ExercisePrescriptionStructure>();
    for (const p of mutatedDay.prescriptions) mutatedPrescById.set(p.id, p);

    for (const p of mutatedDay.prescriptions) {
      if (!basePrescById.has(p.id)) {
        entries.push({
          op: "ADDED_PRESCRIPTION",
          workoutDayId: mutatedDay.id,
          prescriptionId: p.id,
          exerciseId: p.exerciseId,
          orderIndex: p.orderIndex,
        });
      }
    }

    for (const p of baseDay.prescriptions) {
      if (!mutatedPrescById.has(p.id)) {
        entries.push({
          op: "REMOVED_PRESCRIPTION",
          workoutDayId: baseDay.id,
          prescriptionId: p.id,
          exerciseId: p.exerciseId,
          orderIndex: p.orderIndex,
        });
      }
    }

    for (const p of mutatedDay.prescriptions) {
      const baseP = basePrescById.get(p.id);
      if (baseP === undefined) continue; // newly added; already reported

      const changedFields = prescriptionEditedFields(baseP, p);
      if (changedFields.length > 0) {
        entries.push({
          op: "MODIFIED_PRESCRIPTION",
          workoutDayId: mutatedDay.id,
          prescriptionId: p.id,
          changedFields,
        });
      }

      if (baseP.orderIndex !== p.orderIndex) {
        entries.push({
          op: "REORDERED_PRESCRIPTION",
          workoutDayId: mutatedDay.id,
          prescriptionId: p.id,
          fromIndex: baseP.orderIndex,
          toIndex: p.orderIndex,
        });
      }
    }
  }

  return entries;
}