// packages/api/src/services/performanceService.test.ts
//
// Phase 6: PerformanceRecord logging.
//
// The core property under test is the HONESTY requirement: a logged set is
// stored exactly as entered. The service does not reconcile actualReps /
// actualLoad / actualRpe against the prescription, and does not reject a
// deviation. This file asserts that directly — a set logged with values
// different from the target is stored unchanged.
//
// What IS rejected: an exercisePrescriptionId that does not belong to the
// Session's workout day. That's a client-side bug, not a deviation.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupTrackedUsers,
  findVersionWithStructure,
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
  logSet,
  logBatch,
  listMyRecordsForSession,
} from "./performanceService";

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

async function setupSession(user: UserRecord): Promise<{
  sessionId: string;
  prescriptionId: string;
}> {
  const program = await createMyProgram(user.id, "Phase6 Performance");
  const draft = await createMyDraft(user.id, program.id, { label: "v1" });
  await updateMyDraftStructure(user.id, draft.id, await makeStructure());
  const version = await commitFromDraft(user.id, draft.id);

  const session = await getOrCreateNext(user.id, program.id);

  // The prescription id used by performance.logSet must be the NORMALIZED
  // ExercisePrescription row id (a Prisma-generated cuid), not the domain
  // structure's `id` field ("rx-a"). The normalized id is what
  // findVersionWithStructure returns and what session.getContext surfaces
  // to the UI.
  const versionWithStructure = await findVersionWithStructure(version.id);
  if (!versionWithStructure) throw new Error("Version not found");
  const day = versionWithStructure.workoutDays[0];
  if (!day) throw new Error("No workout day");
  const rx = day.prescriptions[0];
  if (!rx) throw new Error("No prescription");

  return { sessionId: session.id, prescriptionId: rx.id };
}

describe("performanceService", () => {
  let user: UserRecord;

  beforeEach(async () => {
    user = await makeTestUser("Phase6 Performance");
  });

  afterEach(cleanupTrackedUsers);

  it("logSet stores a deviation verbatim (honesty requirement)", async () => {
    const { sessionId, prescriptionId } = await setupSession(user);

    // The prescription targets 3 × 8-10 reps. Log something different.
    const record = await logSet(user.id, sessionId, {
      exercisePrescriptionId: prescriptionId,
      setIndex: 0,
      actualReps: 5,
      actualLoad: 102.5,
      actualRpe: 9.5,
    });

    expect(record.actualReps).toBe(5);
    expect(record.actualLoad).toBe(102.5);
    expect(record.actualRpe).toBe(9.5);
    expect(record.setIndex).toBe(0);
    expect(record.sessionId).toBe(sessionId);
    expect(record.exercisePrescriptionId).toBe(prescriptionId);
  });

  it("logSet stores partial input — reps only, with null load and rpe", async () => {
    const { sessionId, prescriptionId } = await setupSession(user);
    const record = await logSet(user.id, sessionId, {
      exercisePrescriptionId: prescriptionId,
      setIndex: 0,
      actualReps: 8,
    });
    expect(record.actualReps).toBe(8);
    expect(record.actualLoad).toBeNull();
    expect(record.actualRpe).toBeNull();
  });

  it("logSet rejects a prescription not in this session's workout day", async () => {
    const { sessionId } = await setupSession(user);
    await expect(
      logSet(user.id, sessionId, {
        exercisePrescriptionId: "not-in-this-day",
        setIndex: 0,
        actualReps: 8,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("logSet rejects a session the caller does not own", async () => {
    const { sessionId, prescriptionId } = await setupSession(user);
    const other = await makeTestUser("Phase6 Other");
    await expect(
      logSet(other.id, sessionId, {
        exercisePrescriptionId: prescriptionId,
        setIndex: 0,
        actualReps: 8,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("logBatch logs N sets in one call", async () => {
    const { sessionId, prescriptionId } = await setupSession(user);
    const records = await logBatch(user.id, sessionId, {
      entries: [
        {
          exercisePrescriptionId: prescriptionId,
          setIndex: 0,
          actualReps: 8,
          actualLoad: 100,
        },
        {
          exercisePrescriptionId: prescriptionId,
          setIndex: 1,
          actualReps: 7,
          actualLoad: 100,
        },
        {
          exercisePrescriptionId: prescriptionId,
          setIndex: 2,
          actualReps: 6,
          actualLoad: 100,
        },
      ],
    });
    expect(records).toHaveLength(3);
    expect(records.map((r) => r.actualReps)).toEqual([8, 7, 6]);
    expect(records.map((r) => r.setIndex)).toEqual([0, 1, 2]);
  });

  it("logBatch rejects the whole batch if any entry is invalid (no partial write)", async () => {
    const { sessionId, prescriptionId } = await setupSession(user);
    await expect(
      logBatch(user.id, sessionId, {
        entries: [
          {
            exercisePrescriptionId: prescriptionId,
            setIndex: 0,
            actualReps: 8,
          },
          {
            exercisePrescriptionId: "not-in-this-day",
            setIndex: 1,
            actualReps: 8,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // No partial write: the session still has zero records.
    const records = await listMyRecordsForSession(user.id, sessionId);
    expect(records).toHaveLength(0);
  });

  it("listMyRecordsForSession returns logged records oldest-first", async () => {
    const { sessionId, prescriptionId } = await setupSession(user);
    await logSet(user.id, sessionId, {
      exercisePrescriptionId: prescriptionId,
      setIndex: 0,
      actualReps: 8,
    });
    await logSet(user.id, sessionId, {
      exercisePrescriptionId: prescriptionId,
      setIndex: 1,
      actualReps: 7,
    });

    const records = await listMyRecordsForSession(user.id, sessionId);
    expect(records).toHaveLength(2);
    expect(records[0]?.setIndex).toBe(0);
    expect(records[1]?.setIndex).toBe(1);
  });

  it("listMyRecordsForSession rejects a session the caller does not own", async () => {
    const { sessionId } = await setupSession(user);
    const other = await makeTestUser("Phase6 Other 2");
    await expect(
      listMyRecordsForSession(other.id, sessionId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});