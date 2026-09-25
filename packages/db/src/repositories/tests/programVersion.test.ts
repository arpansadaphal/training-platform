// Round-trip test for ProgramVersion: writes a version with nested
// WorkoutDay/ExercisePrescription rows in one transaction, then reads it
// back via findVersionWithStructure and asserts the full nested shape.
//
// Requires seeded Exercise data. If the Exercise table is empty, the test
// fails loudly rather than skipping silently — seed coverage is an explicit
// Phase 1 acceptance criterion.

import { afterEach, describe, expect, it } from "vitest";
import {
  createProgram,
  createProgramVersion,
  findVersionById,
  findVersionWithStructure,
  getMaxVersionNumber,
  listVersionsByProgram,
  listExercises,
} from "../../index";
import { assertDefined, makeTestUser, cleanupTrackedUsers } from "./helpers";

afterEach(cleanupTrackedUsers);

describe("programVersionRepository", () => {
  it("round-trips a ProgramVersion with nested WorkoutDays and ExercisePrescriptions", async () => {
    const exercises = await listExercises();
    if (exercises.length < 2) {
      throw new Error(
        "Exercise seed is missing — Phase 1 requires at least 2 exercises to round-trip a version. Run pnpm --filter @training/db db:seed.",
      );
    }
    const ex1 = assertDefined(exercises[0], "exercises[0]");
    const ex2 = assertDefined(exercises[1], "exercises[1]");

    const user = await makeTestUser("ProgramVersion Repo Test User");
    const program = await createProgram({
      ownerUserId: user.id,
      name: "Round-trip",
    });

    const snapshot = {
      workoutDays: [
        {
          id: "day-a",
          orderIndex: 0,
          name: "Day A",
          prescriptions: [
            {
              id: "rx-1",
              orderIndex: 0,
              exerciseId: ex1.id,
              targetSets: 4,
              targetRepsLow: 5,
              targetRepsHigh: 8,
              targetRpe: 8,
              loadScheme: { type: "PERCENT_1RM" as const, percent: 80 },
            },
            {
              id: "rx-2",
              orderIndex: 1,
              exerciseId: ex2.id,
              targetSets: 3,
              targetRepsLow: 8,
              targetRepsHigh: 12,
              loadScheme: { type: "RPE_BASED" as const, rpe: 8 },
            },
          ],
        },
      ],
    };

    const created = await createProgramVersion({
      programId: program.id,
      versionNumber: 1,
      structureSnapshot: snapshot,
      createdVia: "MANUAL_COMMIT",
      workoutDays: [
        {
          orderIndex: 0,
          name: "Day A",
          prescriptions: [
            {
              orderIndex: 0,
              exerciseId: ex1.id,
              targetSets: 4,
              targetRepsLow: 5,
              targetRepsHigh: 8,
              targetRpe: 8,
              loadScheme: { type: "PERCENT_1RM", percent: 80 },
            },
            {
              orderIndex: 1,
              exerciseId: ex2.id,
              targetSets: 3,
              targetRepsLow: 8,
              targetRepsHigh: 12,
              loadScheme: { type: "RPE_BASED", rpe: 8 },
            },
          ],
        },
      ],
    });

    expect(created.versionNumber).toBe(1);
    expect(created.createdVia).toBe("MANUAL_COMMIT");
    expect(created.structureSnapshot).toEqual(snapshot);

    const fetched = await findVersionWithStructure(created.id);
    const fetchedVersion = assertDefined(
      fetched,
      "findVersionWithStructure result",
    );
    expect(fetchedVersion.workoutDays).toHaveLength(1);

    const day = assertDefined(fetchedVersion.workoutDays[0], "workoutDays[0]");
    expect(day.orderIndex).toBe(0);
    expect(day.name).toBe("Day A");
    expect(day.prescriptions).toHaveLength(2);

    const p1 = assertDefined(day.prescriptions[0], "prescriptions[0]");
    const p2 = assertDefined(day.prescriptions[1], "prescriptions[1]");

    expect(p1.exerciseId).toBe(ex1.id);
    expect(p1.targetSets).toBe(4);
    expect(p1.targetRepsLow).toBe(5);
    expect(p1.targetRepsHigh).toBe(8);
    expect(p1.loadScheme).toEqual({ type: "PERCENT_1RM", percent: 80 });

    expect(p2.exerciseId).toBe(ex2.id);
    expect(p2.loadScheme).toEqual({ type: "RPE_BASED", rpe: 8 });
  });

  // NOTE: This test intentionally triggers a database uniqueness violation.
  // The red `prisma:error ... Unique constraint failed ...` line Prisma
  // prints during this test IS the expected output — the `rejects.toThrow()`
  // assertion below is what verifies it. It is not a bug.
  it("enforces the (programId, versionNumber) uniqueness constraint", async () => {
    const exercises = await listExercises();
    const ex0 = assertDefined(exercises[0], "exercises[0]");

    const user = await makeTestUser("ProgramVersion Repo Test User");
    const program = await createProgram({
      ownerUserId: user.id,
      name: "Unique",
    });

    const minimalDay = {
      orderIndex: 0,
      name: "Day",
      prescriptions: [
        {
          orderIndex: 0,
          exerciseId: ex0.id,
          targetSets: 3,
          targetRepsLow: 5,
          targetRepsHigh: 5,
          loadScheme: { type: "BODYWEIGHT" as const },
        },
      ],
    };

    await createProgramVersion({
      programId: program.id,
      versionNumber: 1,
      structureSnapshot: { workoutDays: [] },
      createdVia: "MANUAL_COMMIT",
      workoutDays: [minimalDay],
    });

    await expect(
      createProgramVersion({
        programId: program.id,
        versionNumber: 1,
        structureSnapshot: { workoutDays: [] },
        createdVia: "MANUAL_COMMIT",
        workoutDays: [minimalDay],
      }),
    ).rejects.toThrow();
  });

  it("getMaxVersionNumber returns 0 for a fresh Program and N after N versions", async () => {
    const exercises = await listExercises();
    const ex0 = assertDefined(exercises[0], "exercises[0]");

    const user = await makeTestUser("ProgramVersion Repo Test User");
    const program = await createProgram({
      ownerUserId: user.id,
      name: "Counted",
    });

    expect(await getMaxVersionNumber(program.id)).toBe(0);

    for (let n = 1; n <= 3; n++) {
      await createProgramVersion({
        programId: program.id,
        versionNumber: n,
        structureSnapshot: { workoutDays: [] },
        createdVia: "MANUAL_COMMIT",
        workoutDays: [
          {
            orderIndex: 0,
            name: `Day v${n}`,
            prescriptions: [
              {
                orderIndex: 0,
                exerciseId: ex0.id,
                targetSets: 3,
                targetRepsLow: 5,
                targetRepsHigh: 5,
                loadScheme: { type: "BODYWEIGHT" },
              },
            ],
          },
        ],
      });
    }

    expect(await getMaxVersionNumber(program.id)).toBe(3);

    const all = await listVersionsByProgram(program.id);
    expect(all.map((v) => v.versionNumber)).toEqual([3, 2, 1]);

    const first = assertDefined(all[0], "all[0]");
    const one = await findVersionById(first.id);
    expect(one?.versionNumber).toBe(3);
  });
});