// packages/api/src/services/restDay.test.ts
//
// ARCH-061 against the real database: a rest day is stored, sits in the
// rotation, is never counted as a missed session, and does not change the
// assessment taken at commit.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTrackedUsers, listExercises, makeTestUser, type UserRecord } from "@training/db";
import { makeRestDay, type ProgramStructure } from "@training/domain";
import { createMyProgram } from "./programService";
import { createMyDraft, updateMyDraftStructure } from "./draftService";
import { commitFromDraft } from "./programVersionService";
import {
  getOrCreateNext,
  getSessionContext,
  getTrainingOptions,
  markCompleted,
  markSkipped,
  markStarted,
  startSpecificDay,
} from "./sessionService";
import { getReview } from "./reviewService";
import { programStructureSchema } from "../schemas/programStructure";

async function trainingDays(): Promise<ProgramStructure["workoutDays"]> {
  const exercises = await listExercises();
  return ["Push", "Pull"].map((name, d) => ({
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
  }));
}

/** Push, Rest, Pull — or Push, Pull when `withRest` is false. */
async function commit(user: UserRecord, label: string, withRest: boolean) {
  const [push, pull] = await trainingDays();
  const days = withRest
    ? [push!, makeRestDay("day-Rest", 1), { ...pull!, orderIndex: 2 }]
    : [push!, pull!];
  const program = await createMyProgram(user.id, label);
  const draft = await createMyDraft(user.id, program.id, { label: "v1" });
  await updateMyDraftStructure(user.id, draft.id, programStructureSchema.parse({ workoutDays: days }));
  const committed = await commitFromDraft(user.id, draft.id);
  return { programId: program.id, committed };
}

describe("ARCH-061 rest days", () => {
  let user: UserRecord;
  beforeEach(async () => {
    user = await makeTestUser("rest day");
  });
  afterEach(cleanupTrackedUsers);

  it("rejects a rest day that carries exercises", async () => {
    const [push] = await trainingDays();
    const bad = { workoutDays: [{ ...push!, isRestDay: true }] };
    expect(programStructureSchema.safeParse(bad).success).toBe(false);
    expect(programStructureSchema.safeParse({ workoutDays: [makeRestDay("r", 0)] }).success).toBe(true);
  });

  it("stores the flag and puts the rest day in the rotation, between the training days", async () => {
    const { programId } = await commit(user, "Rest rotation", true);
    const options = await getTrainingOptions(user.id, programId);
    expect(options.days.map((d) => [d.name, d.isRestDay])).toEqual([
      ["Push", false],
      ["Rest", true],
      ["Pull", false],
    ]);

    // Push → complete; the rotation then offers the rest day.
    const push = await getOrCreateNext(user.id, programId);
    await markStarted(user.id, push.id);
    await markCompleted(user.id, push.id);
    const rest = await getOrCreateNext(user.id, programId);
    const ctx = await getSessionContext(user.id, rest.id);
    expect(ctx.workoutDay.isRestDay).toBe(true);
    expect(ctx.workoutDay.prescriptions).toEqual([]);

    // Moving past it closes it as skipped and the rotation reaches Pull.
    await markSkipped(user.id, rest.id);
    const pull = await getOrCreateNext(user.id, programId);
    expect((await getSessionContext(user.id, pull.id)).workoutDay.name).toBe("Pull");
  });

  it("never counts a rest day as skipped or as a session, whether walked through or passed over", async () => {
    const { programId } = await commit(user, "Rest adherence", true);
    const finish = async (id: string) => {
      await markStarted(user.id, id);
      await markCompleted(user.id, id);
    };

    // Lap 1: Push, then the rest day is walked through, then Pull.
    const push = await getOrCreateNext(user.id, programId);
    await finish(push.id);
    const rest = await getOrCreateNext(user.id, programId);
    expect((await getSessionContext(user.id, rest.id)).workoutDay.isRestDay).toBe(true);
    await markSkipped(user.id, rest.id);
    const pull = await getOrCreateNext(user.id, programId);
    await finish(pull.id);

    // Lap 2: the rotation is back at Push. Picking Pull passes over Push (a
    // real skipped training day) and Rest (not training).
    const options = await getTrainingOptions(user.id, programId);
    const pullId = options.days.find((d) => d.name === "Pull")!.id;
    const pull2 = await startSpecificDay(user.id, programId, pullId);
    await finish(pull2.id);

    const review = await getReview(user.id, push.trainingBlockId);
    const { summary, sessionLog } = review.adherence;
    // Only the passed-over Push counts as skipped: 1 session, its 2 exercises.
    // The three completed sessions logged nothing: 3 sessions x 2 exercises.
    expect(summary).toEqual({ sessionsSkipped: 1, exercisesNotDone: 2, exercisesUnlogged: 6 });
    // No rest day in the log, though two rest-day sessions exist.
    expect(sessionLog.map((e) => e.workoutDayName)).toEqual(["Push", "Pull", "Push", "Pull"]);
  });

  it("leaves the commit-time assessment the same as the program without the rest day", async () => {
    const a = await commit(user, "No rest", false);
    const b = await commit(user, "With rest", true);
    const snapA = (await getReview(user.id, (await getOrCreateNext(user.id, a.programId)).trainingBlockId)).assessmentSnapshot;
    const snapB = (await getReview(user.id, (await getOrCreateNext(user.id, b.programId)).trainingBlockId)).assessmentSnapshot;
    const axes = (s: unknown) => (s as { axisResults: unknown }).axisResults;
    expect(axes(snapB.metrics)).toEqual(axes(snapA.metrics));
    // Each program has its own goal row and the run has its own timestamp; nothing else may differ.
    const noGoalId = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x) => (k === "goalId" || k === "computedAt" ? undefined : x)));
    expect(noGoalId(snapB.assessment)).toEqual(noGoalId(snapA.assessment));
    expect(noGoalId(snapB.fitScore)).toEqual(noGoalId(snapA.fitScore));
  });
});
