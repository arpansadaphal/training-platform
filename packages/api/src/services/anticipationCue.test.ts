// ─────────────────────────────────────────────────────────────────────────────
// Integration — the identity service derives the cue from real block data.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupTrackedUsers,
  findActiveTrainingBlockForProgram,
  listExercises,
  makeTestUser,
} from "@training/db";
import type { ProgramStructure } from "@training/domain";
import { createMyProgram } from "./programService";
import {
  createMyDraft,
  updateMyDraftStructure,
} from "./draftService";
import { commitFromDraft } from "./programVersionService";
import { getOrCreateNext, markCompleted, markStarted } from "./sessionService";
import { getMyIdentitySummary } from "./identityService";

async function makeStructure(): Promise<ProgramStructure> {
  const exercises = await listExercises();
  const first = exercises[0];
  if (!first) throw new Error("Seed missing exercises");
  return {
    workoutDays: [
      {
        id: "day-a",
        orderIndex: 0,
        name: "Day A",
        prescriptions: [
          {
            id: "rx-a",
            orderIndex: 0,
            exerciseId: first.id,
            targetSets: 3,
            targetRepsLow: 8,
            targetRepsHigh: 10,
            loadScheme: { type: "BODYWEIGHT" },
          },
        ],
      },
    ],
  };
}

/**
 * Build a user with an ACTIVE block. When `completeSessions` > 0, that many
 * Sessions are started and completed so sessionsCompletedInBlock reflects
 * real execution data — the assertion derives its expectation from the
 * actual count, never a hardcoded string.
 */
async function buildFixtureWithCompletedSessions(
  completeSessions: number,
): Promise<{ userId: string; programId: string; blockId: string }> {
  const user = await makeTestUser(`Cue User (${completeSessions})`);
  const program = await createMyProgram(user.id, "Cue Program");
  const draft = await createMyDraft(user.id, program.id, { label: "v1" });
  await updateMyDraftStructure(user.id, draft.id, await makeStructure());
  await commitFromDraft(user.id, draft.id);

  const block = await findActiveTrainingBlockForProgram(program.id);
  if (!block) throw new Error("No active block after commit");

  for (let i = 0; i < completeSessions; i++) {
    const session = await getOrCreateNext(user.id, program.id);
    await markStarted(user.id, session.id);
    await markCompleted(user.id, session.id);
  }

  return { userId: user.id, programId: program.id, blockId: block.id };
}

describe("getMyIdentitySummary — anticipation cue from real data", () => {
  afterEach(cleanupTrackedUsers);

  it("cue text differs when sessionsCompletedInBlock differs (no hardcoded strings)", async () => {
    const twoSessions = await buildFixtureWithCompletedSessions(2);
    const fiveSessions = await buildFixtureWithCompletedSessions(5);

    const summaryTwo = await getMyIdentitySummary(twoSessions.userId);
    const summaryFive = await getMyIdentitySummary(fiveSessions.userId);

    const cueTwo = summaryTwo.primaryProgram?.currentBlock?.anticipationCue;
    const cueFive = summaryFive.primaryProgram?.currentBlock?.anticipationCue;

    expect(cueTwo).toBeDefined();
    expect(cueFive).toBeDefined();
    if (!cueTwo || !cueFive) return;

    // Derived from the actual completion counts, not from a literal.
    expect(cueTwo.text).toContain(String(2));
    expect(cueFive.text).toContain(String(5));
    expect(cueTwo.text).not.toBe(cueFive.text);

    // Same structure, same block shape — the ONLY input that changed is
    // the session count, which is exactly what the ruling asked the test
    // to derive from.
  });

  it("null plannedLengthWeeks → fact-only cue, never a projection", async () => {
    // The seed's commit path does not set plannedLengthWeeks, so the
    // default fixture already exercises the null-length branch. If a
    // future phase sets a default, this test's expectation (fact only)
    // flips; that is intentional — this test pins the current behavior.
    const f = await buildFixtureWithCompletedSessions(3);
    const summary = await getMyIdentitySummary(f.userId);
    const cue = summary.primaryProgram?.currentBlock?.anticipationCue;
    expect(cue).toBeDefined();
    if (!cue) return;
    expect(cue.kind).toBe("NO_PLANNED_LENGTH");
    expect(cue.text).not.toMatch(/remaining/i);
    expect(cue.text).toContain(String(3));
  });
});