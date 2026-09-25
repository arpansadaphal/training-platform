// Orchestration service for Program CRUD.
//
// Thin by design — Phase 1 only needs to prove the schema and repository
// layer work end-to-end. No Analysis, no Assessment, no Draft logic.
//
// Authorization: every read/mutation below re-checks ownership. A caller
// who is not the owner receives NOT_FOUND (deliberately, not FORBIDDEN) so
// the API does not leak the existence of another user's Program.

import { TRPCError } from "@trpc/server";
import {
  createProgram,
  listProgramsByOwner,
  findProgramById,
  renameProgram as renameProgramRepo,
  archiveProgram as archiveProgramRepo,
  type ProgramRecord,
} from "@training/db";

async function loadOwnedProgramOrThrow(
  userId: string,
  programId: string,
): Promise<ProgramRecord> {
  const program = await findProgramById(programId);
  if (!program || program.ownerUserId !== userId) {
    // Deliberately NOT_FOUND, not FORBIDDEN — do not reveal that another
    // user's Program exists.
    throw new TRPCError({ code: "NOT_FOUND", message: "Program not found" });
  }
  return program;
}

export async function createMyProgram(
  userId: string,
  name: string,
): Promise<ProgramRecord> {
  return createProgram({ ownerUserId: userId, name });
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