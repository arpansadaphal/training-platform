// packages/api/src/services/sessionService.test.ts
//
// Phase 6: lazy Session generation and status transitions.
//
// Rotation: getOrCreateNext walks the active version's WorkoutDays in
// orderIndex sequence, advancing one position past the latest Session and
// wrapping at the end. While a Session is PLANNED or IN_PROGRESS, it is
// returned unchanged — no duplicate is ever created.
//
// Transitions: PLANNED → IN_PROGRESS → COMPLETED, and PLANNED|IN_PROGRESS
// → SKIPPED. COMPLETED and SKIPPED are terminal.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupTrackedUsers,
  findSessionById,
  listExercises,
  makeTestUser,
  type UserRecord,
} from "@training/db";
import type { ProgramStructure } from "@training/domain";
import { createMyProgram } from "./programService";
import { createMyDraft, updateMyDraftStructure } from "./draftService";
import { commitFromDraft } from "./programVersionService";
import {
  getOrCreateNext,
  markStarted,
  markCompleted,
  markSkipped,
} from "./sessionService";

async function makeTwoDayStructure(): Promise<ProgramStructure> {
  const exercises = await listExercises();
  const first = exercises[0];
  const second = exercises[1];
  if (!first || !second) throw new Error("Seed missing exercises");
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
      {
        id: "day-b",
        orderIndex: 1,
        name: "Day B",
        prescriptions: [
          {
            id: "rx-b",
            orderIndex: 0,
            exerciseId: second.id,
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

async function makeStructureWithNoDays(): Promise<ProgramStructure> {
  return { workoutDays: [] };
}

async function setupCommittedProgram(user: UserRecord): Promise<{
  programId: string;
}> {
  const program = await createMyProgram(user.id, "Phase6 Session");
  const draft = await createMyDraft(user.id, program.id, { label: "v1" });
  await updateMyDraftStructure(user.id, draft.id, await makeTwoDayStructure());
  await commitFromDraft(user.id, draft.id);
  return { programId: program.id };
}

async function setupCommittedProgramNoDays(user: UserRecord): Promise<{
  programId: string;
}> {
  const program = await createMyProgram(user.id, "Phase6 Session Empty");
  const draft = await createMyDraft(user.id, program.id, { label: "v1" });
  await updateMyDraftStructure(
    user.id,
    draft.id,
    await makeStructureWithNoDays(),
  );
  await commitFromDraft(user.id, draft.id);
  return { programId: program.id };
}

describe("sessionService", () => {
  let user: UserRecord;

  beforeEach(async () => {
    user = await makeTestUser("Phase6 Session");
  });

  afterEach(cleanupTrackedUsers);

  it("getOrCreateNext creates the first Session against the first WorkoutDay", async () => {
    const { programId } = await setupCommittedProgram(user);
    const session = await getOrCreateNext(user.id, programId);
    expect(session.status).toBe("PLANNED");
    expect(session.sequenceIndex).toBe(0);
    // First session's workoutDayId should be day-a (orderIndex 0). We can't
    // assert the id directly because normalized rows have their own ids —
    // but we can assert sequenceIndex and that a follow-up skip advances.
  });

  it("getOrCreateNext returns the existing pending Session rather than creating a duplicate", async () => {
    const { programId } = await setupCommittedProgram(user);
    const first = await getOrCreateNext(user.id, programId);
    const second = await getOrCreateNext(user.id, programId);
    expect(second.id).toBe(first.id);
  });

  it("getOrCreateNext advances the rotation after a SKIPPED Session", async () => {
    const { programId } = await setupCommittedProgram(user);
    const s1 = await getOrCreateNext(user.id, programId);
    await markSkipped(user.id, s1.id);

    const s2 = await getOrCreateNext(user.id, programId);
    expect(s2.id).not.toBe(s1.id);
    expect(s2.sequenceIndex).toBe(1);

    await markSkipped(user.id, s2.id);

    // Two days in the structure; a third session wraps back to position 0.
    const s3 = await getOrCreateNext(user.id, programId);
    expect(s3.id).not.toBe(s2.id);
    expect(s3.sequenceIndex).toBe(2);
  });

  it("getOrCreateNext rejects when the Program has no active block", async () => {
    // A freshly-created Program has no committed version, therefore no block.
    const program = await createMyProgram(user.id, "No Block Yet");
    await expect(getOrCreateNext(user.id, program.id)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("getOrCreateNext rejects when the active version has zero WorkoutDays", async () => {
    const { programId } = await setupCommittedProgramNoDays(user);
    await expect(getOrCreateNext(user.id, programId)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("getOrCreateNext rejects a Program the caller does not own", async () => {
    const { programId } = await setupCommittedProgram(user);
    const other = await makeTestUser("Phase6 Other");
    await expect(getOrCreateNext(other.id, programId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("markStarted transitions PLANNED → IN_PROGRESS and stamps startedAt", async () => {
    const { programId } = await setupCommittedProgram(user);
    const session = await getOrCreateNext(user.id, programId);
    const updated = await markStarted(user.id, session.id);
    expect(updated.status).toBe("IN_PROGRESS");
    expect(updated.startedAt).not.toBeNull();
  });

  it("markStarted rejects a second transition on an IN_PROGRESS Session", async () => {
    const { programId } = await setupCommittedProgram(user);
    const session = await getOrCreateNext(user.id, programId);
    await markStarted(user.id, session.id);
    await expect(markStarted(user.id, session.id)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("markCompleted rejects a PLANNED Session (must be IN_PROGRESS first)", async () => {
    const { programId } = await setupCommittedProgram(user);
    const session = await getOrCreateNext(user.id, programId);
    await expect(markCompleted(user.id, session.id)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("markCompleted transitions IN_PROGRESS → COMPLETED and stamps completedAt", async () => {
    const { programId } = await setupCommittedProgram(user);
    const session = await getOrCreateNext(user.id, programId);
    await markStarted(user.id, session.id);
    const updated = await markCompleted(user.id, session.id);
    expect(updated.status).toBe("COMPLETED");
    expect(updated.completedAt).not.toBeNull();
  });

  it("markSkipped transitions PLANNED → SKIPPED", async () => {
    const { programId } = await setupCommittedProgram(user);
    const session = await getOrCreateNext(user.id, programId);
    const updated = await markSkipped(user.id, session.id);
    expect(updated.status).toBe("SKIPPED");
  });

  it("markSkipped rejects a COMPLETED Session (terminal)", async () => {
    const { programId } = await setupCommittedProgram(user);
    const session = await getOrCreateNext(user.id, programId);
    await markStarted(user.id, session.id);
    await markCompleted(user.id, session.id);
    await expect(markSkipped(user.id, session.id)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("markStarted rejects a Session the caller does not own", async () => {
    const { programId } = await setupCommittedProgram(user);
    const session = await getOrCreateNext(user.id, programId);
    const other = await makeTestUser("Phase6 Other 3");
    await expect(markStarted(other.id, session.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    // And the session is untouched.
    const after = await findSessionById(session.id);
    expect(after?.status).toBe("PLANNED");
  });
});