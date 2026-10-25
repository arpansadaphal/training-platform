// packages/api/src/services/progressService.test.ts
//
// Phase A3a against the real database: the Progress view and the post-workout
// summary. The arithmetic and copy are unit-tested in @training/domain
// (progress/__tests__); this file covers the loading layer: which sessions
// count, same-day matching, history cut-off, and ownership.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupTrackedUsers,
  listExercises,
  makeTestUser,
  prisma,
  type UserRecord,
} from "@training/db";
import type { ProgramStructure } from "@training/domain";
import { createMyProgram } from "./programService";
import { createMyDraft, updateMyDraftStructure } from "./draftService";
import { commitFromDraft } from "./programVersionService";
import {
  getSessionContext,
  getTrainingOptions,
  markCompleted,
  markStarted,
  startSpecificDay,
} from "./sessionService";
import { logBatch } from "./performanceService";
import { getProgressForUser, getSessionSummary } from "./progressService";

async function setupProgram(user: UserRecord): Promise<string> {
  const exercises = await listExercises();
  const structure: ProgramStructure = {
    workoutDays: ["Push", "Pull"].map((name, d) => ({
      id: `day-${name}`,
      orderIndex: d,
      name,
      prescriptions: [0, 1].map((k) => ({
        id: `rx-${name}-${k}`,
        orderIndex: k,
        exerciseId: exercises[d * 2 + k]!.id,
        targetSets: 3,
        targetRepsLow: 8,
        targetRepsHigh: 12,
        targetRpe: 8,
        loadScheme: { type: "FIXED_WEIGHT" as const, weight: 50, unit: "kg" as const },
      })),
    })),
  };
  const program = await createMyProgram(user.id, "A3a");
  const draft = await createMyDraft(user.id, program.id, { label: "v1" });
  await updateMyDraftStructure(user.id, draft.id, structure);
  await commitFromDraft(user.id, draft.id);
  return program.id;
}

const DAY_MS = 86_400_000;

/**
 * Trains day `dayIndex`, logging `sets` of [load, reps] on its first
 * exercise, completed `daysAgo` days ago after a 50-minute session.
 */
async function train(
  user: UserRecord,
  programId: string,
  dayIndex: number,
  sets: Array<[number, number]>,
  daysAgo: number,
): Promise<string> {
  const { days } = await getTrainingOptions(user.id, programId);
  const session = await startSpecificDay(user.id, programId, days[dayIndex]!.id);
  await markStarted(user.id, session.id);
  const rx = (await getSessionContext(user.id, session.id)).workoutDay.prescriptions[0]!.id;
  await logBatch(user.id, session.id, {
    entries: sets.map(([actualLoad, actualReps], i) => ({
      exercisePrescriptionId: rx,
      setIndex: i,
      actualReps,
      actualLoad,
    })),
  });
  await markCompleted(user.id, session.id);
  const completedAt = new Date(Date.now() - daysAgo * DAY_MS);
  await prisma.session.update({
    where: { id: session.id },
    data: { completedAt, startedAt: new Date(completedAt.getTime() - 50 * 60_000) },
  });
  return session.id;
}

describe("Phase A3a progress", () => {
  let user: UserRecord;
  beforeEach(async () => {
    user = await makeTestUser("A3a");
  });
  afterEach(cleanupTrackedUsers);

  it("is empty before any completed session", async () => {
    await setupProgram(user);
    expect(await getProgressForUser(user.id)).toEqual([]);
  });

  it("shows one session as insufficient data, then a verdict from the fourth", async () => {
    const programId = await setupProgram(user);
    await train(user, programId, 0, [[100, 5]], 12);
    let [ex] = await getProgressForUser(user.id);
    expect(ex!.records).toHaveLength(1);
    expect(ex!.verdict.kind).toBe("INSUFFICIENT_DATA");
    expect(ex!.verdictLine).toMatch(/log 2 more sessions for a verdict\.$/);

    await train(user, programId, 0, [[102.5, 5]], 8);
    await train(user, programId, 0, [[105, 5]], 4);
    await train(user, programId, 0, [[110, 5]], 1);
    [ex] = await getProgressForUser(user.id);
    expect(ex!.records.map((r) => r.topSet.weight)).toEqual([100, 102.5, 105, 110]);
    expect(ex!.verdict.kind).toBe("TRENDING_WELL");
    expect(ex!.verdictLine).toMatch(/: up 10% over your last 4 sessions\.$/);
    expect(ex!.personalRecord?.topSet.weight).toBe(110);
  });

  it("ignores sessions that were not completed and other users' sessions", async () => {
    const programId = await setupProgram(user);
    const { days } = await getTrainingOptions(user.id, programId);
    const open = await startSpecificDay(user.id, programId, days[0]!.id);
    await markStarted(user.id, open.id);
    const rx = (await getSessionContext(user.id, open.id)).workoutDay.prescriptions[0]!.id;
    await logBatch(user.id, open.id, {
      entries: [{ exercisePrescriptionId: rx, setIndex: 0, actualReps: 5, actualLoad: 80 }],
    });
    expect(await getProgressForUser(user.id)).toEqual([]);

    const other = await makeTestUser("A3a other");
    expect(await getProgressForUser(other.id)).toEqual([]);
  });
});

