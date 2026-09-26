// packages/api/src/services/simulationService.ts
//
// Orchestration for the simulate side of Phase 5.
//
//   - simulateAndPersist() — loads the active version, runs the pure
//                            simulate(), persists the Simulation row, and
//                            returns both the row id and the SimulationResult.
//
// commitFromSimulation() lives in programVersionService.ts next to
// commitFromDraft. Together they are the two and only two call sites of
// commitFromMutation (invariant 2); co-locating them makes that countable in
// code review.
//
// Persistence mapping (see the Simulation schema from Phase 1):
//
//   resultAnalysis   ← result.mutatedAnalysis       (the "after" Analysis)
//   resultAssessment ← result.mutatedAssessment     (the "after" Assessment)
//   diff             ← { kind, baseAnalysis, baseAssessment,
//                        [COMPUTED: mutatedStructure, gain, cost, net, whatChanged]
//                        [CANNOT_COMPUTE: reason] }
//
// The three Json columns are non-null; CANNOT_COMPUTE is persistable because
// it now carries both analyses and both assessments (ARCH-036 addendum). The
// INVALID_MUTATION branch is NOT persistable — there is no mutated structure
// to analyze — and returns without writing a row.
//
// Scope: `simulate()` is called against the Program's ACTIVE version only.
// The Phase 1 schema's Simulation.baseVersionId is a non-null FK to
// ProgramVersion; drafts cannot be a base for Phase 5's Simulation. A future
// phase that wants draft-base simulations would need a schema change.

import { TRPCError } from "@trpc/server";
import {
  goalProfileRegistry,
  simulate,
  type MutationSpec,
  type ProgramStructure,
  type SimulationResult,
} from "@training/domain";
import {
  createSimulation,
  findGoalById,
  findGoalProfileById,
  findVersionById,
  type SimulationRecord,
} from "@training/db";
import { loadOwnedProgramOrThrow } from "./loadOwnedProgram";
import { loadExerciseReferenceData } from "./referenceDataService";

export interface SimulateAndPersistResult {
  /**
   * null when the mutation was invalid and no row was written. Non-null for
   * COMPUTED and CANNOT_COMPUTE — the two persistable branches.
   */
  simulationId: string | null;
  result: SimulationResult;
}

/**
 * The payload written to the `diff` column.
 *
 * Deliberately plain objects (not a discriminated-union type) — the column
 * is opaque JSON from Prisma's perspective, and the shape is a wiring
 * detail, not a domain contract. The type that consumers read is
 * SimulationResult; a future phase that needs to read this column back
 * writes a mapper in this file, not a domain type.
 */
function buildDiffPayload(
  result: Extract<SimulationResult, { kind: "COMPUTED" | "CANNOT_COMPUTE" }>,
): Record<string, unknown> {
  if (result.kind === "COMPUTED") {
    return {
      kind: "COMPUTED",
      baseAnalysis: result.baseAnalysis,
      baseAssessment: result.baseAssessment,
      mutatedStructure: result.mutatedStructure,
      gain: result.gain,
      cost: result.cost,
      net: result.net,
      whatChanged: result.whatChanged,
    };
  }
  return {
    kind: "CANNOT_COMPUTE",
    reason: result.reason,
    baseAnalysis: result.baseAnalysis,
    baseAssessment: result.baseAssessment,
  };
}

/**
 * Loads the base structure, runs the deterministic engine through the pure
 * simulate(), persists the Simulation row, and returns id + result.
 *
 * Throws (never returns a partial success):
 *   - NOT_FOUND           — caller does not own the program
 *   - PRECONDITION_FAILED — program has no active version to simulate against
 *   - Internal errors     — a missing Goal / GoalProfileDefinition (data
 *                           integrity), same failure modes as
 *                           commitFromMutation
 */
export async function simulateAndPersist(
  userId: string,
  programId: string,
  mutation: MutationSpec,
): Promise<SimulateAndPersistResult> {
  const program = await loadOwnedProgramOrThrow(userId, programId);

  if (program.activeVersionId === null) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This program has no committed version yet. Commit one before simulating a change.",
    });
  }
  const baseVersion = await findVersionById(program.activeVersionId);
  if (!baseVersion) {
    throw new Error(
      `Program.activeVersionId references missing ProgramVersion ${program.activeVersionId}`,
    );
  }

  if (!program.currentGoalId) {
    throw new Error(
      `Program ${programId} has no currentGoalId — createMyProgram should have set one`,
    );
  }
  const goalId: string = program.currentGoalId;

  const goal = await findGoalById(goalId);
  if (!goal) {
    throw new Error(`Program.currentGoalId references missing Goal ${goalId}`);
  }
  const profileRow = await findGoalProfileById(goal.goalProfileId);
  if (!profileRow) {
    throw new Error(
      `Goal.goalProfileId references missing GoalProfileDefinition ${goal.goalProfileId}`,
    );
  }
  const profileDefinition = goalProfileRegistry.get(profileRow.key);
  const config = profileDefinition.loadConfig();

  const referenceData = await loadExerciseReferenceData();
  const baseStructure = baseVersion.structureSnapshot as ProgramStructure;

  const result = simulate(baseStructure, mutation, config, referenceData, {
    goalId,
  });

  // ── INVALID_MUTATION: nothing to persist ──────────────────────────────────
  //
  // There is no mutated structure, so resultAnalysis / resultAssessment
  // cannot be populated. The three Json columns are non-null; writing an
  // empty marker object would leave a reader unable to distinguish "invalid
  // mutation" from "empty payload". Return the result without a row.
  //
  // This is a first-class return, not an error: the caller checks `kind`.
  // The Coach (Phase 8) narrates an invalid mutation without a crash; the
  // router procedure surfaces it identically.
  if (result.kind === "INVALID_MUTATION") {
    return { simulationId: null, result };
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  //
  // Both COMPUTED and CANNOT_COMPUTE reach here. The narrowing above leaves
  // `result` as COMPUTED | CANNOT_COMPUTE; both carry mutatedAnalysis and
  // mutatedAssessment (the CANNOT_COMPUTE extension is ARCH-036 addendum).
  const persisted: SimulationRecord = await createSimulation({
    programId,
    baseVersionId: baseVersion.id,
    goalId,
    mutationSpec: mutation,
    resultAnalysis: result.mutatedAnalysis,
    resultAssessment: result.mutatedAssessment,
    diff: buildDiffPayload(result),
    createdByConversationId: null, // Phase 8 wires the conversation id
  });

  return { simulationId: persisted.id, result };
}