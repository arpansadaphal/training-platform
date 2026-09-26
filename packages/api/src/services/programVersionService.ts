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
//   2. The AI Coach's client-triggered "Apply this change" — origin
//      AI_APPLIED_SIMULATION with a simulationId. Implemented in Phase 8.
//
// There is no third path. The function that produces the persisted structure
// is `applyMutation` from @training/domain, the same one simulate uses
// (invariant 2). If you find yourself adding a second write path for a
// "trivial" case, stop.
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
  findDraftById,
  findGoalById,
  findGoalProfileById,
  findVersionById,
  getMaxVersionNumber,
  markDraftCommittedInTx,
  prisma,
  setActiveVersionInTx,
  TRANSACTION_OPTIONS,
  type ProgramVersionRecord,
} from "@training/db";
import { DraftNotActiveError, StaleDraftError } from "../errors";
import { loadOwnedProgramOrThrow } from "./loadOwnedProgram";
import { loadExerciseReferenceData } from "./referenceDataService";

const EMPTY_STRUCTURE: ProgramStructure = { workoutDays: [] };

/**
 * Where a commit came from. Widened from 07-versioning-and-simulation.md's
 * literal shape to carry the optional draftId needed to atomically flip a
 * draft to COMMITTED inside the same transaction as the version write.
 * Phase 8 adds nothing to this type — the AI path already fits it. See
 * ARCH-033 (logged at Phase 4 close-out).
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
 *   - stale-state check (invariant 6) for the manual path
 *   - load reference data, goal, goal profile config
 *   - run applyMutation, computeAnalysis, computeAssessment, computeFitScore
 *
 * Rationale for running these before the transaction: they are either reads
 * (safe outside) or pure computation (no DB connection held). Keeping them
 * outside means the transaction window is as short as possible — the same
 * reason ARCH-026's timeouts exist.
 */
export async function commitFromMutation(
  userId: string,
  programId: string,
  mutation: MutationSpec,
  origin: CommitOrigin,
): Promise<ProgramVersionRecord> {
  const program = await loadOwnedProgramOrThrow(userId, programId);

  // ── Stale-state check (invariant 6) ────────────────────────────────────────
  //
  // For MANUAL_COMMIT with a draftId, the draft's baseVersionId is compared to
  // the program's current activeVersionId. If they differ, the commit is
  // rejected with a typed error so the client can offer "clone the current
  // version and re-apply your edits" rather than silently overwriting whatever
  // happened in between.
  //
  // For AI_APPLIED_SIMULATION, the equivalent check compares a Simulation's
  // baseVersionId — Phase 8's responsibility. Phase 4 never emits this origin;
  // the throw makes the un-implemented path impossible to reach silently.
  let sourceDraftId: string | null = null;
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
    // Phase 8 replaces this with the equivalent simulation.baseVersionId
    // comparison. The throw is deliberate: leaving the branch as a no-op
    // would let a Phase-8-wired caller reach a commit without the invariant-6
    // guarantee, which is exactly the silent-overwrite failure the invariant
    // forbids.
    throw new Error(
      "AI_APPLIED_SIMULATION commit path is not implemented until Phase 8",
    );
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
    throw new Error(
      `Program.currentGoalId references missing Goal ${goalId}`,
    );
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
      createdVia: "MANUAL_COMMIT",
      workoutDays: toNormalizedRows(nextStructure),
    });

    await createRevisionInTx(tx, {
      programId,
      fromVersionId: program.activeVersionId,
      toVersionId: version.id,
      trigger: "MANUAL_COMMIT",
      sourceSimulationId: null,
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