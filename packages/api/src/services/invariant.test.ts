// packages/api/src/services/invariant.test.ts
//
// THE Phase 5 invariant test — full-stack, the version the phase file names.
//
// Shape (phase-05, Q6):
//   1. Commit v1 (manual path — a base to simulate against).
//   2. Simulate a mutation → persisted Simulation row.
//   3. commitFromSimulation(simId) → new ProgramVersion.
//   4. Independently reload the persisted ProgramVersion, recompute
//      applyMutation + computeAnalysis + computeAssessment against its
//      structureSnapshot.
//   5. Assert structural identity:
//        - reloaded structure === applyMutation(v1Structure, mutation)
//        - snapshot.metrics      === independently recomputed Analysis
//        - Simulation.resultAnalysis === snapshot.metrics (modulo timestamps)
//        - snapshot.assessment   === independently recomputed AssessmentResult
//        - Simulation.resultAssessment === snapshot.assessment (modulo timestamps)
//
//      The first is the structure round-trip; the middle pair proves commit
//      persisted what the engine produced; the last pair is the actual
//      invariant: what simulate computed and what commit produced are the
//      same value, because both went through the same applyMutation.
//
// Timestamp handling: computeAnalysis takes an injectable `now`, but
// commitFromMutation does not thread one through, so simulate's `computedAt`
// and commit's `computedAt` legitimately differ. Timestamps are metadata;
// the assessment content is the invariant. The comparison strips
// `computedAt` and `derivedFromAssessmentComputedAt` at any depth before
// comparing. See the C4 resolution in the Phase 5 kickoff.
//
// The createdVia / trigger assertions are the regression guard for the
// origin-via widening in programVersionService.ts: without them, a future
// refactor could reintroduce the hardcoded "MANUAL_COMMIT" and no existing
// test would catch it (both values would still pass every other assertion).

import { afterEach, describe, expect, it } from "vitest";
import {
  assertDefined,
  cleanupTrackedUsers,
  findLatestAssessmentSnapshotForVersion,
  findSimulationById,
  findVersionById,
  listExercises,
  makeTestUser,
  prisma,
} from "@training/db";
import {
  HYPERTROPHY_CONFIG,
  applyMutation,
  computeAnalysis,
  computeAssessment,
  type MutationSpec,
  type ProgramStructure,
} from "@training/domain";
import { createMyProgram } from "./programService";
import { createMyDraft, updateMyDraftStructure } from "./draftService";
import {
  commitFromDraft,
  commitFromSimulation,
} from "./programVersionService";
import { simulateAndPersist } from "./simulationService";
import { loadExerciseReferenceData } from "./referenceDataService";

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

/**
 * Deep-strip timestamp keys before comparison. Uses a JSON replacer so the
 * strip applies at every nesting level — Analysis.computedAt,
 * Assessment.computedAt, and FitScore.derivedFromAssessmentComputedAt are all
 * removed by their key names.
 */
function withoutTimestamps(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, val) =>
      key === "computedAt" || key === "derivedFromAssessmentComputedAt"
        ? undefined
        : val,
    ),
  );
}

const MUTATION: MutationSpec = {
  op: "MODIFY_EXERCISE_PRESCRIPTION",
  prescriptionId: "rx-1",
  changes: { targetSets: 5 },
};

