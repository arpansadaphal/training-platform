// Orchestration service for Program CRUD.
//
// Phase 1 proved the schema and repository layer work end-to-end. Phase 4
// adds the "auto-create a Goal on Program.create" flow (Q5 resolution).
// Phase 6 extends archiveMyProgram: archiving a Program closes its open
// TrainingBlock in the SAME transaction as the archivedAt write, reading
// the block's session history inside that transaction (kickoff fix A6).
//
// Archive close-status rule: applies the same COMPLETED / ABANDONED
// resolution as the activateVersion and commit paths — COMPLETED iff the
// block had ≥1 Session with status = COMPLETED. The Phase 6 phase file's
// literal wording ("as ABANDONED if it wasn't already COMPLETED") would
// force a successful block to read as abandoned on archive, which
// contradicts ARCH-016's intent; A6 resolved in favor of the consistent
// rule. See DECISIONS.md at Phase 6 close-out.
//
// Authorization: every read/mutation below re-checks ownership via
// loadOwnedProgramOrThrow.

import {
  archiveProgramInTx,
  closeTrainingBlockInTx,
  countCompletedSessionsForBlockInTx,
  createProgramInTx,
  createGoalInTx,
  findActiveTrainingBlockForProgramInTx,
  findGoalProfileByKey,
  listProgramsByOwner,
  prisma,
  renameProgram as renameProgramRepo,
  TRANSACTION_OPTIONS,
  type ProgramRecord,
} from "@training/db";
import { loadOwnedProgramOrThrow } from "./loadOwnedProgram";

/**
 * Key of the sole GoalProfileDefinition seeded at MVP. When a second profile
 * lands (Phase 9's Strength), this becomes the "default" choice and a
 * goal-picker UI appears; Phase 4 just hardwires it.
 */
const DEFAULT_GOAL_PROFILE_KEY = "HYPERTROPHY";

/**
 * Creates a Program together with its initial Goal, in one transaction.
 *
 * The transaction ensures a Program never exists momentarily without a
 * currentGoalId — which would leave the Builder with no Assessment input on
 * a fresh Program. Flipping the schema to make currentGoalId required is
 * deliberately not done here; the transactional create gives the same
 * guarantee at the service layer without a migration.
 *
 * Note: this does NOT create a TrainingBlock. A Program has no
 * activeVersionId until its first commit, and no block exists until
 * then. See programVersionService.commitFromMutation for the block-open
 * trigger.
 */
export async function createMyProgram(
  userId: string,
  name: string,
): Promise<ProgramRecord> {
  const profileRow = await findGoalProfileByKey(DEFAULT_GOAL_PROFILE_KEY);
  if (!profileRow) {
    // The seed is a prerequisite for program.create. Failing loudly is
    // correct — silently creating a Program with no goal would leave the
    // Builder broken in a way that's harder to diagnose than this error.
    throw new Error(
      `Goal profile "${DEFAULT_GOAL_PROFILE_KEY}" is not seeded. Run the seed before creating a Program.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const goal = await createGoalInTx(tx, { goalProfileId: profileRow.id });
    return createProgramInTx(tx, {
      ownerUserId: userId,
      name,
      currentGoalId: goal.id,
    });
  }, TRANSACTION_OPTIONS);
}

export async function listMyPrograms(
  userId: string,
  includeArchived = false,
): Promise<ProgramRecord[]> {
  return listProgramsByOwner(userId, { includeArchived });
}

export async function getMyProgram(
  userId: string,
  programId: string,
): Promise<ProgramRecord> {
  return loadOwnedProgramOrThrow(userId, programId);
}

export async function renameMyProgram(
  userId: string,
  programId: string,
  name: string,
): Promise<ProgramRecord> {
  await loadOwnedProgramOrThrow(userId, programId);
  return renameProgramRepo(programId, name);
}

/**
 * Archives a Program and closes its open TrainingBlock in one transaction.
 *
 * Per ARCH-016, archiving closes the block if it was open. The close reads
 * the block's session history inside the same transaction (kickoff fix A6):
 *   - ≥1 Session with status = COMPLETED  →  close as COMPLETED
 *   - otherwise                            →  close as ABANDONED
 *
 * If the Program has no open block (never activated, or all blocks already
 * closed), the archive write happens alone. The transaction is still opened
 * so that the read and the write see a consistent snapshot — a Program
 * cannot be archived and then have a block open against it in a racing
 * commit, because the racing commit's transaction would fail the
 * programVersion / setActiveVersionInTx constraints differently (see note in
 * programVersionService).
 *
 * Idempotent: archiving an already-archived Program updates archivedAt to
 * "now" and does not re-close any block (there is none open, by definition).
 */
export async function archiveMyProgram(
  userId: string,
  programId: string,
): Promise<ProgramRecord> {
  await loadOwnedProgramOrThrow(userId, programId);

  return prisma.$transaction(async (tx) => {
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
    return archiveProgramInTx(tx, programId);
  }, TRANSACTION_OPTIONS);
}