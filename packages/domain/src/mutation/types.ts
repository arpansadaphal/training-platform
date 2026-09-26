// packages/domain/src/mutation/types.ts
//
// The single MutationSpec type — the only shape of edit the system ever applies
// to a ProgramStructure. Both the simulate (preview) and commit (persist) routes
// call the same applyMutation function with a value of this type.
//
// See 07-versioning-and-simulation.md and invariant 2 in
// 00-product-freeze-reference.md. There is deliberately no second mutation type
// and no second mutation function; a "manual commit" is simply the case where
// the MutationSpec happens to be REPLACE_STRUCTURE.

import type {
  ExercisePrescriptionStructure,
  ProgramStructure,
  WorkoutDayStructure,
} from "../types";

/**
 * The set of structural edits the deterministic engine supports.
 *
 * Two "shapes" of mutation exist deliberately:
 *
 *  - Atomic ops (ADD_*, REMOVE_*, MODIFY_*, REORDER_*) map naturally to
 *    AI-proposed semantic changes ("add a chest day", "swap incline press for
 *    flat press") and give the model a legible tool schema.
 *
 *  - REPLACE_STRUCTURE is the natural shape for a manual Builder edit, where
 *    the user submits a whole edited structure rather than a keystroke-level
 *    diff. Its consequence — no semantic label on manual edits — is fine,
 *    because "What Changed" compares Assessments, not raw structural diffs
 *    (07-versioning-and-simulation.md).
 *
 * Both flow through the same applyMutation; there is no second code path.
 */
export type MutationSpec =
  | { op: "ADD_WORKOUT_DAY"; day: WorkoutDayStructure }
  | { op: "REMOVE_WORKOUT_DAY"; workoutDayId: string }
  | {
      op: "ADD_EXERCISE_PRESCRIPTION";
      workoutDayId: string;
      prescription: ExercisePrescriptionStructure;
    }
  | { op: "REMOVE_EXERCISE_PRESCRIPTION"; prescriptionId: string }
  | {
      op: "MODIFY_EXERCISE_PRESCRIPTION";
      prescriptionId: string;
      changes: Partial<ExercisePrescriptionStructure>;
    }
  | {
      op: "REORDER_EXERCISE_PRESCRIPTIONS";
      workoutDayId: string;
      orderedIds: string[];
    }
  | { op: "REPLACE_STRUCTURE"; structure: ProgramStructure };

export type MutationOp = MutationSpec["op"];

/**
 * Every failure mode applyMutation can raise. Kept as a string-literal union
 * (rather than a numeric enum) so callers can switch on it exhaustively and
 * a serialized error carries a readable code.
 */
export type MutationErrorCode =
  | "WORKOUT_DAY_NOT_FOUND"
  | "PRESCRIPTION_NOT_FOUND"
  | "DUPLICATE_WORKOUT_DAY_ID"
  | "DUPLICATE_PRESCRIPTION_ID"
  | "REORDER_MISMATCH"
  | "REORDER_DUPLICATE_ID";

/**
 * The typed error applyMutation throws on any invalid mutation.
 *
 * Callers in packages/api and packages/ai must catch this and surface a clear
 * message; it must never reach a user as a raw stack trace, and an AI-triggered
 * invalid mutation must never crash the Coach conversation (07-versioning-and-simulation.md).
 */
export class MutationError extends Error {
  readonly code: MutationErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: MutationErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "MutationError";
    this.code = code;
    this.details = details;
  }
}