// packages/api/src/services/trainingService.test.ts
//
// Phase 6: TrainingBlock lifecycle.
//
// Covers the four lifecycle trigger points:
//   - First commit opens a block (ARCH-039).
//   - A subsequent commit closes the prior block and opens a new one
//     (ARCH-039).
//   - activateVersion is idempotent on the currently-active version.
//   - archiveMyProgram closes the open block.
//
// And the close-status resolution rule shared by all three:
//   - ≥1 COMPLETED Session  →  COMPLETED
//   - otherwise             →  ABANDONED
//
// Also covers the ownership / archived precondition.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupTrackedUsers,
  findActiveTrainingBlockForProgram,
  findTrainingBlockById,
  findVersionWithStructure,
  listExercises,
  makeTestUser,
  type UserRecord,
} from "@training/db";
import type { ProgramStructure } from "@training/domain";
import { createMyProgram, archiveMyProgram } from "./programService";
import { createMyDraft, updateMyDraftStructure } from "./draftService";
import { commitFromDraft } from "./programVersionService";
import { activateVersion, getCurrentBlock } from "./trainingService";
import { getOrCreateNext, markStarted, markCompleted } from "./sessionService";

async function makeStructure(): Promise<ProgramStructure> {
  const exercises = await listExercises();
  const first = exercises[0];
  if (!first) throw new Error("Seed missing exercises");
  return {
    workoutDays: [
      {
        id: "day-a",
        orderIndex: 0,
        name: "Day A",
        prescriptions: [
          {
            id: "rx-a",
            orderIndex: 0,
            exerciseId: first.id,
            targetSets: 3,
            targetRepsLow: 8,
            targetRepsHigh: 10,
            loadScheme: { type: "BODYWEIGHT" },
          },
        ],
      },
    ],
  };
}

async function getFirstPrescriptionId(versionId: string): Promise<string> {
  const version = await findVersionWithStructure(versionId);
  if (!version) throw new Error("Version not found");
  const day = version.workoutDays[0];
  if (!day) throw new Error("No workout day");
  const rx = day.prescriptions[0];
  if (!rx) throw new Error("No prescription");
  return rx.id;
}

/**
 * Commits a first version and returns the resulting ProgramVersionRecord's id.
 * Assumes the seed has at least one exercise.
 */
async function commitV1(userId: string, programId: string): Promise<string> {
  const draft = await createMyDraft(userId, programId, { label: "v1" });
  await updateMyDraftStructure(userId, draft.id, await makeStructure());
  const version = await commitFromDraft(userId, draft.id);
  return version.id;
}

