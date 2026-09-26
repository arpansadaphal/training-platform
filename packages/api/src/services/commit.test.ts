// packages/api/src/services/commit.test.ts
//
// End-to-end tests for the commit flow through commitFromDraft — the
// Builder's manual path into the single commit function.
//
// These are integration tests: real Postgres, real domain engine, real
// Prisma transaction. No mocks. The point is to prove that a commit
// produces a structurally valid ProgramVersion and that the surrounding
// rows (Revision, AssessmentSnapshot, Program.activeVersionId, draft
// status) land together, or not at all.
//
// Per Q3 of the Phase 4 kickoff: the shipped HYPERTROPHY config has all-null
// thresholds per ARCH-029-031, so computeAssessment returns UNVALIDATED.
// That's asserted explicitly below — the service must not fabricate a
// banded assessment, and the test would catch a regression that tried to.

import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupTrackedUsers,
  makeTestUser,
  assertDefined,
  listExercises,
  findDraftById,
  findProgramById,
  prisma,
} from "@training/db";
import type { ProgramStructure } from "@training/domain";
import { createMyProgram } from "./programService";
import { createMyDraft, updateMyDraftStructure } from "./draftService";
import { commitFromDraft } from "./programVersionService";

afterEach(cleanupTrackedUsers);

/**
 * Minimal but real structure — at least one day with at least one
 * prescription referencing a seeded exercise. Empty structures are legal
 * but don't exercise the nested write path.
 */
async function sampleStructure(): Promise<ProgramStructure> {
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
            targetSets: 3,
            targetRepsLow: 5,
            targetRepsHigh: 8,
            loadScheme: { type: "BODYWEIGHT" },
          },
        ],
      },
    ],
  };
}

describe("commitFromDraft — end to end", () => {
  it("produces a structurally valid ProgramVersion plus Revision, Snapshot, active-pointer, and COMMITTED draft", async () => {
    const user = await makeTestUser("Commit E2E Test");
    const program = await createMyProgram(user.id, "Commit Test");
    const draft = await createMyDraft(user.id, program.id, {
      label: "First draft",
    });
    const structure = await sampleStructure();
    await updateMyDraftStructure(user.id, draft.id, structure);

    const version = await commitFromDraft(user.id, draft.id);

    // ── The version row ───────────────────────────────────────────────────
    expect(version.versionNumber).toBe(1);
    expect(version.createdVia).toBe("MANUAL_COMMIT");
    expect(version.programId).toBe(program.id);
    // Structure round-trips: applyMutation renumbers orderIndex but our
    // input was already contiguous, so the snapshot deep-equals the input.
    expect(version.structureSnapshot).toEqual(structure);

    // ── Revision ─────────────────────────────────────────────────────────
    const revision = await prisma.revision.findFirst({
      where: { toVersionId: version.id },
    });
    expect(revision).not.toBeNull();
    const rev = assertDefined(revision, "revision");
    expect(rev.programId).toBe(program.id);
    expect(rev.fromVersionId).toBeNull(); // first commit
    expect(rev.trigger).toBe("MANUAL_COMMIT");
    expect(rev.sourceSimulationId).toBeNull();

    // ── AssessmentSnapshot ───────────────────────────────────────────────
    const snapshot = await prisma.assessmentSnapshot.findFirst({
      where: { programVersionId: version.id },
    });
    expect(snapshot).not.toBeNull();
    const snap = assertDefined(snapshot, "snapshot");
    expect(snap.reason).toBe("COMMIT");
    expect(snap.engineVersion).toBe("0.1.0");
    // thresholdsVersion comes from GoalProfileDefinition.configVersion,
    // which the seed sets to a non-empty string. Asserting non-empty rather
    // than a specific value keeps the test stable across seed revisions.
    expect(snap.thresholdsVersion.length).toBeGreaterThan(0);
    expect(snap.goalId).toBe(program.currentGoalId);

    // Per Q3: shipped config is unvalidated; assessment payload must carry
    // that signal, not a fabricated band.
    const assessment = snap.assessment as { kind: string };
    expect(assessment.kind).toBe("UNVALIDATED");

    // ── Program.activeVersionId flipped ──────────────────────────────────
    const reloaded = await findProgramById(program.id);
    expect(reloaded?.activeVersionId).toBe(version.id);

    // ── Draft marked COMMITTED ───────────────────────────────────────────
    const reloadedDraft = await findDraftById(draft.id);
    expect(reloadedDraft?.status).toBe("COMMITTED");
    expect(reloadedDraft?.committedAsVersionId).toBe(version.id);
  });

  it("sequential commits produce monotonically increasing versionNumber and update the active pointer", async () => {
    const user = await makeTestUser("Sequential Commit Test");
    const program = await createMyProgram(user.id, "Sequential");
    const structure = await sampleStructure();

    const draftA = await createMyDraft(user.id, program.id, { label: "A" });
    await updateMyDraftStructure(user.id, draftA.id, structure);
    const v1 = await commitFromDraft(user.id, draftA.id);

    const draftB = await createMyDraft(user.id, program.id, { label: "B" });
    await updateMyDraftStructure(user.id, draftB.id, structure);
    const v2 = await commitFromDraft(user.id, draftB.id);

    expect(v1.versionNumber).toBe(1);
    expect(v2.versionNumber).toBe(2);

    const reloaded = await findProgramById(program.id);
    expect(reloaded?.activeVersionId).toBe(v2.id);

    // The v1 → v2 Revision links the two versions.
    const link = await prisma.revision.findFirst({
      where: { toVersionId: v2.id },
    });
    expect(link?.fromVersionId).toBe(v1.id);
  });
});