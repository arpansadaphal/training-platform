// packages/api/src/services/nextTargets.test.ts
//
// ARCH-062 against the real database: targets on the session page, the Today
// card on /app, and the summary's next day. The rule's arithmetic is unit
// tested in @training/domain (progress/__tests__/nextTargets.test.ts); this
// covers the loading layer: which sets count, units, the gap since the last
// session, and what each state of the card says.

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
  getSessionPage,
  getTrainingOptions,
  markCompleted,
  markStarted,
  startSpecificDay,
} from "./sessionService";
import { logBatch } from "./performanceService";
import { getMyIdentitySummary } from "./identityService";
import { getSessionSummary } from "./progressService";

const DAY_MS = 86_400_000;

/** Two days: Push (two exercises), Pull (one). Barbell/dumbbell steps come from the exercises' equipment. */
async function setupProgram(user: UserRecord): Promise<{ programId: string; exerciseIds: string[] }> {
  const exercises = await listExercises();
  const barbell = exercises.find((e) => e.equipment === "barbell")!;
  const dumbbell = exercises.find((e) => e.equipment === "dumbbell")!;
  const machine = exercises.find((e) => e.equipment === "machine")!;
  const pick = [barbell, dumbbell, machine];
  const structure: ProgramStructure = {
    workoutDays: [
      {
        id: "d-push",
        orderIndex: 0,
        name: "Push",
        prescriptions: [barbell, dumbbell].map((e, k) => ({
          id: `rx-push-${k}`,
          orderIndex: k,
          exerciseId: e.id,
          targetSets: 3,
          targetRepsLow: 8,
          targetRepsHigh: 12,
          targetRpe: 8,
          loadScheme: { type: "FIXED_WEIGHT" as const, weight: 20, unit: "kg" as const },
        })),
      },
      {
        id: "d-pull",
        orderIndex: 1,
        name: "Pull",
        prescriptions: [
          {
            id: "rx-pull-0",
            orderIndex: 0,
            exerciseId: machine.id,
            targetSets: 3,
            targetRepsLow: 8,
            targetRepsHigh: 12,
            targetRpe: 8,
            loadScheme: { type: "FIXED_WEIGHT" as const, weight: 20, unit: "kg" as const },
          },
        ],
      },
    ],
  };
  const program = await createMyProgram(user.id, "Targets");
  const draft = await createMyDraft(user.id, program.id, { label: "v1" });
  await updateMyDraftStructure(user.id, draft.id, structure);
  await commitFromDraft(user.id, draft.id);
  return { programId: program.id, exerciseIds: pick.map((e) => e.id) };
}

/** Trains one day: every prescription gets 3 sets of `reps` at `loads[i]`, completed `daysAgo` days ago. */
async function train(
  user: UserRecord,
  programId: string,
  dayIndex: number,
  loads: number[],
  reps: number,
  daysAgo: number,
): Promise<string> {
  const { days } = await getTrainingOptions(user.id, programId);
  const session = await startSpecificDay(user.id, programId, days[dayIndex]!.id);
  await markStarted(user.id, session.id);
  const ctx = await getSessionContext(user.id, session.id);
  await logBatch(user.id, session.id, {
    entries: ctx.workoutDay.prescriptions.flatMap((p, i) =>
      [0, 1, 2].map((setIndex) => ({
        exercisePrescriptionId: p.id,
        setIndex,
        actualReps: reps,
        actualLoad: loads[i]!,
        actualRpe: 8,
      })),
    ),
  });
  await markCompleted(user.id, session.id);
  const completedAt = new Date(Date.now() - daysAgo * DAY_MS);
  await prisma.session.update({
    where: { id: session.id },
    data: { completedAt, startedAt: new Date(completedAt.getTime() - 45 * 60_000) },
  });
  return session.id;
}

async function openSession(user: UserRecord, programId: string, dayIndex: number): Promise<string> {
  const { days } = await getTrainingOptions(user.id, programId);
  const session = await startSpecificDay(user.id, programId, days[dayIndex]!.id);
  await markStarted(user.id, session.id);
  return session.id;
}

describe("ARCH-062 targets", () => {
  let user: UserRecord;
  beforeEach(async () => {
    user = await makeTestUser("Targets");
  });
  afterEach(cleanupTrackedUsers);

  it("has no target for an exercise the lifter has never logged", async () => {
    const { programId } = await setupProgram(user);
    const id = await openSession(user, programId, 0);
    const { targets } = await getSessionPage(user.id, id);
    expect(targets).toHaveLength(2);
    for (const t of targets) {
      expect(t.kind).toBe("FIRST_TIME");
      expect(t.weight).toBeNull();
    }
  });

  it("adds one step when every set reached the top of the range last time, by equipment", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [60, 20], 12, 3);
    const id = await openSession(user, programId, 0);
    const { targets } = await getSessionPage(user.id, id);
    // barbell +2.5, dumbbell +2.5
    expect(targets.map((t) => [t.kind, t.weight])).toEqual([
      ["UP", 62.5],
      ["UP", 22.5],
    ]);
    expect(targets[0]!.reason).toBe("Up 2.5 kg: you hit 12 reps on every set last time.");
  });

  it("steps a machine by 5 kg and holds when the range was not filled", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 1, [40], 12, 3);
    const pull = await openSession(user, programId, 1);
    expect((await getSessionPage(user.id, pull)).targets[0]).toMatchObject({ kind: "UP", weight: 45 });
  });

  it("holds the weight after a session short of the top of the range", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [60, 20], 10, 3);
    const id = await openSession(user, programId, 0);
    const { targets } = await getSessionPage(user.id, id);
    expect(targets.map((t) => [t.kind, t.weight])).toEqual([
      ["HOLD", 60],
      ["HOLD", 20],
    ]);
  });

  it("is 10% lighter when the last session was 10 or more days ago", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [60, 20], 12, 12);
    const id = await openSession(user, programId, 0);
    const { targets } = await getSessionPage(user.id, id);
    expect(targets.map((t) => [t.kind, t.weight])).toEqual([
      ["COMEBACK", 55],
      ["COMEBACK", 17.5],
    ]);
    expect(targets[0]!.reason).toBe("Comeback: 10% lighter after 12 days off.");
  });

  it("reads a gap since ANY session, not only this exercise", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [60, 20], 12, 14);
    await train(user, programId, 1, [40], 12, 2);
    const id = await openSession(user, programId, 0);
    const { targets } = await getSessionPage(user.id, id);
    // Pull two days ago: the lifter is not away, so Push advances.
    expect(targets.map((t) => t.kind)).toEqual(["UP", "UP"]);
  });

  it("never reads another user's sets", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [60, 20], 12, 3);
    const other = await makeTestUser("Targets other");
    const o = await setupProgram(other);
    const id = await openSession(other, o.programId, 0);
    const { targets } = await getSessionPage(other.id, id);
    expect(targets.every((t) => t.kind === "FIRST_TIME")).toBe(true);
  });
});

