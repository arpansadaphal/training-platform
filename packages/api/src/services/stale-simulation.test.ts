// packages/api/src/services/stale-simulation.test.ts
//
// Invariant 6, applied to the simulation path: "Stale-state is detected, not
// silently overwritten. If the base ProgramVersion changed between simulate
// and apply, re-simulation is required."
//
// Two failure modes to distinguish — they are NOT the same class of error and
// the client must react to them differently:
//
//   1. StaleSimulationError (CONFLICT) — the Program moved on since the
//      simulation ran. The client must re-run simulate() and offer Apply
//      against the fresh result.
//
//   2. SimulationAlreadyAppliedError (PRECONDITION_FAILED) — the mutation
//      already produced a version. The client must NOT retry; it should
//      refresh the version list. This is detected by the presence of a
//      Revision with sourceSimulationId pointing at this simulation, not by
//      the stale check (the stale check can no longer fire — the applied
//      simulation's baseVersionId is by definition no longer active).

import { afterEach, describe, expect, it } from "vitest";
import {
  assertDefined,
  cleanupTrackedUsers,
  listExercises,
  makeTestUser,
} from "@training/db";
import type { MutationSpec, ProgramStructure } from "@training/domain";
import { createMyProgram } from "./programService";
import { createMyDraft, updateMyDraftStructure } from "./draftService";
import {
  commitFromDraft,
  commitFromSimulation,
} from "./programVersionService";
import { simulateAndPersist } from "./simulationService";
import {
  SimulationAlreadyAppliedError,
  StaleSimulationError,
} from "../errors";

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

async function setupWithV1(label = "Stale Sim Test") {
  const user = await makeTestUser(label);
  const program = await createMyProgram(user.id, label);
  const draft = await createMyDraft(user.id, program.id, { label: "v1" });
  await updateMyDraftStructure(user.id, draft.id, await sampleStructure(3));
  const v1 = await commitFromDraft(user.id, draft.id);
  return { user, program, v1 };
}

const MUTATION: MutationSpec = {
  op: "MODIFY_EXERCISE_PRESCRIPTION",
  prescriptionId: "rx-1",
  changes: { targetSets: 5 },
};

describe("StaleSimulationError (invariant 6)", () => {
  it("rejects applying a simulation whose base is no longer the active version", async () => {
    const { user, program, v1 } = await setupWithV1();

    // Simulate against v1.
    const { simulationId } = await simulateAndPersist(
      user.id,
      program.id,
      MUTATION,
    );
    const simId = assertDefined(simulationId, "simulationId");

    // Move the pointer: commit v2 through the manual draft path.
    const draftB = await createMyDraft(user.id, program.id, { label: "v2" });
    await updateMyDraftStructure(user.id, draftB.id, await sampleStructure(4));
    const v2 = await commitFromDraft(user.id, draftB.id);
    expect(v2.versionNumber).toBe(2);

    // Attempt to apply the now-stale simulation.
    let caught: unknown;
    try {
      await commitFromSimulation(user.id, simId);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(StaleSimulationError);
    const stale = caught as StaleSimulationError;
    expect(stale.simulationId).toBe(simId);
    expect(stale.baseVersionId).toBe(v1.id);
    expect(stale.currentVersionId).toBe(v2.id);
  });

  it("does not write a version when the stale check rejects", async () => {
    const { user, program } = await setupWithV1();

    const { simulationId } = await simulateAndPersist(
      user.id,
      program.id,
      MUTATION,
    );
    const simId = assertDefined(simulationId, "simulationId");

    const draftB = await createMyDraft(user.id, program.id, { label: "v2" });
    await updateMyDraftStructure(user.id, draftB.id, await sampleStructure(4));
    await commitFromDraft(user.id, draftB.id);

    let caught: unknown;
    try {
      await commitFromSimulation(user.id, simId);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(StaleSimulationError);

    // The active version is still v2; nothing was written beyond it.
    const reloaded = await createMyProgramAndGetVersionCount(
      user.id,
      program.id,
    );
    expect(reloaded).toBe(2);
  });
});

describe("SimulationAlreadyAppliedError", () => {
  it("rejects a second commitFromSimulation against the same simulation", async () => {
    const { user, program } = await setupWithV1();

    const { simulationId } = await simulateAndPersist(
      user.id,
      program.id,
      MUTATION,
    );
    const simId = assertDefined(simulationId, "simulationId");

    // First apply: succeeds.
    const v2 = await commitFromSimulation(user.id, simId);
    expect(v2.versionNumber).toBe(2);
    expect(v2.createdVia).toBe("AI_APPLIED_SIMULATION");

    // Second apply: rejected — a Revision with this sourceSimulationId
    // already exists.
    let caught: unknown;
    try {
      await commitFromSimulation(user.id, simId);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SimulationAlreadyAppliedError);
    const err = caught as SimulationAlreadyAppliedError;
    expect(err.simulationId).toBe(simId);
    expect(err.appliedAsVersionId).toBe(v2.id);
  });

  it("only writes one version for one simulation", async () => {
    const { user, program } = await setupWithV1();
    const { simulationId } = await simulateAndPersist(
      user.id,
      program.id,
      MUTATION,
    );
    const simId = assertDefined(simulationId, "simulationId");

    await commitFromSimulation(user.id, simId);

    try {
      await commitFromSimulation(user.id, simId);
    } catch {
      /* expected */
    }

    const count = await createMyProgramAndGetVersionCount(user.id, program.id);
    expect(count).toBe(2); // v1 (draft) + v2 (simulation), no third
  });
});

// Small helper kept here rather than exported from a shared test util — it
// exists for a single assertion and doesn't belong in @training/db's helpers.
async function createMyProgramAndGetVersionCount(
  _userId: string,
  programId: string,
): Promise<number> {
  const { listVersionsByProgram } = await import("@training/db");
  const versions = await listVersionsByProgram(programId);
  return versions.length;
}