// packages/api/src/services/simulationService.ts
//
// Orchestration for the simulate side of Phase 5, plus the Phase 8 Coach
// adapter.
//
//   - simulateAndPersist()          — loads the active version, runs the pure
//                                     simulate(), persists the Simulation row,
//                                     returns id + SimulationResult.
//   - simulateAndPersistForCoach()  — the Phase 8 adapter. Same underlying
//                                     service call, wrapped in the shape
//                                     CoachToolDeps.simulateAndPersist expects
//                                     (object input, not positional).
//   - loadOwnedSimulationForCoach() — ownership-checked load of a persisted
//                                     Simulation, projected to SimulationSummary.
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
  findSimulationById,
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
  /**
   * Provenance marker. Non-null when the simulation originated in a Coach
   * conversation; null when it originated from the simulation.simulate UI
   * path. Written verbatim to the row.
   */
  createdByConversationId: string | null = null,
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

  const referenceData = await loadExerciseReferenceData({
  goalProfileKey: config.goalProfileKey,
});
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
    createdByConversationId,
  });

  return { simulationId: persisted.id, result };
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 8 — Coach adapter
// ═══════════════════════════════════════════════════════════════════════════
//
// The Coach's simulate_program_change tool needs the same work the
// simulation.simulate tRPC procedure does. The tool cannot import this
// service directly (boundary test at
// packages/ai/src/__tests__/boundary.test.ts forbids @training/api imports
// from packages/ai). The coach router wires these two functions into
// CoachToolDeps, which is the sanctioned injection point (ARCH-011, ARCH-018,
// Phase 8 Q1).
//
// These adapters exist as NAMED functions — rather than inline arrows in the
// router — so a grep for either name lands on exactly one call site, and so
// a future change to the underlying service's signature touches this file,
// not the router.
//
// Neither adapter calls commitFromMutation or commitFromSimulation. The
// Coach cannot apply anything; the apply is a client-triggered procedure
// (ARCH-018).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Adapter shape for `CoachToolDeps.simulateAndPersist`.
 *
 * Structurally compatible with `SimulateAndPersistInput` in
 * packages/ai/src/tools/types.ts. Defined here (rather than imported) so
 * this service has no compile-time dependency on packages/ai — the wiring
 * is the router's job, and a drift between the two shapes fails type check
 * at the router's call site, which is where a reviewer is looking.
 *
 * `baseVersionId` is accepted but IGNORED. The underlying
 * `simulateAndPersist` always simulates against the program's
 * `activeVersionId`; the Coach has no way to force a specific base version.
 * That is the correct safety property — a stale `baseVersionId` in the
 * Coach's context cannot cause a simulation against the wrong version, and
 * the eventual apply is where staleness matters (commitFromSimulation's own
 * baseVersionId check, invariant 6). The field is kept on the input type
 * because packages/ai's context builder populates it and dropping it there
 * would be churn without benefit; the adapter's job is to route, not to
 * validate what the context builder put in.
 */
export interface CoachSimulateInput {
  userId: string;
  programId: string;
  baseVersionId: string;
  /**
   * Threaded through from the tool's `ctx.conversationId`. Written to the
   * Simulation row for provenance; the model cannot influence it (it arrives
   * from the authenticated session context, never from tool input).
   */
  conversationId: string;
  spec: MutationSpec;
}

export async function simulateAndPersistForCoach(
  input: CoachSimulateInput,
): Promise<SimulateAndPersistResult> {
  return simulateAndPersist(
    input.userId,
    input.programId,
    input.spec,
    input.conversationId,
  );
}

/**
 * Ownership-checked load of a persisted Simulation, projected to the shape
 * the Coach's prepare_apply_confirmation tool consumes.
 *
 * Ownership is checked via the Simulation's parent Program:
 *   simulation.programId → Program.userId === caller's userId
 * A Simulation row has no userId column of its own — its ownership is
 * derived. `loadOwnedProgramOrThrow` is the existing ownership authority for
 * Programs; wrapping it here keeps that authority in one place rather than
 * duplicating the check.
 *
 * The `humanSummary` is constructed HERE, server-side, from the persisted
 * Simulation row — never from anything the model supplied. This is the
 * safety property documented on SimulationSummary in
 * packages/ai/src/tools/types.ts: the string that appears on the user's
 * "Apply this change" button cannot be injected with arbitrary model text.
 */
export async function loadOwnedSimulationForCoach(input: {
  userId: string;
  simulationId: string;
}): Promise<{
  id: string;
  baseVersionId: string;
  humanSummary: string;
} | null> {
  const simulation = await findSimulationById(input.simulationId);
  if (!simulation) return null;

  // Ownership check via the parent Program. loadOwnedProgramOrThrow throws
  // TRPCError NOT_FOUND when the program does not exist or is not owned;
  // the tool's contract wants a null return, not a thrown error, so we
  // convert. Using try/catch here rather than adding a non-throwing
  // ownership loader is a deliberate trade — one extra loader for one call
  // site is worse than one wrapped throw with a comment.
  try {
    await loadOwnedProgramOrThrow(input.userId, simulation.programId);
  } catch {
    return null;
  }

  return {
    id: simulation.id,
    baseVersionId: simulation.baseVersionId,
    humanSummary: buildHumanSummary(simulation),
  };
}

/**
 * Build the human-facing label for a Simulation. Server-built from the
 * persisted mutation spec; the model cannot influence it.
 *
 * The summary names the mutation's operation and nothing else. It does not
 * paraphrase the mutation in prose — that would require reading and
 * interpreting the spec's payload, which is a job the deterministic engine
 * and the UI's existing SimulationResult rendering already do correctly. A
 * short, factual, engine-derived label is the right scope for a button.
 */
function buildHumanSummary(simulation: SimulationRecord): string {
  const op = readMutationOp(simulation.mutationSpec);
  return op ? `Apply simulated ${humanizeOp(op)}` : "Apply this change";
}

/**
 * Read the `op` field off a persisted MutationSpec. The column is opaque
 * JSON from Prisma's perspective; this is a defensive read that returns
 * undefined rather than throwing if the shape is unexpected.
 */
function readMutationOp(spec: unknown): string | undefined {
  if (!spec || typeof spec !== "object") return undefined;
  const record = spec as Record<string, unknown>;
  const op = record.op;
  return typeof op === "string" ? op : undefined;
}

function humanizeOp(op: string): string {
  return op.toLowerCase().replace(/_/g, " ");
}