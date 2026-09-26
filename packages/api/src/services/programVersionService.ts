// packages/api/src/services/programVersionService.ts
//
// The home of commitFromMutation — the ONLY function in the codebase that
// writes a new ProgramVersion. Two call sites exist by design (invariant 2):
//
//   1. commitFromDraft      — the Builder's manual "Commit" button
//                             (origin MANUAL_COMMIT with an optional draftId).
//   2. commitFromSimulation — the manual "Apply this change" button after a
//                             simulation (origin AI_APPLIED_SIMULATION with
//                             a simulationId).
//
// There is no third path. The function that produces the persisted structure
// is `applyMutation` from @training/domain, the same one simulate uses
// (invariant 2). If you find yourself adding a second write path for a
// "trivial" case, stop.
//
// Phase 6 change (ARCH-039 at close-out): a successful commit runs the same
// TrainingBlock close+open sequence as activateVersion. When
// Program.activeVersionId moves — whether via the manual "set active"
// action or as part of a commit — the prior block closes (COMPLETED if it
// had ≥1 COMPLETED Session, else ABANDONED) and a new one opens against the
// newly active version. This closes a gap in the phase-06 file's narrow
// reading of ARCH-016: without it, a fresh commit would leave the Program
// pointing at an active version with no block, and getOrCreateNext would
// have nowhere to put a Session (Session.trainingBlockId is non-null).
// Everything runs inside the SAME commit transaction — no new call site, no
// second mutation path.
//
// IMPORTANT (ARCH-011): this module is exported from packages/api and must
// never be reachable from packages/ai. The boundary test in
// packages/ai/src/__tests__/boundary.test.ts enforces that mechanically.

