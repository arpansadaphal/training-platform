// packages/api/src/services/programVersionService.ts
//
// The home of commitFromMutation — the ONLY function in the codebase that
// writes a new ProgramVersion. Two call sites exist by design (invariant 2,
// 07-versioning-and-simulation.md):
//
//   1. The Builder's manual "Commit" button — origin MANUAL_COMMIT with an
//      optional draftId. Implemented here as commitFromDraft, which routes
//      through commitFromMutation with a REPLACE_STRUCTURE mutation.
//
//   2. The manual "Apply this change" button after a simulation — origin
//      AI_APPLIED_SIMULATION with a simulationId. Implemented in Phase 5 as
//      commitFromSimulation, which loads the Simulation, re-verifies its
//      baseVersionId is still the program's active version, and delegates to
//      commitFromMutation with the Simulation's stored mutationSpec.
//
// There is no third path. The function that produces the persisted structure
// is `applyMutation` from @training/domain, the same one simulate uses
// (invariant 2). If you find yourself adding a second write path for a
// "trivial" case, stop.
//
// IMPORTANT (ARCH-011): this module is exported from packages/api and must
// never be reachable from packages/ai. The boundary test in
// packages/ai/src/__tests__/boundary.test.ts enforces that mechanically.
//
// Phase 5 change: `createdVia` and `trigger` are now read from origin.via
// rather than hardcoded "MANUAL_COMMIT". Prior to Phase 5 the AI branch threw
// before reaching the transaction, so the hardcode was technically correct —
// but as soon as the branch opened, every AI-applied version would be
// silently mislabeled. The full-stack invariant test asserts the correct
// label on both rows as a regression guard. See ARCH-033.

import { TRPCError } from "@trpc/server";
import {
  applyMutation,
  computeAnalysis,
  computeAssessment,
  computeFitScore,
  goalProfileRegistry,
  ASSESSMENT_ENGINE_VERSION,
  MutationError,
  type MutationSpec,
  type ProgramStructure,
} from "@training/domain";
import {
  createAssessmentSnapshotInTx,
  createProgramVersionInTx,
  createRevisionInTx,
  findAppliedRevisionForSimulation,
  findDraftById,
  findGoalById,
  findGoalProfileById,
  findSimulationById,
  findVersionById,
  getMaxVersionNumber,
  markDraftCommittedInTx,
  prisma,
  setActiveVersionInTx,
  TRANSACTION_OPTIONS,
  type ProgramVersionRecord,
} from "@training/db";
import {
  DraftNotActiveError,
  SimulationAlreadyAppliedError,
  StaleDraftError,
  StaleSimulationError,
} from "../errors";
import { loadOwnedProgramOrThrow } from "./loadOwnedProgram";
import { loadExerciseReferenceData } from "./referenceDataService";

const EMPTY_STRUCTURE: ProgramStructure = { workoutDays: [] };

/**
 * Where a commit came from. Widened from 07-versioning-and-simulation.md's
 * literal shape to carry the optional draftId needed to atomically flip a
 * draft to COMMITTED inside the same transaction as the version write, and
 * the simulationId needed to atomically link the Revision back to its
 * Simulation. See ARCH-033.
 */
export type CommitOrigin =
  | { via: "MANUAL_COMMIT"; draftId?: string }
  | { via: "AI_APPLIED_SIMULATION"; simulationId: string };

/**
 * Loads the Program's current committed structure.
 * Returns an empty structure when the Program has no active version yet
 * (first commit). The mutation is applied to this value; for
 * REPLACE_STRUCTURE the input is discarded by applyMutation anyway, but
 * routing through applyMutation on every commit is what keeps invariant 2
 * literally true in code.
 */
async function loadCurrentStructure(
  activeVersionId: string | null,
): Promise<ProgramStructure> {
  if (activeVersionId === null) return EMPTY_STRUCTURE;
  const version = await findVersionById(activeVersionId);
  if (!version) {
    // A non-null activeVersionId pointing at a missing row is a data-integrity
    // bug, not a user-facing condition. Fail loudly.
    throw new Error(
      `Program.activeVersionId references missing ProgramVersion ${activeVersionId}`,
    );
  }
  return version.structureSnapshot as ProgramStructure;
}

/**
 * Converts the domain's ProgramStructure into the shape
 * createProgramVersionInTx expects. Pure structural reshape — no
 * interpretation of the prescription fields, no default invention.
 */
