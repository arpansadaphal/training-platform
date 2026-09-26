// packages/api/src/services/simulation.test.ts
//
// Service-level tests for simulateAndPersist. Integration: real Postgres,
// real domain engine, real Prisma. No mocks.
//
// The shipped HYPERTROPHY_CONFIG is unvalidated (ARCH-029/031), so the
// persisted Simulation row is always written via the CANNOT_COMPUTE branch.
// That's asserted explicitly: a regression that started fabricating a
// COMPUTED result against the unvalidated config would fail here.
//
// The COMPUTED branch is unit-tested at the domain layer in
// packages/domain/src/mutation/__tests__/diff-assessments.test.ts; this file
// does not duplicate that, it verifies the wiring.

import { afterEach, describe, expect, it } from "vitest";
import {
  assertDefined,
  cleanupTrackedUsers,
  findSimulationById,
  listExercises,
  makeTestUser,
  prisma,
} from "@training/db";
import type { MutationSpec, ProgramStructure } from "@training/domain";
import { createMyProgram } from "./programService";
import { createMyDraft, updateMyDraftStructure } from "./draftService";
import { commitFromDraft } from "./programVersionService";
import { simulateAndPersist } from "./simulationService";

afterEach(cleanupTrackedUsers);

async function sampleStructure(sets = 3): Promise<ProgramStructure> {
  const exercises = await listExercises();
  const ex0 = assertDefined(exercises[0], "exercises[0]");
  return {
    workoutDays: [
      {
        id: "day-a",
        orderIndex: 0,
        name: "Day A",
        prescriptions: [
          {
            id: "rx-1",
            orderIndex: 0,
            exerciseId: ex0.id,
            targetSets: sets,
            targetRepsLow: 5,
            targetRepsHigh: 8,
            loadScheme: { type: "BODYWEIGHT" },
          },
        ],
      },
    ],
  };
}

/** Sets up user + program + a committed v1; returns ids the tests need. */
async function setupWithV1() {
  const user = await makeTestUser("Simulation Test");
  const program = await createMyProgram(user.id, "Simulation");
  const draft = await createMyDraft(user.id, program.id, { label: "v1" });
  await updateMyDraftStructure(user.id, draft.id, await sampleStructure(3));
  const v1 = await commitFromDraft(user.id, draft.id);
  return { user, program, v1 };
}

describe("simulateAndPersist — happy path (shipped config → CANNOT_COMPUTE)", () => {
  it("persists a Simulation row and returns simulationId + result", async () => {
    const { user, program, v1 } = await setupWithV1();

    const mutation: MutationSpec = {
      op: "MODIFY_EXERCISE_PRESCRIPTION",
      prescriptionId: "rx-1",
      changes: { targetSets: 5 },
    };
    const { simulationId, result } = await simulateAndPersist(
      user.id,
      program.id,
      mutation,
    );

    expect(simulationId).not.toBeNull();
    expect(result.kind).toBe("CANNOT_COMPUTE");

    const row = await findSimulationById(assertDefined(simulationId, "simulationId"));
    expect(row).not.toBeNull();
    const sim = assertDefined(row, "simulation row");
    expect(sim.programId).toBe(program.id);
    expect(sim.baseVersionId).toBe(v1.id);
    expect(sim.goalId).toBe(program.currentGoalId);
    expect(sim.createdByConversationId).toBeNull();

    // mutationSpec round-trips as the same value.
    expect(sim.mutationSpec).toEqual(mutation);

    // resultAssessment is the mutated-side AssessmentResult — UNVALIDATED
    // under the shipped config.
    const storedAssessment = sim.resultAssessment as { kind: string };
    expect(storedAssessment.kind).toBe("UNVALIDATED");

    // diff carries the CANNOT_COMPUTE marker and the base side.
    const diff = sim.diff as { kind: string; reason: string };
    expect(diff.kind).toBe("CANNOT_COMPUTE");
    expect(diff.reason).toBe("ASSESSMENT_UNVALIDATED");
  });

  it("records the base version's structure as the simulation's base — not some other version", async () => {
    const { user, program, v1 } = await setupWithV1();

    // Commit v2 so the program has two versions; simulating must target the
    // active one (v2), never the older v1.
    const draftB = await createMyDraft(user.id, program.id, { label: "v2" });
    await updateMyDraftStructure(user.id, draftB.id, await sampleStructure(4));
    const v2 = await commitFromDraft(user.id, draftB.id);
    expect(v2.id).not.toBe(v1.id);

    const mutation: MutationSpec = {
      op: "MODIFY_EXERCISE_PRESCRIPTION",
      prescriptionId: "rx-1",
      changes: { targetSets: 6 },
    };
    const { simulationId } = await simulateAndPersist(
      user.id,
      program.id,
      mutation,
    );
    const sim = assertDefined(
      await findSimulationById(assertDefined(simulationId, "simulationId")),
      "simulation row",
    );
    expect(sim.baseVersionId).toBe(v2.id);
  });
});

describe("simulateAndPersist — INVALID_MUTATION writes no row", () => {
  it("returns simulationId:null and does not persist", async () => {
    const { user, program } = await setupWithV1();

    const before = await prisma.simulation.count({
      where: { programId: program.id },
    });

    const { simulationId, result } = await simulateAndPersist(
      user.id,
      program.id,
      { op: "REMOVE_WORKOUT_DAY", workoutDayId: "no-such-day" },
    );

    expect(result.kind).toBe("INVALID_MUTATION");
    expect(simulationId).toBeNull();

    const after = await prisma.simulation.count({
      where: { programId: program.id },
    });
    expect(after).toBe(before);
  });

  it("returns the MutationError as a first-class value, not a thrown exception", async () => {
    const { user, program } = await setupWithV1();

    // No try/catch — the call must not throw.
    const { result } = await simulateAndPersist(user.id, program.id, {
      op: "REMOVE_EXERCISE_PRESCRIPTION",
      prescriptionId: "no-such-rx",
    });

    expect(result.kind).toBe("INVALID_MUTATION");
    if (result.kind !== "INVALID_MUTATION") return;
    expect(result.error.code).toBe("PRESCRIPTION_NOT_FOUND");
    expect(result.error.name).toBe("MutationError");
  });
});

describe("simulateAndPersist — preconditions", () => {
  it("throws NOT_FOUND when the caller does not own the program", async () => {
    const owner = await makeTestUser("Owner");
    const other = await makeTestUser("Other");
    const program = await createMyProgram(owner.id, "Not Yours");
    const draft = await createMyDraft(owner.id, program.id, { label: "v1" });
    await updateMyDraftStructure(owner.id, draft.id, await sampleStructure(3));
    await commitFromDraft(owner.id, draft.id);

    let caught: unknown;
    try {
      await simulateAndPersist(other.id, program.id, {
        op: "MODIFY_EXERCISE_PRESCRIPTION",
        prescriptionId: "rx-1",
        changes: { targetSets: 5 },
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    const err = caught as { code?: string };
    expect(err.code).toBe("NOT_FOUND");
  });

  it("throws PRECONDITION_FAILED when the program has no committed version yet", async () => {
    const user = await makeTestUser("No Version");
    const program = await createMyProgram(user.id, "Empty");

    let caught: unknown;
    try {
      await simulateAndPersist(user.id, program.id, {
        op: "ADD_WORKOUT_DAY",
        day: { id: "day-a", orderIndex: 0, name: "A", prescriptions: [] },
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    const err = caught as { code?: string };
    expect(err.code).toBe("PRECONDITION_FAILED");
  });
});