describe("Phase 5 invariant — simulate and commit share applyMutation", () => {
  it("the persisted version's engine output is structurally identical to the simulation's", async () => {
    // ── Setup: user + program + committed v1 ───────────────────────────────
    const user = await makeTestUser("Invariant Full-Stack");
    const program = await createMyProgram(user.id, "Invariant");
    const draft = await createMyDraft(user.id, program.id, { label: "v1" });
    await updateMyDraftStructure(user.id, draft.id, await sampleStructure(3));
    const v1 = await commitFromDraft(user.id, draft.id);
    const v1Structure = v1.structureSnapshot as ProgramStructure;

    // ── Simulate and persist ───────────────────────────────────────────────
    const { simulationId, result } = await simulateAndPersist(
      user.id,
      program.id,
      MUTATION,
    );
    const simId = assertDefined(simulationId, "simulationId");
    expect(result.kind).toBe("CANNOT_COMPUTE");

    // ── Commit the simulation ──────────────────────────────────────────────
    const v2 = await commitFromSimulation(user.id, simId);
    expect(v2.versionNumber).toBe(2);

    // ── The origin-via regression guard (Q1 approval, 5c.B header) ─────────
    expect(v2.createdVia).toBe("AI_APPLIED_SIMULATION");
    const revision = await prisma.revision.findFirst({
      where: { toVersionId: v2.id },
    });
    expect(revision).not.toBeNull();
    const rev = assertDefined(revision, "revision");
    expect(rev.trigger).toBe("AI_APPLIED_SIMULATION");
    expect(rev.sourceSimulationId).toBe(simId);
    expect(rev.fromVersionId).toBe(v1.id);

    // ── Structure round-trip ───────────────────────────────────────────────
    //
    // The persisted structureSnapshot must equal what applyMutation produces
    // from v1's snapshot with the same mutation. If commit had a private
    // mutation path (invariant 2 failure), this would diverge.
    const expectedStructure = applyMutation(v1Structure, MUTATION);
    expect(v2.structureSnapshot).toEqual(expectedStructure);

    // ── Independent recomputation against the RELOADED version ─────────────
    //
    // Reload through the repository (not the in-memory v2 above), so the
    // comparison exercises the DB round-trip — this is what a review screen
    // or the AI Coach would actually read.
    const reloaded = assertDefined(
      await findVersionById(v2.id),
      "reloaded version",
    );
    const reloadedStructure = reloaded.structureSnapshot as ProgramStructure;
    const refData = await loadExerciseReferenceData();
    const recomputedAnalysis = computeAnalysis(
      reloadedStructure,
      refData,
      HYPERTROPHY_CONFIG,
    );
    const recomputedAssessment = computeAssessment(
      recomputedAnalysis,
      HYPERTROPHY_CONFIG,
      { goalId: assertDefined(program.currentGoalId, "program.currentGoalId") },
    );

    // ── The AssessmentSnapshot recorded by the commit path ─────────────────
    const snapshot = assertDefined(
      await findLatestAssessmentSnapshotForVersion(v2.id),
      "assessment snapshot",
    );

    // (a) commit persisted what an independent recompute produces.
    expect(withoutTimestamps(snapshot.metrics)).toEqual(
      withoutTimestamps(recomputedAnalysis),
    );
    expect(withoutTimestamps(snapshot.assessment)).toEqual(
      withoutTimestamps(recomputedAssessment),
    );

    // ── The persisted Simulation row ───────────────────────────────────────
    const simRow = assertDefined(
      await findSimulationById(simId),
      "simulation row",
    );

    // (b) THE INVARIANT — what simulate computed and what commit produced are
    // the same value (modulo timestamps). This is the load-bearing assertion.
    expect(withoutTimestamps(simRow.resultAnalysis)).toEqual(
      withoutTimestamps(snapshot.metrics),
    );
    expect(withoutTimestamps(simRow.resultAssessment)).toEqual(
      withoutTimestamps(snapshot.assessment),
    );
  });

  it("holds for every mutation op that produces a valid result", async () => {
    // A wider sweep, same comparison shape, across the ops that reach the
    // commit path. REPLACE_STRUCTURE is omitted because simulating a whole-
    // structure replacement from a fresh draft is equivalent to the manual
    // commit path and doesn't exercise the AI-apply flow distinctively.
    const cases: ReadonlyArray<{ name: string; mutation: MutationSpec }> = [
      {
        name: "ADD_EXERCISE_PRESCRIPTION",
        mutation: {
          op: "ADD_EXERCISE_PRESCRIPTION",
          workoutDayId: "day-a",
          prescription: {
            id: "rx-2",
            orderIndex: 1,
            // Any seeded exercise id works; we resolve the first real one
            // at call time inside the loop body below.
            exerciseId: "__RESOLVED__",
            targetSets: 3,
            targetRepsLow: 5,
            targetRepsHigh: 8,
            loadScheme: { type: "BODYWEIGHT" },
          },
        },
      },
      {
        name: "REMOVE_EXERCISE_PRESCRIPTION",
        mutation: {
          op: "REMOVE_EXERCISE_PRESCRIPTION",
          prescriptionId: "rx-1",
        },
      },
      {
        name: "REORDER_EXERCISE_PRESCRIPTIONS (single-element, no-op)",
        mutation: {
          op: "REORDER_EXERCISE_PRESCRIPTIONS",
          workoutDayId: "day-a",
          orderedIds: ["rx-1"],
        },
      },
      {
        name: "ADD_WORKOUT_DAY",
        mutation: {
          op: "ADD_WORKOUT_DAY",
          day: { id: "day-b", orderIndex: 1, name: "Day B", prescriptions: [] },
        },
      },
    ];

    for (const c of cases) {
      // Fresh user/program per case so tests are independent and cleanup
      // ordering stays simple.
      const user = await makeTestUser(`Invariant ${c.name}`);
      const program = await createMyProgram(user.id, `Invariant ${c.name}`);
      const draft = await createMyDraft(user.id, program.id, { label: "v1" });
      await updateMyDraftStructure(user.id, draft.id, await sampleStructure(3));
      const v1 = await commitFromDraft(user.id, draft.id);

      // Resolve the placeholder exercise id for the ADD case.
      let mutation: MutationSpec = c.mutation;
      if (
        mutation.op === "ADD_EXERCISE_PRESCRIPTION" &&
        mutation.prescription.exerciseId === "__RESOLVED__"
      ) {
        const exercises = await listExercises();
        const ex0 = assertDefined(exercises[0], "exercises[0]");
        mutation = {
          ...mutation,
          prescription: { ...mutation.prescription, exerciseId: ex0.id },
        };
      }

      const { simulationId } = await simulateAndPersist(
        user.id,
        program.id,
        mutation,
      );
      const simId = assertDefined(simulationId, `simId for ${c.name}`);
      const v2 = await commitFromSimulation(user.id, simId);

      const simRow = assertDefined(
        await findSimulationById(simId),
        `sim row for ${c.name}`,
      );
      const snapshot = assertDefined(
        await findLatestAssessmentSnapshotForVersion(v2.id),
        `snapshot for ${c.name}`,
      );

      expect(
        withoutTimestamps(simRow.resultAnalysis),
        `analysis for ${c.name}`,
      ).toEqual(withoutTimestamps(snapshot.metrics));
      expect(
        withoutTimestamps(simRow.resultAssessment),
        `assessment for ${c.name}`,
      ).toEqual(withoutTimestamps(snapshot.assessment));

      // The base version link is intact.
      expect(simRow.baseVersionId).toBe(v1.id);
      expect(v2.createdVia).toBe("AI_APPLIED_SIMULATION");
    }
  });
});