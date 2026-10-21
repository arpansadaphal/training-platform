// packages/api/src/services/phaseA2.test.ts
//
// Phase A2 (lazy-lifter friction fixes), against the real database:
//   - ARCH-056 day picker: passed-over days become SKIPPED, rotation advances.
//   - ARCH-057 auto-close: stale or superseded IN_PROGRESS Sessions close as
//     COMPLETED (with records) or SKIPPED; a fresh one is resumed.
//   - ARCH-055 set editing: only while IN_PROGRESS; NOT_FOUND across users.
//   - "Last time" hints, unarchive, listing blocks.
//   - ARCH-058 Review: joins on row ids (structures use Builder-style
//     client ids, like real programs), counts skipped and unlogged work, and
//     carries a session log with durations.
//   - Identity summary: real day names, stale sessions not offered, last
//     completed session time.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupTrackedUsers,
  findSessionById,
  listExercises,
  makeTestUser,
  prisma,
  type UserRecord,
} from "@training/db";
import type { ProgramStructure } from "@training/domain";
import {
  createMyProgram,
  archiveMyProgram,
  listMyProgramBlocks,
  listMyPrograms,
  unarchiveMyProgram,
} from "./programService";
import { createMyDraft, updateMyDraftStructure } from "./draftService";
import { commitFromDraft } from "./programVersionService";
import {
  getLastTimeHints,
  getOrCreateNext,
  getSessionContext,
  getTrainingOptions,
  markCompleted,
  markStarted,
  startSpecificDay,
  STALE_SESSION_AFTER_MS,
} from "./sessionService";
import { deleteSet, logBatch, logSet, updateSet } from "./performanceService";
import { getReview } from "./reviewService";
import { getMyIdentitySummary } from "./identityService";

const DAY_NAMES = ["Push", "Pull", "Legs"] as const;

