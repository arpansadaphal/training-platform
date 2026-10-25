// packages/api/src/services/trainingRecord.test.ts
//
// Project 4 against the real database: the journal, the note that comes back
// at the next session of the same day, the milestone line on the summary and
// the CSV export. The arithmetic and copy are unit tested in @training/domain
// (progress/__tests__/trainingRecord.test.ts); this covers the loading layer:
// which sessions count, whose data is read, and what comes back verbatim.

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
import { createMyObservation } from "./observationService";
import { getSessionSummary } from "./progressService";
import { exportTrainingCsv, getJournalPage } from "./journalService";

const DAY_MS = 86_400_000;

async function setupProgram(user: UserRecord): Promise<{ programId: string; exerciseNames: string[] }> {
  const exercises = await listExercises();
  const barbell = exercises.find((e) => e.equipment === "barbell")!;
  const dumbbell = exercises.find((e) => e.equipment === "dumbbell")!;
  const machine = exercises.find((e) => e.equipment === "machine")!;
  const rx = (id: string, k: number, exerciseId: string) => ({
    id,
    orderIndex: k,
    exerciseId,
    targetSets: 3,
    targetRepsLow: 8,
    targetRepsHigh: 12,
    targetRpe: 8,
    loadScheme: { type: "FIXED_WEIGHT" as const, weight: 20, unit: "kg" as const },
  });
  const structure: ProgramStructure = {
    workoutDays: [
      {
        id: "d-a",
        orderIndex: 0,
        name: "Full Body A",
        prescriptions: [rx("rx-a0", 0, barbell.id), rx("rx-a1", 1, dumbbell.id)],
      },
      {
        id: "d-b",
        orderIndex: 1,
        name: "Full Body B",
        prescriptions: [rx("rx-b0", 0, machine.id)],
      },
    ],
  };
  const program = await createMyProgram(user.id, "Record");
  const draft = await createMyDraft(user.id, program.id, { label: "v1" });
  await updateMyDraftStructure(user.id, draft.id, structure);
  await commitFromDraft(user.id, draft.id);
  return { programId: program.id, exerciseNames: [barbell.name, dumbbell.name, machine.name] };
}

/** Trains one day (3 sets per prescription at `loads[i]` x `reps`) and dates it `daysAgo` days back. */
async function train(
  user: UserRecord,
  programId: string,
  dayIndex: number,
  loads: number[],
  reps: number,
  daysAgo: number,
  note?: string,
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
  if (note !== undefined) await createMyObservation(user.id, { sessionId: session.id, content: note });
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

describe("journal", () => {
  let user: UserRecord;
  beforeEach(async () => {
    user = await makeTestUser("Journal");
  });
  afterEach(cleanupTrackedUsers);

  it("is empty for a lifter with nothing logged", async () => {
    const page = await getJournalPage(user.id);
    expect(page).toEqual({ entries: [], nextBefore: null, totalSessions: 0 });
  });

  it("lists logged sessions newest first with day, duration, top sets, PRs and the note", async () => {
    const { programId, exerciseNames } = await setupProgram(user);
    await train(user, programId, 0, [40, 10], 10, 14);
    await train(user, programId, 0, [47.5, 10], 10, 7, "Left knee felt off today");
    const page = await getJournalPage(user.id);

    expect(page.totalSessions).toBe(2);
    expect(page.entries.map((e) => e.completedAt)).toEqual(
      [...page.entries.map((e) => e.completedAt)].sort().reverse(),
    );
    const [newest, oldest] = page.entries;
    expect(newest).toMatchObject({
      dayName: "Full Body A",
      durationMinutes: 45,
      note: "Left knee felt off today",
      prLine: `New PR on ${exerciseNames[0]}`,
    });
    expect(newest!.topSets.map((t) => t.text)).toEqual([
      `${exerciseNames[0]} 47.5 kg × 10`,
      `${exerciseNames[1]} 10 kg × 10`,
    ]);
    // The first session is a baseline: no PR, and no note.
    expect(oldest).toMatchObject({ prLine: null, note: null });
  });

  it("pages older sessions with a cursor", async () => {
    const { programId } = await setupProgram(user);
    for (const daysAgo of [20, 13, 6]) await train(user, programId, 0, [40, 10], 10, daysAgo);

    const first = await getJournalPage(user.id, { limit: 2 });
    expect(first.entries).toHaveLength(2);
    expect(first.nextBefore).toBe(first.entries[1]!.completedAt);
    const second = await getJournalPage(user.id, { limit: 2, before: first.nextBefore! });
    expect(second.entries).toHaveLength(1);
    expect(second.nextBefore).toBeNull();
    expect(second.entries[0]!.completedAt < first.entries[1]!.completedAt).toBe(true);
  });

  it("judges a PR against the whole history, not only the page on screen", async () => {
    const { programId, exerciseNames } = await setupProgram(user);
    await train(user, programId, 0, [40, 10], 10, 20);
    await train(user, programId, 0, [45, 10], 10, 13);
    await train(user, programId, 0, [50, 10], 10, 6);
    const older = await getJournalPage(user.id, { limit: 1, before: new Date(Date.now() - 5 * DAY_MS).toISOString() });
    expect(older.entries[0]!.prLine).toBe(`New PR on ${exerciseNames[0]}`);
  });

  it("does not list a session completed with nothing logged", async () => {
    const { programId } = await setupProgram(user);
    const id = await openSession(user, programId, 0);
    await markCompleted(user.id, id);
    expect((await getJournalPage(user.id)).totalSessions).toBe(0);
  });

  it("never shows another lifter's sessions or notes", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [40, 10], 10, 3, "mine");
    const other = await makeTestUser("Other");
    const theirs = await setupProgram(other);
    await train(other, theirs.programId, 0, [100, 30], 5, 2, "theirs");

    const mine = await getJournalPage(user.id);
    expect(mine.entries.map((e) => e.note)).toEqual(["mine"]);
    const csv = await exportTrainingCsv(user.id);
    expect(csv).not.toContain("theirs");
    expect(csv).toContain("mine");
  });
});