import { TRPCError } from "@trpc/server";
import {
  applyMutation,
  computeAnalysis,
  computeAssessment,
  computeFitScore,
  diffStructures,
  goalProfileRegistry,
  ASSESSMENT_ENGINE_VERSION,
  MutationError,
  type MutationSpec,
  type ProgramStructure,
  type StructureDiffEntry,
} from "@training/domain";
import {
  closeTrainingBlockInTx,
  countCompletedSessionsForBlockInTx,
  createAssessmentSnapshotInTx,
  createProgramVersionInTx,
  createRevisionInTx,
  createTrainingBlockInTx,
  findActiveTrainingBlockForProgramInTx,
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
 * (first commit).
 */
async function loadCurrentStructure(
  activeVersionId: string | null,
): Promise<ProgramStructure> {
  if (activeVersionId === null) return EMPTY_STRUCTURE;
  const version = await findVersionById(activeVersionId);
  if (!version) {
    throw new Error(
      `Program.activeVersionId references missing ProgramVersion ${activeVersionId}`,
    );
  }
  return version.structureSnapshot as ProgramStructure;
}

/**
 * Converts the domain's ProgramStructure into the shape
 * createProgramVersionInTx expects. Pure structural reshape.
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
 * Revision, its AssessmentSnapshot, flips the Program's activeVersionId,
 * closes any prior TrainingBlock + opens a new one against the new version,
 * and (for the manual path) marks the source draft COMMITTED — all in one
 * transaction with ARCH-026's timeout policy.
 *
 * Pre-transaction work (reads and pure computation; no DB connection held):
 *   - ownership check
 *   - stale-state check (invariant 6) for both paths
 *   - load reference data, goal, goal profile config
 *   - run applyMutation, computeAnalysis, computeAssessment, computeFitScore
 *
 * In-transaction work (all writes must succeed or fail together):
 *   - create ProgramVersion + derived rows
 *   - create Revision
 *   - create AssessmentSnapshot
 *   - flip Program.activeVersionId
 *   - close prior TrainingBlock (if any) + open a new one for the new version
 *   - mark source draft COMMITTED (manual path only)
 *
 * Concurrency note: the stale check runs before the transaction opens. Two
 * concurrent commits against the same base can, in a narrow window, both
 * pass the check and both write — @@unique([programId, versionNumber])
 * catches the version-number collision only if both compute the same N+1.
 * Best-effort semantics apply to both call sites, same as Phase 4/5.
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

  // ── Stale-state check (invariant 6) ────────────────────────────────────
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

  // ── Load current structure, apply the mutation ─────────────────────────
  const currentStructure = await loadCurrentStructure(program.activeVersionId);

  let nextStructure: ProgramStructure;
  try {
    nextStructure = applyMutation(currentStructure, mutation);
  } catch (err) {
    if (err instanceof MutationError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: err.message,
      });
    }
    throw err;
  }

  // ── Load reference data + goal profile config ──────────────────────────
  const referenceData = await loadExerciseReferenceData();

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

  // ── Deterministic engine ───────────────────────────────────────────────
  const analysis = computeAnalysis(nextStructure, referenceData, config);
  const assessmentResult = computeAssessment(analysis, config, { goalId });
  const fitScoreResult = computeFitScore(assessmentResult);

  // ── Persist (single transaction) ───────────────────────────────────────
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
      computedAt: new Date(assessmentResult.assessment.computedAt),
    });

    await setActiveVersionInTx(tx, programId, version.id);

    // ── TrainingBlock close + open (Phase 6, ARCH-039) ───────────────────
    //
    // Per ARCH-016, a commit moves activeVersionId, which IS activation.
    // The prior block closes (same COMPLETED/ABANDONED resolution as the
    // explicit activateVersion path), and a new block opens against the
    // just-committed version. Reads happen inside the transaction because
    // TrainingBlock has no unique constraint that would catch two ACTIVE
    // blocks for the same Program (Phase 6 kickoff fix).
    const currentBlock = await findActiveTrainingBlockForProgramInTx(
      tx,
      programId,
    );
    if (currentBlock !== null) {
      const completedCount = await countCompletedSessionsForBlockInTx(
        tx,
        currentBlock.id,
      );
      const closingStatus = completedCount > 0 ? "COMPLETED" : "ABANDONED";
      await closeTrainingBlockInTx(tx, currentBlock.id, closingStatus);
    }
    await createTrainingBlockInTx(tx, {
      userId,
      programVersionId: version.id,
      plannedLengthWeeks: null,
    });

    if (sourceDraftId !== null) {
      await markDraftCommittedInTx(tx, sourceDraftId, version.id);
    }

    // No "mark simulation applied" step: the Revision's sourceSimulationId
    // FK is the single source of truth for "this simulation was applied".
    // See ARCH-038.

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
 * commitFromMutation with the Simulation's stored mutationSpec.
 *
 * "Already applied" is derived from the Revision table, not stored on the
 * Simulation (ARCH-038): a Revision with sourceSimulationId = this
 * simulation's id is definitive evidence the mutation already produced a
 * version. A second attempt is rejected with SimulationAlreadyAppliedError.
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

// === PHASE 7 ADDITION ===
/**
 * Structural diff between two versions of the SAME Program.
 *
 * Reuses diffStructures from packages/domain (ARCH-037). Computed on demand;
 * never stored. This is the sole Phase 7 addition to this file — everything
 * above (commitFromMutation, the two call sites, the TrainingBlock close +
 * open, the AssessmentSnapshot write, the originVia label handling) is
 * shipped and unchanged.
 *
 * Error semantics (ARCH-040):
 *   - Either version missing → NOT_FOUND.
 *   - Versions from different Programs → BAD_REQUEST (wrong input shape,
 *     not a state failure).
 *   - Caller does not own the Program → NOT_FOUND (non-disclosure; enforced
 *     by loadOwnedProgramOrThrow).
 */
export async function diffVersions(
  userId: string,
  fromVersionId: string,
  toVersionId: string,
): Promise<StructureDiffEntry[]> {
  const from = await findVersionById(fromVersionId);
  const to = await findVersionById(toVersionId);

  if (!from || !to) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
  }
  if (from.programId !== to.programId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Versions belong to different Programs",
    });
  }

  await loadOwnedProgramOrThrow(userId, from.programId);

  return diffStructures(
    from.structureSnapshot as ProgramStructure,
    to.structureSnapshot as ProgramStructure,
  );
}