function toNormalizedRows(structure: ProgramStructure) {
  return structure.workoutDays.map((day) => ({
    orderIndex: day.orderIndex,
    name: day.name,
    prescriptions: day.prescriptions.map((p) => ({
      orderIndex: p.orderIndex,
      exerciseId: p.exerciseId,
      targetSets: p.targetSets,
      targetRepsLow: p.targetRepsLow,
      targetRepsHigh: p.targetRepsHigh,
      targetRpe: p.targetRpe ?? null,
      loadScheme: p.loadScheme,
    })),
  }));
}

/**
 * The single commit function. Writes a new immutable ProgramVersion, its
 * Revision, its AssessmentSnapshot, flips the Program's activeVersionId, and
 * (for the manual path) marks the source draft COMMITTED — all in one
 * transaction with ARCH-026's timeout policy.
 *
 * Pre-transaction work:
 *   - ownership check
 *   - stale-state check (invariant 6) for the manual path (draft.baseVersionId)
 *     and for the AI-applied path (simulation.baseVersionId)
 *   - load reference data, goal, goal profile config
 *   - run applyMutation, computeAnalysis, computeAssessment, computeFitScore
 *
 * Rationale for running these before the transaction: they are either reads
 * (safe outside) or pure computation (no DB connection held). Keeping them
 * outside means the transaction window is as short as possible — the same
 * reason ARCH-026's timeouts exist.
 *
 * Concurrency note: the stale check runs before the transaction opens; the
 * same pattern Phase 4 shipped for the manual path. Two concurrent commits
 * against the same base can, in a narrow window, both pass the check and both
 * write — the @@unique([programId, versionNumber]) constraint catches the
 * version-number collision only if both compute the same N+1. This window is
 * not closed in Phase 5; the same best-effort semantics apply to both call
 * sites. A future phase that needs strict serialization would take a row lock
 * on Program inside the transaction.
 */
export async function commitFromMutation(
  userId: string,
  programId: string,
  mutation: MutationSpec,
  origin: CommitOrigin,
): Promise<ProgramVersionRecord> {
  const program = await loadOwnedProgramOrThrow(userId, programId);

  // VersionOrigin and RevisionTrigger are distinguished by CommitOrigin.via.
  // Do NOT hardcode "MANUAL_COMMIT" — the AI_APPLIED_SIMULATION path reaches
  // this transaction too. See ARCH-033.
  const originVia = origin.via;

  // ── Stale-state check (invariant 6) ────────────────────────────────────────
  //
  // MANUAL_COMMIT with a draftId: the draft's baseVersionId is compared to
  // the program's current activeVersionId. If they differ, the commit is
  // rejected with StaleDraftError so the client can offer "clone the current
  // version and re-apply your edits" rather than silently overwriting
  // whatever happened in between.
  //
  // AI_APPLIED_SIMULATION: the equivalent check compares the Simulation's
  // baseVersionId to the same pointer. A mismatch is a StaleSimulationError,
  // and the client re-runs simulate() before offering Apply again.
  let sourceDraftId: string | null = null;
  let sourceSimulationId: string | null = null;

  if (origin.via === "MANUAL_COMMIT" && origin.draftId) {
    const draft = await findDraftById(origin.draftId);
    if (!draft || draft.programId !== programId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
    }
    if (draft.status !== "ACTIVE") {
      throw new DraftNotActiveError({
        draftId: draft.id,
        draftStatus: draft.status,
      });
    }
    if (
      draft.baseVersionId !== null &&
      program.activeVersionId !== draft.baseVersionId
    ) {
      throw new StaleDraftError({
        draftId: draft.id,
        baseVersionId: draft.baseVersionId,
        currentVersionId: program.activeVersionId,
      });
    }
    sourceDraftId = draft.id;
  } else if (origin.via === "AI_APPLIED_SIMULATION") {
    const sim = await findSimulationById(origin.simulationId);
    if (!sim || sim.programId !== programId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Simulation not found",
      });
    }
    if (sim.baseVersionId !== program.activeVersionId) {
      throw new StaleSimulationError({
        simulationId: sim.id,
        baseVersionId: sim.baseVersionId,
        currentVersionId: program.activeVersionId,
      });
    }
    sourceSimulationId = sim.id;
  }

  // ── Load current structure, apply the mutation ─────────────────────────────
  const currentStructure = await loadCurrentStructure(program.activeVersionId);

  let nextStructure: ProgramStructure;
  try {
    nextStructure = applyMutation(currentStructure, mutation);
  } catch (err) {
    if (err instanceof MutationError) {
      // MutationError is a domain error (invalid id reference, duplicate id,
      // reorder mismatch, etc.). It must never reach the client as a raw
      // stack trace — 07-versioning-and-simulation.md explicitly requires a
      // clear message. Map to BAD_REQUEST so the UI can render it directly.
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: err.message,
      });
    }
    throw err;
  }

  // ── Load reference data + goal profile config ──────────────────────────────
  const referenceData = await loadExerciseReferenceData();

  if (!program.currentGoalId) {
    throw new Error(
      `Program ${programId} has no currentGoalId — createMyProgram should have set one`,
    );
  }
  // Capture after the narrowing check so the `string` type survives into the
  // transaction closure below (property-access narrowing does not survive an
  // async boundary).
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

  // ── Deterministic engine ───────────────────────────────────────────────────
  //
  // computeAnalysis takes (structure, referenceData, config) — the config
  // supplies the axis band definitions the analysis needs to resolve bands.
  // The Analysis payload's own programVersionId is null here: the analysis
  // is computed BEFORE the version row exists, and the version linkage is
  // recorded by the AssessmentSnapshot row itself, not inside the payload.
  const analysis = computeAnalysis(nextStructure, referenceData, config);
  const assessmentResult = computeAssessment(analysis, config, { goalId });
  const fitScoreResult = computeFitScore(assessmentResult);

  // ── Persist (single transaction) ───────────────────────────────────────────
  const nextVersionNumber = (await getMaxVersionNumber(programId)) + 1;

  return prisma.$transaction(async (tx) => {
    const version = await createProgramVersionInTx(tx, {
      programId,
      versionNumber: nextVersionNumber,
      structureSnapshot: nextStructure,
      createdVia: originVia,
      workoutDays: toNormalizedRows(nextStructure),
    });

    await createRevisionInTx(tx, {
      programId,
      fromVersionId: program.activeVersionId,
      toVersionId: version.id,
      trigger: originVia,
      sourceSimulationId,
      userNote: null,
    });

    await createAssessmentSnapshotInTx(tx, {
      programVersionId: version.id,
      goalId,
      engineVersion: ASSESSMENT_ENGINE_VERSION,
      thresholdsVersion: profileRow.configVersion,
      metrics: analysis,
      assessment: assessmentResult,
      fitScore: fitScoreResult,
      reason: "COMMIT",
      // Assessment.computedAt is the ISO string that arrived via
      // Analysis.computedAt; convert to Date for the persistence layer.
      computedAt: new Date(assessmentResult.assessment.computedAt),
    });

    await setActiveVersionInTx(tx, programId, version.id);

    if (sourceDraftId !== null) {
      await markDraftCommittedInTx(tx, sourceDraftId, version.id);
    }

    // No "mark simulation applied" step: the Revision's sourceSimulationId
    // FK is the single source of truth for "this simulation was applied".
    // A second write here would be a second source of truth for the same
    // fact. See ARCH-038.

    return version;
  }, TRANSACTION_OPTIONS);
}