describe("a note comes back at the next session of the same day", () => {
  let user: UserRecord;
  beforeEach(async () => {
    user = await makeTestUser("Notes");
  });
  afterEach(cleanupTrackedUsers);

  it("echoes the note verbatim at session N+1 of the same day name", async () => {
    const { programId } = await setupProgram(user);
    const note = "Left knee felt off today.\nSkipped the last set — 'tight'.";
    await train(user, programId, 0, [40, 10], 10, 3, note);

    const next = await openSession(user, programId, 0);
    const { recalledNote } = await getSessionPage(user.id, next);
    expect(recalledNote).toMatchObject({ dayName: "Full Body A", notes: [note] });
    expect(recalledNote!.completedAtIso).toBeTruthy();
  });

  it("matches the day name without regard to case", async () => {
    const { programId } = await setupProgram(user);
    const first = await train(user, programId, 0, [40, 10], 10, 3, "shoulder tight");
    await prisma.workoutDay.update({
      where: { id: (await prisma.session.findUniqueOrThrow({ where: { id: first } })).workoutDayId },
      data: { name: "FULL BODY A" },
    });
    const next = await openSession(user, programId, 0);
    expect((await getSessionPage(user.id, next)).recalledNote?.notes).toEqual(["shoulder tight"]);
  });

  it("returns every note written in that session, in order", async () => {
    const { programId } = await setupProgram(user);
    const id = await train(user, programId, 0, [40, 10], 10, 3, "first thought");
    await createMyObservation(user.id, { sessionId: id, content: "second thought" });
    const next = await openSession(user, programId, 0);
    expect((await getSessionPage(user.id, next)).recalledNote?.notes).toEqual([
      "first thought",
      "second thought",
    ]);
  });

  it("does not show it on a different day", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [40, 10], 10, 3, "knee");
    const b = await openSession(user, programId, 1);
    expect((await getSessionPage(user.id, b)).recalledNote).toBeNull();
  });

  it("comes back once: the session after the next one does not repeat it", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [40, 10], 10, 6, "knee");
    await train(user, programId, 0, [40, 10], 10, 3); // no note
    const third = await openSession(user, programId, 0);
    expect((await getSessionPage(user.id, third)).recalledNote).toBeNull();
  });

  it("does not show a note from a session that was never completed, or from another lifter", async () => {
    const { programId } = await setupProgram(user);
    const open = await openSession(user, programId, 0);
    await createMyObservation(user.id, { sessionId: open, content: "unfinished" });

    const other = await makeTestUser("Other");
    const theirs = await setupProgram(other);
    await train(other, theirs.programId, 0, [100, 30], 5, 2, "not yours");

    // A second lifter's note and this lifter's own open session are both invisible.
    await markCompleted(user.id, open).catch(() => undefined);
    const fresh = await makeTestUser("Fresh");
    const mine = await setupProgram(fresh);
    const id = await openSession(fresh, mine.programId, 0);
    expect((await getSessionPage(fresh.id, id)).recalledNote).toBeNull();
  });

  it("is not shown once the session is complete", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [40, 10], 10, 6, "knee");
    const second = await train(user, programId, 0, [40, 10], 10, 3);
    expect((await getSessionPage(user.id, second)).recalledNote).toBeNull();
  });
});

