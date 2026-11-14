// packages/api/src/services/exerciseCues.test.ts
//
// Exercise cues, against the seeded database: every exercise has them, only the session screen is sent them,
// and the analysis engine's input is exactly what it was before they existed.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTrackedUsers, listExercises, makeTestUser, type UserRecord } from "@training/db";
import type { ProgramStructure } from "@training/domain";
import { appRouter } from "../router";
import { createMyProgram } from "./programService";
import { createMyDraft, updateMyDraftStructure } from "./draftService";
import { commitFromDraft } from "./programVersionService";
import { getOrCreateNext, getSessionPage } from "./sessionService";
import { loadExerciseReferenceData } from "./referenceDataService";

describe("seeded cues", () => {
  it("every exercise has 2-3 cues of at most 90 characters, and none is marked reviewed yet", async () => {
    const all = await listExercises();
    expect(all).toHaveLength(110);
    for (const e of all) {
      expect(e.cues.length, `${e.name}: ${e.cues.length} cues`).toBeGreaterThanOrEqual(2);
      expect(e.cues.length, `${e.name}: ${e.cues.length} cues`).toBeLessThanOrEqual(3);
      for (const line of e.cues)
        expect(line.length, `${e.name}: "${line}"`).toBeLessThanOrEqual(90);
      expect(typeof e.cuesReviewed).toBe("boolean");
    }
  });
});

describe("where cues are sent", () => {
  const original = process.env.CHECK_PUBLIC;
  let user: UserRecord;
  beforeEach(async () => {
    process.env.CHECK_PUBLIC = "true";
    user = await makeTestUser("Cues");
  });
  afterEach(async () => {
    if (original === undefined) delete process.env.CHECK_PUBLIC;
    else process.env.CHECK_PUBLIC = original;
    await cleanupTrackedUsers();
  });

  it("/check's exercise library carries no cues", async () => {
    const exercises = await appRouter.createCaller({ user: null }).check.exercises();
    expect(exercises).toHaveLength(110);
    for (const e of exercises) {
      expect(e.cues, e.name).toEqual([]);
      expect(e.cuesReviewed, e.name).toBe(false);
    }
  });

  it("the Builder's exercise list carries no cues", async () => {
    const caller = appRouter.createCaller({ user: { id: user.id, email: user.email } });
    const exercises = await caller.exercise.listAll();
    expect(exercises).toHaveLength(110);
    for (const e of exercises) expect(e.cues, e.name).toEqual([]);
  });

  it("the analysis engine's reference data has exactly the fields it had before cues", async () => {
    const reference = await loadExerciseReferenceData({ goalProfileKey: "HYPERTROPHY" });
    expect(reference.exercises).toHaveLength(110);
    for (const e of reference.exercises) {
      expect(Object.keys(e).sort(), e.name).toEqual(["equipment", "id", "movementPattern", "name"]);
    }
  });

  it("the session page carries cues for the day's own exercises and for no others", async () => {
    const all = await listExercises();
    const squat = all.find((e) => e.name === "Back Squat")!;
    const structure: ProgramStructure = {
      workoutDays: [
        {
          id: "day-a",
          orderIndex: 0,
          name: "Day A",
          prescriptions: [
            {
              id: "rx-a",
              orderIndex: 0,
              exerciseId: squat.id,
              targetSets: 3,
              targetRepsLow: 8,
              targetRepsHigh: 10,
              loadScheme: { type: "BODYWEIGHT" },
            },
          ],
        },
      ],
    };
    const program = await createMyProgram(user.id, "Cues Session");
    const draft = await createMyDraft(user.id, program.id, { label: "v1" });
    await updateMyDraftStructure(user.id, draft.id, structure);
    await commitFromDraft(user.id, draft.id);
    const session = await getOrCreateNext(user.id, program.id);

    const page = await getSessionPage(user.id, session.id);
    expect(page.exercises).toHaveLength(110);
    const sent = page.exercises.filter((e) => e.cues.length > 0);
    expect(sent.map((e) => e.name)).toEqual(["Back Squat"]);
    expect(sent[0]!.cues).toEqual(squat.cues);
    expect(sent[0]!.cuesReviewed).toBe(false);
  });
});