/**
 * The Builder's "Commit" button path: loads the draft's current structure,
 * wraps it in a REPLACE_STRUCTURE MutationSpec, and routes through
 * commitFromMutation. The stale check and ownership check both run inside
 * commitFromMutation — this wrapper does not duplicate them.
 */
export async function commitFromDraft(
  userId: string,
  draftId: string,
): Promise<ProgramVersionRecord> {
  const draft = await findDraftById(draftId);
  if (!draft) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
  }

  const mutation: MutationSpec = {
    op: "REPLACE_STRUCTURE",
    structure: draft.structure as ProgramStructure,
  };

  return commitFromMutation(userId, draft.programId, mutation, {
    via: "MANUAL_COMMIT",
    draftId: draft.id,
  });
}

/**
 * The manual "Apply this change" path after a simulation. Loads the
 * Simulation, verifies it has not already been applied, and delegates to
 * commitFromMutation with the Simulation's stored mutationSpec — the same
 * mutation the user previewed, re-applied through the same applyMutation
 * (invariant 2).
 *
 * "Already applied" is derived from the Revision table, not stored on the
 * Simulation (ARCH-038): a Revision with sourceSimulationId = this
 * simulation's id is definitive evidence the mutation already produced a
 * version. A second attempt is rejected with SimulationAlreadyAppliedError,
 * not silently re-applied.
 */
export async function commitFromSimulation(
  userId: string,
  simulationId: string,
): Promise<ProgramVersionRecord> {
  const sim = await findSimulationById(simulationId);
  if (!sim) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Simulation not found",
    });
  }

  const applied = await findAppliedRevisionForSimulation(simulationId);
  if (applied) {
    throw new SimulationAlreadyAppliedError({
      simulationId,
      appliedAsVersionId: applied.toVersionId,
    });
  }

  const mutation = sim.mutationSpec as MutationSpec;

  return commitFromMutation(userId, sim.programId, mutation, {
    via: "AI_APPLIED_SIMULATION",
    simulationId: sim.id,
  });
}