describe("milestones on the summary", () => {
  let user: UserRecord;
  beforeEach(async () => {
    user = await makeTestUser("Milestones");
  });
  afterEach(cleanupTrackedUsers);

  it("names the 10th session on its summary, and still does on a revisit", async () => {
    const { programId } = await setupProgram(user);
    let tenth = "";
    for (let n = 1; n <= 10; n++) {
      tenth = await train(user, programId, 0, [40, 10], 10, 12 - n);
    }
    const first = await getSessionSummary(user.id, tenth);
    expect(first.milestone).toBe("Your 10th session.");
    expect((await getSessionSummary(user.id, tenth)).milestone).toBe("Your 10th session.");
  });

  it("says nothing on the sessions around it", async () => {
    const { programId } = await setupProgram(user);
    const ids: string[] = [];
    for (let n = 1; n <= 3; n++) ids.push(await train(user, programId, 0, [40, 10], 10, 6 - n));
    for (const id of ids) expect((await getSessionSummary(user.id, id)).milestone).toBeNull();
  });

  it("names the first session at a new round weight, once", async () => {
    const { programId, exerciseNames } = await setupProgram(user);
    await train(user, programId, 0, [52.5, 10], 10, 9);
    const crossing = await train(user, programId, 0, [60, 10], 10, 6);
    const after = await train(user, programId, 0, [60, 10], 10, 3);
    expect((await getSessionSummary(user.id, crossing)).milestone).toBe(
      `First session at 60 kg on ${exerciseNames[0]}.`,
    );
    expect((await getSessionSummary(user.id, after)).milestone).toBeNull();
  });

  it("names the weeks since the first session, once", async () => {
    const { programId } = await setupProgram(user);
    await train(user, programId, 0, [40, 10], 10, 30);
    await train(user, programId, 0, [40, 10], 10, 20);
    const fourWeeks = await train(user, programId, 0, [40, 10], 10, 1);
    expect((await getSessionSummary(user.id, fourWeeks)).milestone).toBe(
      "Four weeks since your first session.",
    );
  });

  it("does not count a session completed with nothing logged", async () => {
    const { programId } = await setupProgram(user);
    for (let n = 1; n <= 9; n++) await train(user, programId, 0, [40, 10], 10, 20 - n);
    const empty = await openSession(user, programId, 0);
    await markCompleted(user.id, empty);
    const tenth = await train(user, programId, 0, [40, 10], 10, 1);
    expect((await getSessionSummary(user.id, tenth)).milestone).toBe("Your 10th session.");
  });
});

describe("export", () => {
  let user: UserRecord;
  beforeEach(async () => {
    user = await makeTestUser("Export");
  });
  afterEach(cleanupTrackedUsers);

  it("is only the header for a lifter with nothing logged", async () => {
    expect(await exportTrainingCsv(user.id)).toBe(
      "session_date,day,exercise,set_number,reps,weight,unit,rpe,completed_at,session_note\r\n",
    );
  });

  it("writes one row per logged set with the session's day and note", async () => {
    const { programId, exerciseNames } = await setupProgram(user);
    await train(user, programId, 0, [40, 10], 10, 7, 'Felt "heavy", knee off');
    await train(user, programId, 1, [30], 12, 3);
    const lines = (await exportTrainingCsv(user.id)).trimEnd().split("\r\n");
    // header + 2 exercises x 3 sets + 1 exercise x 3 sets
    expect(lines).toHaveLength(1 + 6 + 3);
    expect(lines[1]).toMatch(
      new RegExp(`^\\d{4}-\\d{2}-\\d{2},Full Body A,${exerciseNames[0]},1,10,40,kg,8,.+,"Felt ""heavy"", knee off"$`),
    );
    expect(lines.slice(1).filter((l) => l.includes(",Full Body B,"))).toHaveLength(3);
    // Oldest session first.
    expect(lines[1]).toContain("Full Body A");
    expect(lines[lines.length - 1]).toContain("Full Body B");
  });
});
