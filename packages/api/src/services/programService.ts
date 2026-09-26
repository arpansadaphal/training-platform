// Orchestration service for Program CRUD.
//
// Phase 1 proved the schema and repository layer work end-to-end. Phase 4
// adds the "auto-create a Goal on Program.create" flow (Q5 resolution):
// MVP has exactly one GoalProfileDefinition (HYPERTROPHY), and every
// Program needs a currentGoalId from day one so the Builder has an
// Assessment input without a goal-picker UI.
//
// Authorization: every read/mutation below re-checks ownership via
// loadOwnedProgramOrThrow (extracted in Phase 4 to a shared module).

import {
  createProgramInTx,
  createGoalInTx,
  findGoalProfileByKey,
  listProgramsByOwner,
  renameProgram as renameProgramRepo,
  archiveProgram as archiveProgramRepo,
  prisma,
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

export async function archiveMyProgram(
  userId: string,
  programId: string,
): Promise<ProgramRecord> {
  await loadOwnedProgramOrThrow(userId, programId);
  return archiveProgramRepo(programId);
}