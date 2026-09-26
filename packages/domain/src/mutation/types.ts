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
//
// Phase 5 additions (below the MutationSpec family, which is unchanged from
// Phase 4): the types a SimulationResult is expressed in, the assessment-level
// "what changed" payload, and the on-demand structural-diff entry shape. None
// of these are persisted directly as their own column — the Simulation
// repository in packages/db maps SimulationResult onto the three Json columns
// the Phase 1 schema froze (resultAnalysis / resultAssessment / diff). See
// ARCH-036 / ARCH-037 and the service's persistence mapper.
//
// CANNOT_COMPUTE carries both assessments AND both analyses — the schema's
// Json columns are non-null, and recomputing the analyses at persistence time
// would defeat the single-engine-pass property (invariant 1). See ARCH-036
// addendum for the reasoning.

import type { Analysis } from "../analysis/types";
import type { AssessedAxis, AssessmentResult } from "../assessment/types";
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 additions — Simulation surface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The four outcomes a simulation's Net can take.
 *
 * `NO_MEANINGFUL_CHANGE` is distinct from a zero-value `MIXED` or a weak
 * `POSITIVE` — it is the case where the mutation changed nothing the
 * assessment actually notices (07-versioning-and-simulation.md §"meaningful
 * change"). The UI must render it as such, not as "neutral".
 */
export type SimulationNet =
  | "POSITIVE"
  | "NEGATIVE"
  | "MIXED"
  | "NO_MEANINGFUL_CHANGE";

/**
 * The assessment-level "what changed" payload, per
 * 07-versioning-and-simulation.md.
 *
 * `meaningful` is true iff at least one of the four component lists / fields
 * is non-empty — see `diffAssessments` (diff-assessments.ts) for the exact
 * rule. When `meaningful` is false, `net` is forced to `NO_MEANINGFUL_CHANGE`
 * regardless of the raw gain/cost lists.
 */
export interface WhatChangedResult {
  meaningful: boolean;
  /**
   * Axes whose band name changed between base and mutated (e.g. Low →
   * Adequate). Only BAND-typed statuses participate; UNVALIDATED axes are
   * impossible here because the caller only produces a COMPUTED result when
   * both assessments are VALIDATED.
   */
  statusTransitions: Array<{ axisKey: string; from: string; to: string }>;
  /**
   * Axes that entered or left one of the three surfaced sets. A single axis
   * can appear here twice (once ADDED, once REMOVED) across two sets.
   */
  membershipChanges: Array<{
    set: "STRENGTHS" | "ATTENTION" | "BIGGEST_OPPORTUNITY";
    axisKey: string;
    change: "ADDED" | "REMOVED";
  }>;
  /**
   * Fit Score band change (STRONG/DECENT/NEEDS_WORK). Null when the band did
   * not move, or when the Fit Score could not be derived on either side. The
   * derivation is rule-based ordinal projection — see computeFitScore.ts.
   */
  overallBandShift: { from: string; to: string } | null;
  /**
   * Pairs of (improved axis, worsened axis) present when the mutation
   * produced both gains and costs. Purely descriptive — the `net`
   * classification uses leverage-delta sums, not the existence of this list.
   */
  tradeOffs: Array<{ improved: string; worsened: string }>;
}

/**
 * The result of simulating one MutationSpec against a base ProgramStructure.
 *
 * A discriminated union keyed on `kind` — same discipline as ARCH-028 and
 * ARCH-030. Three cases, mutually exclusive:
 *
 *   - COMPUTED         — the mutation was valid, and both base and mutated
 *                        assessments are VALIDATED. Gain/Cost/Net and
 *                        What-Changed are present.
 *
 *   - CANNOT_COMPUTE   — the mutation was valid, but at least one of the two
 *                        assessments is UNVALIDATED (which is the shipped
 *                        state — see ARCH-029 / ARCH-032). Both assessments
 *                        AND both analyses are carried so a caller can
 *                        persist the row (the Simulation schema's Json
 *                        columns are non-null) and so the honest-state UI can
 *                        render the reason without re-running the engine.
 *                        No fabricated Gain/Cost/Net is present — invariant 1
 *                        would be violated by inventing one against an
 *                        unvalidated config.
 *
 *   - INVALID_MUTATION — applyMutation threw a typed MutationError (missing
 *                        id reference, duplicate id, reorder mismatch). The
 *                        error is carried verbatim so the caller can render
 *                        its `.code` / `.details` without a second parse.
 *
 * There is deliberately no partially-populated result: a caller must switch
 * on `kind` before reading any field, and each branch's fields are exactly
 * what that branch can honestly supply.
 */
export type SimulationResult =
  | {
      kind: "COMPUTED";
      baseAnalysis: Analysis;
      baseAssessment: AssessmentResult;
      mutatedStructure: ProgramStructure;
      mutatedAnalysis: Analysis;
      mutatedAssessment: AssessmentResult;
      gain: AssessedAxis[];
      cost: AssessedAxis[];
      net: SimulationNet;
      whatChanged: WhatChangedResult;
    }
  | {
      kind: "CANNOT_COMPUTE";
      reason: "ASSESSMENT_UNVALIDATED";
      baseAnalysis: Analysis;
      baseAssessment: AssessmentResult;
      mutatedAnalysis: Analysis;
      mutatedAssessment: AssessmentResult;
    }
  | {
      kind: "INVALID_MUTATION";
      error: MutationError;
    };

/**
 * One entry in the structural diff between two ProgramStructures.
 *
 * Computed on demand by `diffStructures` (diff-structures.ts), never stored
 * on a ProgramVersion (invariant 3, 03-domain-model.md §Revision). The
 * What-Changed payload the simulation surfaces is assessment-level, not this
 * — this diff exists for future history-view rendering, not for the
 * simulation UI's "no meaningful change" message.
 *
 * A single mutation may produce multiple entries (e.g. ADD_EXERCISE_PRESCRIPTION
 * against a day with an unchanged prescription list produces exactly one
 * ADDED_PRESCRIPTION; REPLACE_STRUCTURE against a heavily edited structure
 * produces one entry per change).
 */
export type StructureDiffEntry =
  | {
      op: "ADDED_WORKOUT_DAY";
      workoutDayId: string;
      name: string;
      orderIndex: number;
    }
  | {
      op: "REMOVED_WORKOUT_DAY";
      workoutDayId: string;
      name: string;
      orderIndex: number;
    }
  | {
      op: "REORDERED_WORKOUT_DAY";
      workoutDayId: string;
      fromIndex: number;
      toIndex: number;
    }
  | {
      op: "ADDED_PRESCRIPTION";
      workoutDayId: string;
      prescriptionId: string;
      exerciseId: string;
      orderIndex: number;
    }
  | {
      op: "REMOVED_PRESCRIPTION";
      workoutDayId: string;
      prescriptionId: string;
      exerciseId: string;
      orderIndex: number;
    }
  | {
      op: "MODIFIED_PRESCRIPTION";
      workoutDayId: string;
      prescriptionId: string;
      changedFields: string[];
    }
  | {
      op: "REORDERED_PRESCRIPTION";
      workoutDayId: string;
      prescriptionId: string;
      fromIndex: number;
      toIndex: number;
    };