describe("Phase A3a session summary", () => {
  let user: UserRecord;
  beforeEach(async () => {
    user = await makeTestUser("A3a summary");
  });
  afterEach(cleanupTrackedUsers);

  it("compares with the previous same-day session and flags a PR", async () => {
    const programId = await setupProgram(user);
    await train(user, programId, 0, [[100, 5], [100, 5], [100, 5]], 7);
    await train(user, programId, 1, [[40, 10]], 5); // a different day: not the comparison
    const latest = await train(user, programId, 0, [[105, 5], [105, 5], [105, 5]], 1);

    const view = await getSessionSummary(user.id, latest);
    expect(view.dayName).toBe("Push");
    expect(view.hasPreviousSession).toBe(true);
    expect(view.summary.durationSeconds).toBe(50 * 60);
    expect(view.summary.loggedSets).toBe(3);
    expect(view.summary.plannedSets).toBe(6);
    expect(view.summary.volumeChangePercent).toBeCloseTo(5, 5);
    expect(view.summary.newPRs).toHaveLength(1);
    expect(view.summary.newPRs[0]).toMatchObject({ weight: 105, reps: 5, unit: "kg" });
    expect(view.summary.verdict).toBe(
      "New PR on " + view.summary.newPRs[0]!.exerciseName + ". Total volume up 5% from last time. 3 of 6 planned sets logged.",
    );
  });

  it("after three same-lift sessions, compares with the previous one and shows volume, not set counts", async () => {
    const programId = await setupProgram(user);
    const lift = [[100, 5], [100, 5], [100, 5]] as Array<[number, number]>;
    const first = await train(user, programId, 0, lift, 9);
    const second = await train(user, programId, 0, lift.map(([l, r]) => [l + 5, r] as [number, number]), 5);
    const third = await train(user, programId, 0, lift.map(([l, r]) => [l + 10, r] as [number, number]), 1);

    // Third compares with the second (not the first, not itself).
    const view = await getSessionSummary(user.id, third);
    expect(view.hasPreviousSession).toBe(true);
    expect(view.summary.volumeChangePercent).toBeCloseTo((110 / 105 - 1) * 100, 5);
    // Same number of sets every time: the set delta is legitimately 0, and
    // the volume change is what the summary page shows (it used to show 0).
    const rows = view.summary.volumeDeltaPerMuscle;
    expect(rows.length).toBeGreaterThan(0);
    for (const m of rows) {
      expect(m.previousSets).toBe(m.sets);
      expect(m.delta).toBe(0);
      expect(m.volumeChangePercent).toBeCloseTo((110 / 105 - 1) * 100, 5);
    }
    // And the second compares with the first.
    expect((await getSessionSummary(user.id, second)).summary.volumeChangePercent).toBeCloseTo(5, 5);
    expect((await getSessionSummary(user.id, first)).hasPreviousSession).toBe(false);
  });

  it("treats a first session as a baseline, with no PR", async () => {
    const programId = await setupProgram(user);
    const first = await train(user, programId, 0, [[100, 5]], 2);
    const view = await getSessionSummary(user.id, first);
    expect(view.hasPreviousSession).toBe(false);
    expect(view.summary.newPRs).toEqual([]);
    expect(view.summary.volumeChangePercent).toBeNull();
  });

  it("does not shift when a later session is completed", async () => {
    const programId = await setupProgram(user);
    const first = await train(user, programId, 0, [[100, 5]], 9);
    const second = await train(user, programId, 0, [[110, 5]], 5);
    const before = await getSessionSummary(user.id, second);
    await train(user, programId, 0, [[120, 5]], 1);
    const after = await getSessionSummary(user.id, second);
    expect(after).toEqual(before);
    expect((await getSessionSummary(user.id, first)).summary.newPRs).toEqual([]);
  });

  it("refuses an unfinished session and another user's session", async () => {
    const programId = await setupProgram(user);
    const { days } = await getTrainingOptions(user.id, programId);
    const open = await startSpecificDay(user.id, programId, days[0]!.id);
    await expect(getSessionSummary(user.id, open.id)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });

    const done = await train(user, programId, 0, [[100, 5]], 1);
    const other = await makeTestUser("A3a intruder");
    await expect(getSessionSummary(other.id, done)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