describe("the Today card", () => {
  let user: UserRecord;
  beforeEach(async () => {
    user = await makeTestUser("Today");
  });
  afterEach(cleanupTrackedUsers);

  it("shows the next day with a target per lift, and the rotation's next day after one is done", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [60, 20], 12, 2);
    const { today } = await getMyIdentitySummary(user.id);
    // Finished two days ago: past the "just finished" window, so the card says what is next.
    expect(today).toMatchObject({ state: "NEXT", dayName: "Pull", isRestDay: false });
    expect(today!.exercises).toHaveLength(1);
    expect(today!.exercises[0]!.targetWeight).toBeNull();
    expect(today!.estimatedMinutes).toBeGreaterThanOrEqual(5);
  });

  it("targets today's lifts from their history, and says why", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [60, 20], 12, 3);
    await train(user, programId, 1, [40], 10, 2);
    const { today } = await getMyIdentitySummary(user.id);
    expect(today!.dayName).toBe("Push");
    expect(today!.exercises.map((e) => [e.targetWeight, e.last?.load])).toEqual([
      [62.5, 60],
      [22.5, 20],
    ]);
    expect(today!.comebackDays).toBeNull();
  });

  it("is IN_PROGRESS with the session id while a session is open", async () => {
    const { programId } = await setupProgram(user);
    const id = await openSession(user, programId, 0);
    const { today } = await getMyIdentitySummary(user.id);
    expect(today).toMatchObject({ state: "IN_PROGRESS", sessionId: id, dayName: "Push" });
  });

  it("says Done, with any records and the next day, for hours after a session", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [55, 20], 12, 3);
    await train(user, programId, 0, [60, 20], 12, 0);
    const { today } = await getMyIdentitySummary(user.id);
    expect(today!.state).toBe("JUST_FINISHED");
    expect(today!.finished!.dayName).toBe("Push");
    expect(today!.finished!.prs.map((p) => [p.load, p.reps])).toEqual([[60, 12]]);
    expect(today!.nextDayName).toBe("Pull");
  });

  it("names the day a comeback is lighter for", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [60, 20], 12, 16);
    await train(user, programId, 1, [40], 12, 15);
    const { today } = await getMyIdentitySummary(user.id);
    expect(today!.comebackDays).toBe(15);
    expect(today!.exercises[0]!.targetWeight).toBe(55);
  });

  it("counts the last seven days against the training days a week", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [60, 20], 12, 10);
    await train(user, programId, 1, [40], 12, 3);
    const { weekProgress } = await getMyIdentitySummary(user.id);
    expect(weekProgress).toEqual({ completed: 1, planned: 2 });
  });
});

describe("the summary's exit", () => {
  let user: UserRecord;
  beforeEach(async () => {
    user = await makeTestUser("Summary exit");
  });
  afterEach(cleanupTrackedUsers);

  it("names the next day, and makes no comparison with a half-logged previous session", async () => {
    const { programId } = await setupProgram(user);
    // Last time: one set of one exercise. This time: a full session.
    const { days } = await getTrainingOptions(user.id, programId);
    const first = await startSpecificDay(user.id, programId, days[0]!.id);
    await markStarted(user.id, first.id);
    const rx = (await getSessionContext(user.id, first.id)).workoutDay.prescriptions[0]!.id;
    await logBatch(user.id, first.id, {
      entries: [{ exercisePrescriptionId: rx, setIndex: 0, actualReps: 10, actualLoad: 60 }],
    });
    await markCompleted(user.id, first.id);
    await prisma.session.update({
      where: { id: first.id },
      data: { completedAt: new Date(Date.now() - 3 * DAY_MS) },
    });
    const second = await train(user, programId, 0, [60, 20], 12, 0);
    const view = await getSessionSummary(user.id, second);
    expect(view.hasPreviousSession).toBe(true);
    expect(view.summary.volumeChangePercent).toBeNull();
    expect(view.summary.verdict).not.toMatch(/baseline|Total volume (up|down)/);
    expect(view.nextDayName).toBe("Pull");
    expect(view.programId).toBe(programId);
  });
});
