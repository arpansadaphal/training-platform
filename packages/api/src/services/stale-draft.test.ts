// packages/api/src/services/stale-draft.test.ts
//
// Invariant 6: "Stale-state is detected, not silently overwritten. If the
// base ProgramVersion changed between simulate and apply, re-simulation is
// required."
//
// The literal text names "simulate and apply", but the same failure mode
// applies to a manual commit whose Draft was created from a specific base
// version. Committing such a draft when the Program has moved on would
// silently discard whatever happened in between. This is caught by the
// StaleDraftError check in commitFromMutation, tested here.
//
// Two cases:
//   1. A draft with baseVersionId set whose base is no longer active → reject.
//   2. A draft with baseVersionId null (created from scratch) → no stale
//      check applies, even when some version is active. There is nothing
//      for it to be stale against.

import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupTrackedUsers,
  makeTestUser,
  assertDefined,
  listExercises,
} from "@training/db";
import type { ProgramStructure } from "@training/domain";
import { createMyProgram } from "./programService";
import { createMyDraft, updateMyDraftStructure } from "./draftService";
import { commitFromDraft } from "./programVersionService";
import { StaleDraftError } from "../errors";

afterEach(cleanupTrackedUsers);

async function sampleStructure(name = "Day A"): Promise<ProgramStructure> {
  const exercises = await listExercises();
  const ex0 = assertDefined(exercises[0], "exercises[0]");
  return {
    workoutDays: [
      {
        id: "day-a",
        orderIndex: 0,
        name,
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

describe("StaleDraftError (invariant 6)", () => {
  it("rejects committing a draft whose base version is no longer active", async () => {
    const user = await makeTestUser("Stale Draft Test");
    const program = await createMyProgram(user.id, "Stale Test");

    // ── Commit v1 (from a from-scratch draft) ─────────────────────────────
    const draftA = await createMyDraft(user.id, program.id, { label: "A" });
    await updateMyDraftStructure(user.id, draftA.id, await sampleStructure("A"));
    const v1 = await commitFromDraft(user.id, draftA.id);

    // ── Draft B is created FROM v1 — baseVersionId = v1.id ────────────────
    const draftB = await createMyDraft(user.id, program.id, {
      label: "B",
      baseVersionId: v1.id,
    });

    // ── Commit v2 from a different draft, moving the active pointer ───────
    const draftC = await createMyDraft(user.id, program.id, { label: "C" });
    await updateMyDraftStructure(user.id, draftC.id, await sampleStructure("C"));
    const v2 = await commitFromDraft(user.id, draftC.id);

    // Sanity: v2 is now active, so B (based on v1) is stale.
    expect(v2.versionNumber).toBe(2);

    // ── Attempt to commit B → StaleDraftError with the exact ids ──────────
    let caught: unknown;
    try {
      await commitFromDraft(user.id, draftB.id);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(StaleDraftError);
    const stale = caught as StaleDraftError;
    expect(stale.draftId).toBe(draftB.id);
    expect(stale.baseVersionId).toBe(v1.id);
    expect(stale.currentVersionId).toBe(v2.id);
  });

  it("does not apply the stale check to a from-scratch draft (baseVersionId null)", async () => {
    const user = await makeTestUser("Null Base Test");
    const program = await createMyProgram(user.id, "Null Base");

    // Commit v1 so the Program has an active version.
    const draftA = await createMyDraft(user.id, program.id, { label: "A" });
    await updateMyDraftStructure(user.id, draftA.id, await sampleStructure("A"));
    const v1 = await commitFromDraft(user.id, draftA.id);
    expect(v1.versionNumber).toBe(1);

    // A fresh from-scratch draft has baseVersionId null. Even though a
    // version is active, the check must not fire — there is nothing for
    // this draft to be stale against.
    const draftB = await createMyDraft(user.id, program.id, { label: "B" });
    await updateMyDraftStructure(user.id, draftB.id, await sampleStructure("B"));

    const v2 = await commitFromDraft(user.id, draftB.id);
    expect(v2.versionNumber).toBe(2);
  });
});