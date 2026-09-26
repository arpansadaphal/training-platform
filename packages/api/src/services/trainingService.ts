// packages/api/src/services/trainingService.ts
//
// Orchestration for TrainingBlock activation and lookup.
//
// This is NOT a commit path — it does not create a ProgramVersion, does not
// touch commitFromMutation, and must not become a third call site of it
// (invariant 2). activateVersion points Program.activeVersionId at an
// EXISTING committed ProgramVersion and opens the corresponding TrainingBlock;
// it never writes a new version.
//
// Lifecycle rule (ARCH-016, 08-training-execution-and-evidence.md):
//   - A block OPENS the moment a ProgramVersion becomes a Program's active
//     version.
//   - A block CLOSES when a different ProgramVersion becomes active, or when
//     the Program is archived. Status resolves to COMPLETED if the closing
//     block had at least one COMPLETED Session, else ABANDONED.
//   - There is no explicit "end block" user action.
//
// Phase 6 kickoff fix (accepted): all reads AND writes for the close+open
// sequence run inside ONE transaction. TrainingBlock has no unique constraint
// that would catch two ACTIVE blocks for the same Program (a partial unique
// index `WHERE status = 'ACTIVE'` cannot be expressed in Prisma's schema DSL
// without raw SQL, and raw-SQL migrations are out of Phase 6 scope). The
// commitFromMutation precedent — pre-transaction check plus a DB-level
// @@unique catch — does NOT apply here, because there is no such catch. The
// transaction is the only thing that makes "read current block, close it,
// open a new one" atomic.
//
// Scope of the archive path: the phase file places "Program archival closing
// an open TrainingBlock" on the archive action, not on this service. The
// archive block-close lives in programService.archiveMyProgram — see
// packages/api/src/services/programService.ts.

import { TRPCError } from "@trpc/server";
import {
  closeTrainingBlockInTx,
  countCompletedSessionsForBlockInTx,
  createTrainingBlockInTx,
  findActiveTrainingBlockForProgram,
  findActiveTrainingBlockForProgramInTx,
  findVersionById,
  prisma,
  setActiveVersionInTx,
  TRANSACTION_OPTIONS,
  type TrainingBlockRecord,
} from "@training/db";
import { loadOwnedProgramOrThrow } from "./loadOwnedProgram";

/**
 * Makes an existing committed ProgramVersion the Program's active version,
 * opening a new TrainingBlock for it.
 *
 * Pre-transaction checks (all reads, none of which mutate):
 *   - the version exists,
 *   - the caller owns the Program the version belongs to,
 *   - the Program is not archived.
 *
 * Then, inside one transaction with ARCH-026's timeouts:
 *   - read the Program's current ACTIVE block,
 *   - if the current block's programVersionId ALREADY equals the target
 *     version, return it unchanged — idempotent re-activation is a no-op,
 *     not a close-and-reopen,
 *   - otherwise close the current block (COMPLETED if it had ≥1 COMPLETED
 *     Session, else ABANDONED),
 *   - open a new ACTIVE block for the target version,
 *   - flip Program.activeVersionId.
 *
 * The four writes succeed or fail together; a partial application would leave
 * the Program pointing at a version with no block, or two ACTIVE blocks.
 */
export async function activateVersion(
  userId: string,
  programVersionId: string,
): Promise<TrainingBlockRecord> {
  const version = await findVersionById(programVersionId);
  if (!version) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Version not found",
    });
  }
  const program = await loadOwnedProgramOrThrow(userId, version.programId);
  if (program.archivedAt !== null) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Cannot activate a version on an archived program.",
    });
  }

  const programId = program.id;

  return prisma.$transaction(async (tx) => {
    const currentBlock = await findActiveTrainingBlockForProgramInTx(
      tx,
      programId,
    );

    // Idempotency: re-activating the version that is already active is a
    // no-op. This is NOT a "close and reopen" — no new block is created, and
    // the current block's session history is untouched.
    if (
      currentBlock !== null &&
      currentBlock.programVersionId === programVersionId
    ) {
      return currentBlock;
    }

    if (currentBlock !== null) {
      const completedCount = await countCompletedSessionsForBlockInTx(
        tx,
        currentBlock.id,
      );
      const closingStatus = completedCount > 0 ? "COMPLETED" : "ABANDONED";
      await closeTrainingBlockInTx(tx, currentBlock.id, closingStatus);
    }

    const newBlock = await createTrainingBlockInTx(tx, {
      userId,
      programVersionId,
      // Block length is informational (schema: `plannedLengthWeeks Int?`) and
      // Phase 6 has no UI for entering it. null is the honest value.
      plannedLengthWeeks: null,
    });

    await setActiveVersionInTx(tx, programId, programVersionId);

    return newBlock;
  }, TRANSACTION_OPTIONS);
}

/**
 * Read-only lookup for the Program's current ACTIVE block, or null if none.
 * Used by the /train page to decide whether to show "Start training" or
 * "Activate a version first".
 */
export async function getCurrentBlock(
  userId: string,
  programId: string,
): Promise<TrainingBlockRecord | null> {
  await loadOwnedProgramOrThrow(userId, programId);
  return findActiveTrainingBlockForProgram(programId);
}