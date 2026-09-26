// packages/api/src/services/loadOwnedProgram.ts
//
// Shared ownership-check helper. Every service that reads or mutates a
// Program goes through this — a caller who is not the owner receives
// NOT_FOUND (deliberately, not FORBIDDEN) so the API does not leak the
// existence of another user's Program.
//
// Extracted from programService.ts in Phase 4 so draftService and
// programVersionService can reuse it without duplicating the rule.

import { TRPCError } from "@trpc/server";
import { findProgramById, type ProgramRecord } from "@training/db";

export async function loadOwnedProgramOrThrow(
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