/** Three days, two exercises each, with Builder-style client ids (never equal to row ids). */
async function makeThreeDayStructure(): Promise<ProgramStructure> {
  const exercises = await listExercises();
  if (exercises.length < 6) throw new Error("Seed missing exercises");
  return {
    workoutDays: DAY_NAMES.map((name, d) => ({
      id: `day-${name.toLowerCase()}`,
      orderIndex: d,
      name,
      prescriptions: [0, 1].map((k) => ({
        id: `rx-${name.toLowerCase()}-${k}`,
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
}

async function setupProgram(user: UserRecord, name = "A2 PPL"): Promise<string> {
  const program = await createMyProgram(user.id, name);
  const draft = await createMyDraft(user.id, program.id, { label: "v1" });
  await updateMyDraftStructure(user.id, draft.id, await makeThreeDayStructure());
  await commitFromDraft(user.id, draft.id);
  return program.id;
}

async function dayName(userId: string, sessionId: string): Promise<string> {
  return (await getSessionContext(userId, sessionId)).workoutDay.name;
}

async function prescriptionIds(userId: string, sessionId: string): Promise<string[]> {
  return (await getSessionContext(userId, sessionId)).workoutDay.prescriptions.map((p) => p.id);
}

/** Moves a Session's startedAt and all its records' completedAt back by `ms`. */
async function ageSession(sessionId: string, ms: number): Promise<void> {
  const s = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  if (s.startedAt) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { startedAt: new Date(s.startedAt.getTime() - ms) },
    });
  }
  const records = await prisma.performanceRecord.findMany({ where: { sessionId } });
  for (const r of records) {
    await prisma.performanceRecord.update({
      where: { id: r.id },
      data: { completedAt: new Date(r.completedAt.getTime() - ms) },
    });
  }
}

const STALE = STALE_SESSION_AFTER_MS + 60_000;

describe("Phase A2", () => {
  let user: UserRecord;

  beforeEach(async () => {
    user = await makeTestUser("Phase A2");
  });

  afterEach(cleanupTrackedUsers);

  // ── ARCH-056 day picker ────────────────────────────────────────────────

  describe("startSpecificDay", () => {
    it("records passed-over days as SKIPPED and advances the rotation from the picked day", async () => {
      const programId = await setupProgram(user);
      const options = await getTrainingOptions(user.id, programId);
      expect(options.days.map((d) => d.name)).toEqual(["Push", "Pull", "Legs"]);
      expect(options.days.find((d) => d.id === options.suggestedDayId)?.name).toBe("Push");

      const legs = options.days[2]!;
      const started = await startSpecificDay(user.id, programId, legs.id);
      expect(started.status).toBe("PLANNED");
      expect(started.sequenceIndex).toBe(2);
      expect(await dayName(user.id, started.id)).toBe("Legs");

      const sessions = await prisma.session.findMany({
        where: { trainingBlockId: started.trainingBlockId },
        orderBy: { sequenceIndex: "asc" },
      });
      expect(sessions.map((s) => s.status)).toEqual(["SKIPPED", "SKIPPED", "PLANNED"]);

      // Rotation continues from Legs: after it is skipped, Push is next.
      await prisma.session.update({ where: { id: started.id }, data: { status: "SKIPPED" } });
      const next = await getOrCreateNext(user.id, programId);
      expect(await dayName(user.id, next.id)).toBe("Push");
    });

    it("turns a pending PLANNED Session for another day into SKIPPED", async () => {
      const programId = await setupProgram(user);
      const pending = await getOrCreateNext(user.id, programId); // Push
      const { days } = await getTrainingOptions(user.id, programId);
      const started = await startSpecificDay(user.id, programId, days[1]!.id); // Pull
      expect((await findSessionById(pending.id))?.status).toBe("SKIPPED");
      expect(started.sequenceIndex).toBe(1);
      expect(await dayName(user.id, started.id)).toBe("Pull");
    });

    it("picking the suggested day returns the pending Session (no duplicate)", async () => {
      const programId = await setupProgram(user);
      const pending = await getOrCreateNext(user.id, programId);
      const { suggestedDayId } = await getTrainingOptions(user.id, programId);
      const again = await startSpecificDay(user.id, programId, suggestedDayId);
      expect(again.id).toBe(pending.id);
    });

    it("an earlier day is an extra session: nothing skipped, rotation unchanged (ARCH-056 addendum)", async () => {
      const programId = await setupProgram(user);
      const push = await getOrCreateNext(user.id, programId);
      await markStarted(user.id, push.id);
      await markCompleted(user.id, push.id);
      // Rotation is at Pull; pick Push (earlier).
      const { days, pointerDayId } = await getTrainingOptions(user.id, programId);
      expect(days.find((d) => d.id === pointerDayId)?.name).toBe("Pull");
      const extra = await startSpecificDay(user.id, programId, days[0]!.id);
      expect(await dayName(user.id, extra.id)).toBe("Push");
      expect(await prisma.session.count({ where: { trainingBlockId: push.trainingBlockId, status: "SKIPPED" } })).toBe(0);
      await markStarted(user.id, extra.id);
      await markCompleted(user.id, extra.id);
      const next = await getOrCreateNext(user.id, programId);
      expect(await dayName(user.id, next.id)).toBe("Pull");
    });

    it("an earlier pick replaces an untouched pending session instead of skipping it", async () => {
      const programId = await setupProgram(user);
      const push = await getOrCreateNext(user.id, programId);
      await markStarted(user.id, push.id);
      await markCompleted(user.id, push.id);
      const pull = await getOrCreateNext(user.id, programId); // pending PLANNED Pull
      const { days } = await getTrainingOptions(user.id, programId);
      const extra = await startSpecificDay(user.id, programId, days[0]!.id);
      expect(await findSessionById(pull.id)).toBeNull();
      expect(await dayName(user.id, extra.id)).toBe("Push");
      expect(await prisma.session.count({ where: { trainingBlockId: push.trainingBlockId, status: "SKIPPED" } })).toBe(0);
    });

    it("a later day skips the days in between and advances the rotation", async () => {
      const programId = await setupProgram(user);
      const push = await getOrCreateNext(user.id, programId);
      await markStarted(user.id, push.id);
      await markCompleted(user.id, push.id);
      const { days } = await getTrainingOptions(user.id, programId); // at Pull
      const legs = await startSpecificDay(user.id, programId, days[2]!.id);
      const statuses = await prisma.session.findMany({
        where: { trainingBlockId: push.trainingBlockId },
        orderBy: { sequenceIndex: "asc" },
        select: { status: true },
      });
      expect(statuses.map((x) => x.status)).toEqual(["COMPLETED", "SKIPPED", "PLANNED"]);
      await markStarted(user.id, legs.id);
      await markCompleted(user.id, legs.id);
      const next = await getOrCreateNext(user.id, programId);
      expect(await dayName(user.id, next.id)).toBe("Push");
    });

    it("rejects a day outside the active version, and another user's program", async () => {
      const programId = await setupProgram(user);
      await expect(startSpecificDay(user.id, programId, "not-a-day")).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      const other = await makeTestUser("Phase A2 other");
      const { days } = await getTrainingOptions(user.id, programId);
      await expect(startSpecificDay(other.id, programId, days[0]!.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  // ── ARCH-057 auto-close ────────────────────────────────────────────────

  describe("auto-close of superseded IN_PROGRESS sessions", () => {
    it("resumes a fresh IN_PROGRESS Session instead of closing it", async () => {
      const programId = await setupProgram(user);
      const s = await getOrCreateNext(user.id, programId);
      await markStarted(user.id, s.id);
      const again = await getOrCreateNext(user.id, programId);
      expect(again.id).toBe(s.id);
      expect((await findSessionById(s.id))?.status).toBe("IN_PROGRESS");
    });

    it("closes a stale IN_PROGRESS Session with records as COMPLETED at its last set", async () => {
      const programId = await setupProgram(user);
      const s = await getOrCreateNext(user.id, programId);
      await markStarted(user.id, s.id);
      const [rx] = await prescriptionIds(user.id, s.id);
      await logSet(user.id, s.id, { exercisePrescriptionId: rx!, setIndex: 0, actualReps: 8, actualLoad: 50 });
      await logSet(user.id, s.id, { exercisePrescriptionId: rx!, setIndex: 1, actualReps: 8, actualLoad: 50 });
      await ageSession(s.id, STALE);
      const lastSet = await prisma.performanceRecord.findFirstOrThrow({
        where: { sessionId: s.id },
        orderBy: { completedAt: "desc" },
      });

      const next = await getOrCreateNext(user.id, programId);
      expect(next.id).not.toBe(s.id);
      expect(await dayName(user.id, next.id)).toBe("Pull");
      const closed = await findSessionById(s.id);
      expect(closed?.status).toBe("COMPLETED");
      expect(closed?.completedAt?.getTime()).toBe(lastSet.completedAt.getTime());
    });

    it("deletes a stale IN_PROGRESS Session without records and keeps the rotation (ARCH-057 addendum)", async () => {
      const programId = await setupProgram(user);
      const s = await getOrCreateNext(user.id, programId); // Push
      await markStarted(user.id, s.id);
      await ageSession(s.id, STALE);
      const next = await getOrCreateNext(user.id, programId);
      expect(await findSessionById(s.id)).toBeNull();
      expect(await dayName(user.id, next.id)).toBe("Push");
      expect(next.autoSaved).toEqual([]);
    });

    it("keeps an empty stale session that has a note, recording it as SKIPPED", async () => {
      const programId = await setupProgram(user);
      const s = await getOrCreateNext(user.id, programId);
      await markStarted(user.id, s.id);
      await prisma.observation.create({
        data: { userId: user.id, sessionId: s.id, trainingBlockId: s.trainingBlockId, content: "felt off" },
      });
      await ageSession(s.id, STALE);
      await getOrCreateNext(user.id, programId);
      expect((await findSessionById(s.id))?.status).toBe("SKIPPED");
    });

    it("reports a stale session with records as auto-saved", async () => {
      const programId = await setupProgram(user);
      const s = await getOrCreateNext(user.id, programId);
      await markStarted(user.id, s.id);
      const [rx] = await prescriptionIds(user.id, s.id);
      await logSet(user.id, s.id, { exercisePrescriptionId: rx!, setIndex: 0, actualReps: 8 });
      await ageSession(s.id, STALE);
      const next = await getOrCreateNext(user.id, programId);
      expect(next.autoSaved.map((a) => a.sessionId)).toEqual([s.id]);
    });

    it("closes an IN_PROGRESS Session in another block when training starts elsewhere", async () => {
      const first = await setupProgram(user, "A2 first");
      const s = await getOrCreateNext(user.id, first);
      await markStarted(user.id, s.id);
      const [rx] = await prescriptionIds(user.id, s.id);
      await logSet(user.id, s.id, { exercisePrescriptionId: rx!, setIndex: 0, actualReps: 5 });

      const second = await setupProgram(user, "A2 second");
      await getOrCreateNext(user.id, second);
      expect((await findSessionById(s.id))?.status).toBe("COMPLETED");
    });

    it("picking a different day auto-closes the IN_PROGRESS Session even when fresh", async () => {
      const programId = await setupProgram(user);
      const s = await getOrCreateNext(user.id, programId);
      await markStarted(user.id, s.id);
      const [rx] = await prescriptionIds(user.id, s.id);
      await logSet(user.id, s.id, { exercisePrescriptionId: rx!, setIndex: 0, actualReps: 5 });
      const { days } = await getTrainingOptions(user.id, programId);
      await startSpecificDay(user.id, programId, days[2]!.id);
      expect((await findSessionById(s.id))?.status).toBe("COMPLETED");
    });
  });

  // ── ARCH-055 set editing ──────────────────────────────────────────────

  describe("updateSet / deleteSet", () => {
    it("edits and deletes while IN_PROGRESS, and refuses once COMPLETED", async () => {
      const programId = await setupProgram(user);
      const s = await getOrCreateNext(user.id, programId);
      await markStarted(user.id, s.id);
      const [rx] = await prescriptionIds(user.id, s.id);
      const typo = await logSet(user.id, s.id, {
        exercisePrescriptionId: rx!, setIndex: 0, actualReps: 5, actualLoad: 14,
      });
      const fixed = await updateSet(user.id, s.id, typo.id, { actualLoad: 140 });
      expect(fixed.actualLoad).toBe(140);
      expect(fixed.actualReps).toBe(5);

      const extra = await logSet(user.id, s.id, { exercisePrescriptionId: rx!, setIndex: 1, actualReps: 5 });
      await deleteSet(user.id, s.id, extra.id);
      expect(await prisma.performanceRecord.count({ where: { sessionId: s.id } })).toBe(1);

      await markCompleted(user.id, s.id);
      await expect(updateSet(user.id, s.id, typo.id, { actualLoad: 1 })).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
      await expect(deleteSet(user.id, s.id, typo.id)).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
    });

    it("is NOT_FOUND across users and for a record outside the named Session", async () => {
      const programId = await setupProgram(user);
      const s = await getOrCreateNext(user.id, programId);
      await markStarted(user.id, s.id);
      const [rx] = await prescriptionIds(user.id, s.id);
      const r = await logSet(user.id, s.id, { exercisePrescriptionId: rx!, setIndex: 0, actualReps: 5 });

      const other = await makeTestUser("Phase A2 other");
      await expect(updateSet(other.id, s.id, r.id, { actualReps: 1 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(deleteSet(other.id, s.id, r.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

      const otherProgram = await setupProgram(other, "A2 other program");
      const os = await getOrCreateNext(other.id, otherProgram);
      await markStarted(other.id, os.id);
      await expect(updateSet(other.id, os.id, r.id, { actualReps: 1 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  // ── "Last time" hints ─────────────────────────────────────────────────

  it("getLastTimeHints returns the top set of the most recent completed session per exercise", async () => {
    const programId = await setupProgram(user);
    const { days } = await getTrainingOptions(user.id, programId);

    const first = await getOrCreateNext(user.id, programId); // Push
    await markStarted(user.id, first.id);
    const [rx0] = await prescriptionIds(user.id, first.id);
    await logBatch(user.id, first.id, {
      entries: [
        { exercisePrescriptionId: rx0!, setIndex: 0, actualReps: 10, actualLoad: 60 },
        { exercisePrescriptionId: rx0!, setIndex: 1, actualReps: 8, actualLoad: 65 },
        { exercisePrescriptionId: rx0!, setIndex: 2, actualReps: 12, actualLoad: 55 },
      ],
    });
    await markCompleted(user.id, first.id);

    // Train Push again: the hint for its first exercise is 65 × 8; the second has none.
    const again = await startSpecificDay(user.id, programId, days[0]!.id);
    const hints = await getLastTimeHints(user.id, again.id);
    const ctx = await getSessionContext(user.id, again.id);
    const ex0 = ctx.workoutDay.prescriptions[0]!.exerciseId;
    const ex1 = ctx.workoutDay.prescriptions[1]!.exerciseId;
    const h0 = hints.find((h) => h.exerciseId === ex0);
    expect(h0).toMatchObject({ load: 65, reps: 8, unit: "kg" });
    expect(hints.find((h) => h.exerciseId === ex1)).toBeUndefined();
  });

  // ── ARCH-058 Review ───────────────────────────────────────────────────

  it("Review joins on row ids and counts skipped sessions and unlogged exercises", async () => {
    const programId = await setupProgram(user);

    // Push: log only the first exercise (second unlogged), with a load deviation.
    const push = await getOrCreateNext(user.id, programId);
    await markStarted(user.id, push.id);
    const [rx0] = await prescriptionIds(user.id, push.id);
    await logBatch(user.id, push.id, {
      entries: [0, 1, 2].map((i) => ({
        exercisePrescriptionId: rx0!, setIndex: i, actualReps: 10, actualLoad: 40,
      })),
    });
    await markCompleted(user.id, push.id);

    // Skip Pull by picking Legs; then complete Legs with nothing logged.
    const { days } = await getTrainingOptions(user.id, programId);
    const legs = await startSpecificDay(user.id, programId, days[2]!.id);
    await markStarted(user.id, legs.id);
    await markCompleted(user.id, legs.id);

    const review = await getReview(user.id, push.trainingBlockId);
    const { summary, systematicDeviations, sessionLog } = review.adherence;

    expect(summary).toEqual({ sessionsSkipped: 1, exercisesNotDone: 2, exercisesUnlogged: 3 });
    // LOAD_BELOW fired 3 times on Push's first exercise: only possible if the
    // records matched their prescription (the pre-ARCH-058 join matched nothing).
    expect(systematicDeviations.some((d) => d.kind === "LOAD_BELOW" && d.occurrences === 3)).toBe(true);
    expect(sessionLog.map((e) => [e.workoutDayName, e.status])).toEqual([
      ["Push", "COMPLETED"],
      ["Pull", "SKIPPED"],
      ["Legs", "COMPLETED"],
    ]);
    expect(sessionLog[0]!.durationMinutes).not.toBeNull();
    expect(sessionLog[1]!.durationMinutes).toBeNull();
  });

  // ── Archive / blocks ──────────────────────────────────────────────────

  it("unarchive restores a program to the main list; listBlocks returns its blocks", async () => {
    const programId = await setupProgram(user);
    await archiveMyProgram(user.id, programId);
    expect((await listMyPrograms(user.id, false)).some((p) => p.id === programId)).toBe(false);
    expect((await listMyPrograms(user.id, true)).find((p) => p.id === programId)?.archivedAt).not.toBeNull();

    await unarchiveMyProgram(user.id, programId);
    expect((await listMyPrograms(user.id, false)).some((p) => p.id === programId)).toBe(true);

    // Archiving closed the first block; unarchiving opened a fresh one so the
    // program is trainable again (its version was still "active").
    const blocks = await listMyProgramBlocks(user.id, programId);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.status).toBe("ACTIVE");
    expect(blocks[1]!.status).not.toBe("ACTIVE");
    await expect(getOrCreateNext(user.id, programId)).resolves.toMatchObject({ status: "PLANNED" });

    const other = await makeTestUser("Phase A2 other");
    await expect(unarchiveMyProgram(other.id, programId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listMyProgramBlocks(other.id, programId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("Recent blocks skips empty closed blocks from archive/unarchive cycles", async () => {
    const programId = await setupProgram(user);
    const s = await getOrCreateNext(user.id, programId);
    await markStarted(user.id, s.id);
    await markCompleted(user.id, s.id);
    for (let i = 0; i < 2; i++) {
      await archiveMyProgram(user.id, programId);
      await unarchiveMyProgram(user.id, programId);
    }
    const identity = await getMyIdentitySummary(user.id);
    expect(identity.recentClosedBlock?.id).toBe(s.trainingBlockId);
    expect(identity.recentClosedBlock?.status).toBe("COMPLETED");
  });

  // ── Identity summary ──────────────────────────────────────────────────

  it("identity summary names the day, hides a stale session, and reports the last completed session", async () => {
    const programId = await setupProgram(user);
    const s = await getOrCreateNext(user.id, programId);
    let identity = await getMyIdentitySummary(user.id);
    expect(identity.currentSession).toMatchObject({ status: "PLANNED", workoutDayName: "Push" });
    expect(identity.lastCompletedSessionAt).toBeNull();

    await markStarted(user.id, s.id);
    await markCompleted(user.id, s.id);
    const next = await getOrCreateNext(user.id, programId);
    await markStarted(user.id, next.id);
    identity = await getMyIdentitySummary(user.id);
    expect(identity.currentSession).toMatchObject({ status: "IN_PROGRESS", workoutDayName: "Pull" });
    expect(identity.lastCompletedSessionAt).not.toBeNull();

    await ageSession(next.id, STALE);
    identity = await getMyIdentitySummary(user.id);
    expect(identity.currentSession).toBeNull();
  });
});