describe("trainingService (Phase 6 lifecycle)", () => {
  let user: UserRecord;

  beforeEach(async () => {
    user = await makeTestUser("Phase6 Training");
  });

  afterEach(cleanupTrackedUsers);

  it("first commit opens a TrainingBlock (ARCH-039)", async () => {
    const program = await createMyProgram(user.id, "First Commit");
    expect(program.activeVersionId).toBeNull();
    expect(await findActiveTrainingBlockForProgram(program.id)).toBeNull();

    const versionId = await commitV1(user.id, program.id);
    const block = await findActiveTrainingBlockForProgram(program.id);

    expect(block).not.toBeNull();
    expect(block?.programVersionId).toBe(versionId);
    expect(block?.status).toBe("ACTIVE");
    expect(block?.userId).toBe(user.id);
    expect(block?.endedAt).toBeNull();
  });

  it("a subsequent commit closes the prior block and opens a new one (ARCH-039)", async () => {
    const program = await createMyProgram(user.id, "Two Commits");
    const v1Id = await commitV1(user.id, program.id);
    const block1 = await findActiveTrainingBlockForProgram(program.id);
    expect(block1?.programVersionId).toBe(v1Id);

    const versionId2 = await commitV1(user.id, program.id);
    expect(versionId2).not.toBe(v1Id);

    // block1 must now be closed. Since it had no COMPLETED Session, the
    // resolution is ABANDONED.
    const block1After = await findTrainingBlockById(block1!.id);
    expect(block1After?.status).toBe("ABANDONED");
    expect(block1After?.endedAt).not.toBeNull();

    // A new ACTIVE block must exist for v2.
    const block2 = await findActiveTrainingBlockForProgram(program.id);
    expect(block2).not.toBeNull();
    expect(block2?.id).not.toBe(block1!.id);
    expect(block2?.programVersionId).toBe(versionId2);
    expect(block2?.status).toBe("ACTIVE");
  });

  it("a block that had a COMPLETED Session closes as COMPLETED", async () => {
    const program = await createMyProgram(user.id, "Completed Block");
    const v1Id = await commitV1(user.id, program.id);
    const block1 = await findActiveTrainingBlockForProgram(program.id);
    expect(block1).not.toBeNull();

    // Complete one session in block1.
    const session = await getOrCreateNext(user.id, program.id);
    await markStarted(user.id, session.id);
    await markCompleted(user.id, session.id);

    // Commit v2 → block1 must close as COMPLETED.
    await commitV1(user.id, program.id);

    const block1After = await findTrainingBlockById(block1!.id);
    expect(block1After?.status).toBe("COMPLETED");
    expect(block1After?.endedAt).not.toBeNull();

    // Silence the unused-import warning — getFirstPrescriptionId is used by
    // performanceService.test.ts, not here. Kept as a reference helper.
    void v1Id;
  });

  it("activateVersion is idempotent on the currently-active version", async () => {
    const program = await createMyProgram(user.id, "Idempotent Activate");
    const v1Id = await commitV1(user.id, program.id);
    const blockBefore = await findActiveTrainingBlockForProgram(program.id);
    expect(blockBefore).not.toBeNull();

    const returned = await activateVersion(user.id, v1Id);
    expect(returned.id).toBe(blockBefore!.id);

    const blockAfter = await findActiveTrainingBlockForProgram(program.id);
    expect(blockAfter?.id).toBe(blockBefore!.id);
    expect(blockAfter?.status).toBe("ACTIVE");
  });

  it("activateVersion on an older version closes the current block and opens a new one", async () => {
    const program = await createMyProgram(user.id, "Reactivate Old");
    const v1Id = await commitV1(user.id, program.id);
    await commitV1(user.id, program.id); // v2 becomes active

    const block2 = await findActiveTrainingBlockForProgram(program.id);
    expect(block2?.programVersionId).not.toBe(v1Id);

    const returned = await activateVersion(user.id, v1Id);
    expect(returned.programVersionId).toBe(v1Id);
    expect(returned.status).toBe("ACTIVE");

    // Prior block (v2's) is closed as ABANDONED (no COMPLETED Session).
    const block2After = await findTrainingBlockById(block2!.id);
    expect(block2After?.status).toBe("ABANDONED");
    expect(block2After?.endedAt).not.toBeNull();
  });

  it("activateVersion rejects an archived Program", async () => {
    const program = await createMyProgram(user.id, "Archived Program");
    const v1Id = await commitV1(user.id, program.id);
    await archiveMyProgram(user.id, program.id);

    await expect(activateVersion(user.id, v1Id)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("activateVersion rejects a version the caller does not own", async () => {
    const program = await createMyProgram(user.id, "Owner Only");
    const v1Id = await commitV1(user.id, program.id);

    const other = await makeTestUser("Phase6 Other");
    await expect(activateVersion(other.id, v1Id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("activateVersion rejects a version that does not exist", async () => {
    await expect(
      activateVersion(user.id, "does-not-exist"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("archiveMyProgram closes the open block as ABANDONED when it had no completed Session", async () => {
    const program = await createMyProgram(user.id, "Archive ABANDONED");
    await commitV1(user.id, program.id);
    const block = await findActiveTrainingBlockForProgram(program.id);
    expect(block).not.toBeNull();

    await archiveMyProgram(user.id, program.id);

    const blockAfter = await findTrainingBlockById(block!.id);
    expect(blockAfter?.status).toBe("ABANDONED");
    expect(blockAfter?.endedAt).not.toBeNull();
  });

  it("archiveMyProgram closes the open block as COMPLETED when it had a completed Session", async () => {
    const program = await createMyProgram(user.id, "Archive COMPLETED");
    await commitV1(user.id, program.id);
    const block = await findActiveTrainingBlockForProgram(program.id);
    expect(block).not.toBeNull();

    const session = await getOrCreateNext(user.id, program.id);
    await markStarted(user.id, session.id);
    await markCompleted(user.id, session.id);

    await archiveMyProgram(user.id, program.id);

    const blockAfter = await findTrainingBlockById(block!.id);
    expect(blockAfter?.status).toBe("COMPLETED");
    expect(blockAfter?.endedAt).not.toBeNull();
  });

  it("getCurrentBlock returns null when no block is open, and the block after commit", async () => {
    const program = await createMyProgram(user.id, "Current Block");
    expect(await getCurrentBlock(user.id, program.id)).toBeNull();

    await commitV1(user.id, program.id);
    const block = await getCurrentBlock(user.id, program.id);
    expect(block).not.toBeNull();
    expect(block?.status).toBe("ACTIVE");
  });

  it("getCurrentBlock rejects a Program the caller does not own", async () => {
    const program = await createMyProgram(user.id, "Private");
    const other = await makeTestUser("Phase6 Other 2");
    await expect(getCurrentBlock(other.id, program.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  // Referenced so the helper stays exported and lint-clean; used in the
  // performanceService test file. Keeping the import graph honest.
  void getFirstPrescriptionId;
});