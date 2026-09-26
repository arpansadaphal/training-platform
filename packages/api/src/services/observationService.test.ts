// packages/api/src/services/observationService.test.ts
//
// Phase 6: Observation capture.
//
// An Observation may attach to a Session, to a TrainingBlock, or stand
// alone. The listForBlock reader returns BOTH block-scoped observations and
// observations attached to sessions within the block — that union is what
// Phase 7's Review needs.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupTrackedUsers,
  findActiveTrainingBlockForProgram,
  listExercises,
  makeTestUser,
  type UserRecord,
} from "@training/db";
import type { ProgramStructure } from "@training/domain";
import { createMyProgram } from "./programService";
import { createMyDraft, updateMyDraftStructure } from "./draftService";
import { commitFromDraft } from "./programVersionService";
import { getOrCreateNext } from "./sessionService";
import {
  createMyObservation,
  listMyObservationsForBlock,
  listMyObservationsForSession,
} from "./observationService";

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

async function setup(user: UserRecord): Promise<{
  programId: string;
  blockId: string;
  sessionId: string;
}> {
  const program = await createMyProgram(user.id, "Phase6 Observation");
  const draft = await createMyDraft(user.id, program.id, { label: "v1" });
  await updateMyDraftStructure(user.id, draft.id, await makeStructure());
  await commitFromDraft(user.id, draft.id);

  const block = await findActiveTrainingBlockForProgram(program.id);
  if (!block) throw new Error("No active block after commit");
  const session = await getOrCreateNext(user.id, program.id);
  return { programId: program.id, blockId: block.id, sessionId: session.id };
}

describe("observationService", () => {
  let user: UserRecord;

  beforeEach(async () => {
    user = await makeTestUser("Phase6 Observation");
  });

  afterEach(cleanupTrackedUsers);

  it("createMyObservation allows a standalone observation (no session, no block)", async () => {
    const obs = await createMyObservation(user.id, {
      content: "Slept poorly last night; keeping it light today.",
    });
    expect(obs.content).toMatch(/Slept poorly/);
    expect(obs.sessionId).toBeNull();
    expect(obs.trainingBlockId).toBeNull();
  });

  it("createMyObservation attached to a session", async () => {
    const { sessionId } = await setup(user);
    const obs = await createMyObservation(user.id, {
      sessionId,
      content: "Left shoulder felt tight on the first set.",
    });
    expect(obs.sessionId).toBe(sessionId);
  });

  it("createMyObservation attached to a block", async () => {
    const { blockId } = await setup(user);
    const obs = await createMyObservation(user.id, {
      trainingBlockId: blockId,
      content: "This block feels sustainable so far.",
    });
    expect(obs.trainingBlockId).toBe(blockId);
  });

  it("createMyObservation accepts structuredFields as a JSON object", async () => {
    const { sessionId } = await setup(user);
    const obs = await createMyObservation(user.id, {
      sessionId,
      content: "Energy low.",
      structuredFields: { sleepHours: 5.5, soreness: 3 },
    });
    expect(obs.structuredFields).toMatchObject({
      sleepHours: 5.5,
      soreness: 3,
    });
  });

  it("listMyObservationsForBlock returns both block-scoped and session-scoped observations", async () => {
    const { blockId, sessionId } = await setup(user);

    await createMyObservation(user.id, {
      trainingBlockId: blockId,
      content: "Block-level note.",
    });
    await createMyObservation(user.id, {
      sessionId,
      content: "Session-level note.",
    });
    // An unrelated standalone observation must NOT appear.
    await createMyObservation(user.id, {
      content: "Standalone — not part of this block.",
    });

    const forBlock = await listMyObservationsForBlock(user.id, blockId);
    const contents = forBlock.map((o) => o.content);
    expect(contents).toContain("Block-level note.");
    expect(contents).toContain("Session-level note.");
    expect(contents).not.toContain("Standalone — not part of this block.");
  });

  it("listMyObservationsForSession returns only the session's own observations", async () => {
    const { blockId, sessionId } = await setup(user);
    await createMyObservation(user.id, {
      sessionId,
      content: "Session-only note.",
    });
    await createMyObservation(user.id, {
      trainingBlockId: blockId,
      content: "Block-only note.",
    });

    const forSession = await listMyObservationsForSession(user.id, sessionId);
    const contents = forSession.map((o) => o.content);
    expect(contents).toContain("Session-only note.");
    expect(contents).not.toContain("Block-only note.");
  });

  it("createMyObservation rejects when the session belongs to another user", async () => {
    const { sessionId } = await setup(user);
    const other = await makeTestUser("Phase6 Other");
    await expect(
      createMyObservation(other.id, {
        sessionId,
        content: "Should not be allowed.",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("createMyObservation rejects when the block belongs to another user", async () => {
    const { blockId } = await setup(user);
    const other = await makeTestUser("Phase6 Other 2");
    await expect(
      createMyObservation(other.id, {
        trainingBlockId: blockId,
        content: "Should not be allowed.",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("listMyObservationsForBlock rejects a block the caller does not own", async () => {
    const { blockId } = await setup(user);
    const other = await makeTestUser("Phase6 Other 3");
    await expect(
      listMyObservationsForBlock(other.id, blockId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});