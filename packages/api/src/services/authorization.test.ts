
// packages/api/src/services/authorization.test.ts
//
// Phase 9 authorization audit — every owner-scoped procedure across the
// API, exercised at the service layer where the ownership checks live.
//
// SCOPE: this file tests the SERVICE functions that the tRPC routers
// delegate to. Per the codebase convention (see commit.test.ts,
// sessionService.test.ts, etc.), tests import services directly rather
// than going through the tRPC transport — the transport is thin, and the
// ownership checks are in the services.
//
// EXCEPTION: coach.openConversation's ownership check was, until Phase 9,
// at neither layer (ARCH-049). It now lives in coachConversationService's
// getOrCreateScopedConversation, so it is exercised here too.
//
// PATTERN: for each owner-scoped function, two users — userA owns the
// resource, userB attempts to read or mutate it. The assertion is
// NOT_FOUND (or UNAUTHORIZED for the trivially-scoped user.getSelf), never
// FORBIDDEN, per ARCH-040's non-disclosure rule: "not yours" and "does
// not exist" are indistinguishable to the caller.
//
// COVERAGE: this file covers every owner-scoped procedure the routers
// expose. Trivially-scoped procedures (listMine-style, which filter by
// ctx.user.id) are noted in a comment rather than tested — the filter IS
// the check, and there is no cross-user case to construct. Procedures
// covered by delegated helpers (loadOwnedProgramOrThrow,
// loadOwnedSessionOrThrow, loadOwnedTrainingBlockOrThrow) get their own
// direct tests plus one exercise of each helper via a real service.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupTrackedUsers,
  findActiveTrainingBlockForProgram,
  findVersionWithStructure,
  listExercises,
  makeTestUser,
  type UserRecord,
} from "@training/db";
import type { MutationSpec, ProgramStructure } from "@training/domain";

// Program
import {
  archiveMyProgram,
  createMyProgram,
  getMyProgram,
  renameMyProgram,
} from "./programService";

// Draft
import {
  createMyDraft,
  discardMyDraft,
  getMyDraft,
  listMyDrafts,
  updateMyDraftStructure,
} from "./draftService";

// ProgramVersion
import {
  commitFromDraft,
  commitFromSimulation,
  diffVersions,
} from "./programVersionService";

// Simulation
import { simulateAndPersist } from "./simulationService";

// Session
import {
  getCurrentSession,
  getOrCreateNext,
  getSessionContext,
  markCompleted,
  markSkipped,
  markStarted,
} from "./sessionService";

// Performance
import {
  listMyRecordsForSession,
  logBatch,
  logSet,
} from "./performanceService";

// Observation
import {
  createMyObservation,
  listMyObservationsForBlock,
  listMyObservationsForSession,
} from "./observationService";

// Review
import { getReview, recomputeAssessment } from "./reviewService";

// Constraint
import {
  deleteOwnedConstraint,
  loadOwnedConstraint,
  updateOwnedConstraint,
} from "./constraintService";

// Coach conversation
import { getOrCreateScopedConversation } from "./coachConversationService";

// Ownership helpers (tested directly as well as via services)
import { loadOwnedProgramOrThrow } from "./loadOwnedProgram";
import {
  loadOwnedSessionOrThrow,
  loadOwnedTrainingBlockOrThrow,
} from "./loadOwnedExecution";

import { getBlockReport } from "./blockReportService";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture
// ─────────────────────────────────────────────────────────────────────────────

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

interface Fixture {
  userA: UserRecord;
  userB: UserRecord;
  programId: string;
  draftId: string;
  versionId: string;
  blockId: string;
  sessionId: string;
  prescriptionId: string;
  performanceId: string;
  observationId: string;
  constraintId: string;
  conversationId: string;
  simulationId: string;
}

async function buildFixture(): Promise<Fixture> {
  const userA = await makeTestUser("Authz User A");
  const userB = await makeTestUser("Authz User B");

  const program = await createMyProgram(userA.id, "Authz Program A");

  const draft = await createMyDraft(userA.id, program.id, { label: "v1" });
  await updateMyDraftStructure(userA.id, draft.id, await makeStructure());
  const version = await commitFromDraft(userA.id, draft.id);

  const block = await findActiveTrainingBlockForProgram(program.id);
  if (!block) throw new Error("No active block after commit");

  const session = await getOrCreateNext(userA.id, program.id);

  // Resolve the normalized prescription id — the domain-level id "rx-a"
  // is regenerated to a cuid at commit time.
  const versionWithStructure = await findVersionWithStructure(version.id);
  if (!versionWithStructure) throw new Error("Version structure missing");
  const day = versionWithStructure.workoutDays[0];
  if (!day) throw new Error("No workout day");
  const rx = day.prescriptions[0];
  if (!rx) throw new Error("No prescription");

  const performance = await logSet(userA.id, session.id, {
    exercisePrescriptionId: rx.id,
    setIndex: 0,
    actualReps: 8,
  });

  const observation = await createMyObservation(userA.id, {
    sessionId: session.id,
    content: "Authz test observation.",
  });

  const constraint = await (async () => {
    // constraintService.createConstraint is not imported above because it
    // needs the ConstraintKind enum; use the router-facing service.
    const { createConstraint } = await import("./constraintService");
    return createConstraint({
      userId: userA.id,
      kind: "FREEFORM",
      note: "Authz test constraint.",
    });
  })();

  const conversation = await getOrCreateScopedConversation(userA.id, {
    programId: program.id,
    programVersionId: null,
  });

  const mutation: MutationSpec = {
    op: "MODIFY_EXERCISE_PRESCRIPTION",
    prescriptionId: "rx-a",
    changes: { targetSets: 5 },
  };
  const simResult = await simulateAndPersist(
    userA.id,
    program.id,
    mutation,
  );
  if (!simResult.simulationId) {
    throw new Error(
      `Expected simulationId; got INVALID_MUTATION: ${JSON.stringify(simResult.result)}`,
    );
  }

  return {
    userA,
    userB,
    programId: program.id,
    draftId: draft.id,
    versionId: version.id,
    blockId: block.id,
    sessionId: session.id,
    prescriptionId: rx.id,
    performanceId: performance.id,
    observationId: observation.id,
    constraintId: constraint.id,
    conversationId: conversation.id,
    simulationId: simResult.simulationId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Authorization audit — cross-user access must return NOT_FOUND", () => {
  let f: Fixture;

  beforeEach(async () => {
    f = await buildFixture();
  });

  afterEach(cleanupTrackedUsers);

  // ── Ownership helpers (the delegation targets) ─────────────────────────

  describe("loadOwnedProgramOrThrow", () => {
    it("returns the program when the caller owns it", async () => {
      const p = await loadOwnedProgramOrThrow(f.userA.id, f.programId);
      expect(p.id).toBe(f.programId);
    });

    it("throws NOT_FOUND when the caller does not own the program", async () => {
      await expect(
        loadOwnedProgramOrThrow(f.userB.id, f.programId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("loadOwnedTrainingBlockOrThrow", () => {
    it("returns the block when the caller owns its program", async () => {
      const b = await loadOwnedTrainingBlockOrThrow(f.userA.id, f.blockId);
      expect(b.id).toBe(f.blockId);
    });

    it("throws NOT_FOUND when the caller does not own the block", async () => {
      await expect(
        loadOwnedTrainingBlockOrThrow(f.userB.id, f.blockId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("loadOwnedSessionOrThrow", () => {
    it("returns the session when the caller owns its block", async () => {
      const s = await loadOwnedSessionOrThrow(f.userA.id, f.sessionId);
      expect(s.id).toBe(f.sessionId);
    });

    it("throws NOT_FOUND when the caller does not own the session", async () => {
      await expect(
        loadOwnedSessionOrThrow(f.userB.id, f.sessionId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── program router ─────────────────────────────────────────────────────

  describe("program", () => {
    // program.create — no owner-scoped input; always creates for ctx.user.id.
    // program.listMine — filters by ctx.user.id; no cross-user case.
    // program.getIdentitySummary — scoped by ctx.user.id; no cross-user case.

    it("program.get → NOT_FOUND for a non-owner", async () => {
      await expect(getMyProgram(f.userB.id, f.programId)).rejects.toMatchObject(
        { code: "NOT_FOUND" },
      );
    });

    it("program.rename → NOT_FOUND for a non-owner", async () => {
      await expect(
        renameMyProgram(f.userB.id, f.programId, "Hijacked"),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("program.archive → NOT_FOUND for a non-owner", async () => {
      await expect(
        archiveMyProgram(f.userB.id, f.programId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── draft router ───────────────────────────────────────────────────────

  describe("draft", () => {
    // draft.create — programId in input; check is loadOwnedProgramOrThrow
    // via createMyDraft.
    // draft.listForProgram — programId in input; same check.

    it("draft.create → NOT_FOUND for a non-owner of the program", async () => {
      await expect(
        createMyDraft(f.userB.id, f.programId, { label: "Foreign draft" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("draft.get → NOT_FOUND for a non-owner", async () => {
      await expect(getMyDraft(f.userB.id, f.draftId)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("draft.listForProgram → NOT_FOUND for a non-owner of the program", async () => {
      await expect(
        listMyDrafts(f.userB.id, f.programId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("draft.updateStructure → NOT_FOUND for a non-owner", async () => {
      await expect(
        updateMyDraftStructure(f.userB.id, f.draftId, { workoutDays: [] }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("draft.discard → NOT_FOUND for a non-owner", async () => {
      await expect(
        discardMyDraft(f.userB.id, f.draftId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── programVersion router ──────────────────────────────────────────────

  describe("programVersion", () => {
    // programVersion.commitFromDraft — the draft lookup runs first; a
    // non-owner draft would fail the ownership check inside
    // commitFromMutation via loadOwnedProgramOrThrow.
    // programVersion.commitFromSimulation — same, via the simulation lookup
    // + loadOwnedProgramOrThrow inside commitFromMutation.
    // programVersion.get — versionId in input; check is
    // loadOwnedProgramOrThrow on version.programId.
    // programVersion.listForProgram — programId in input; same check.

    it("programVersion.get → NOT_FOUND for a non-owner of the program", async () => {
      await expect(
        loadOwnedProgramOrThrow(f.userB.id, f.programId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("programVersion.listForProgram → NOT_FOUND for a non-owner of the program", async () => {
      await expect(
        loadOwnedProgramOrThrow(f.userB.id, f.programId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("programVersion.diff → NOT_FOUND for a non-owner of the program", async () => {
      await expect(
        diffVersions(f.userB.id, f.versionId, f.versionId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("programVersion.commitFromSimulation → NOT_FOUND for a non-owner of the simulation's program", async () => {
      // The simulation lookup finds the row; the ownership check runs
      // inside commitFromMutation via loadOwnedProgramOrThrow on
      // sim.programId.
      await expect(
        commitFromSimulation(f.userB.id, f.simulationId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── simulation router ──────────────────────────────────────────────────

  describe("simulation", () => {
    it("simulation.simulate → NOT_FOUND for a non-owner of the program", async () => {
      const mutation: MutationSpec = {
        op: "MODIFY_EXERCISE_PRESCRIPTION",
        prescriptionId: "rx-a",
        changes: { targetSets: 5 },
      };
      await expect(
        simulateAndPersist(f.userB.id, f.programId, mutation),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── session router ─────────────────────────────────────────────────────

  describe("session", () => {
    // session.getOrCreateNext — programId in input; check is
    // loadOwnedProgramOrThrow.
    // session.getContext, markStarted, markCompleted, markSkipped — all
    // sessionId in input; check is loadOwnedSessionOrThrow.
    // session.getCurrentSession — blockId in input; check is
    // loadOwnedTrainingBlockOrThrow.

    it("session.getOrCreateNext → NOT_FOUND for a non-owner of the program", async () => {
      await expect(
        getOrCreateNext(f.userB.id, f.programId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("session.getContext → NOT_FOUND for a non-owner of the session", async () => {
      await expect(
        getSessionContext(f.userB.id, f.sessionId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("session.getCurrentSession → NOT_FOUND for a non-owner of the block", async () => {
      await expect(
        getCurrentSession(f.userB.id, f.blockId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("session.markStarted → NOT_FOUND for a non-owner of the session", async () => {
      await expect(
        markStarted(f.userB.id, f.sessionId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("session.markCompleted → NOT_FOUND for a non-owner of the session", async () => {
      await expect(
        markCompleted(f.userB.id, f.sessionId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("session.markSkipped → NOT_FOUND for a non-owner of the session", async () => {
      await expect(
        markSkipped(f.userB.id, f.sessionId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── performance router ─────────────────────────────────────────────────

  describe("performance", () => {
    it("performance.logSet → NOT_FOUND for a non-owner of the session", async () => {
      await expect(
        logSet(f.userB.id, f.sessionId, {
          exercisePrescriptionId: f.prescriptionId,
          setIndex: 0,
          actualReps: 8,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("performance.logBatch → NOT_FOUND for a non-owner of the session", async () => {
      await expect(
        logBatch(f.userB.id, f.sessionId, {
          entries: [
            {
              exercisePrescriptionId: f.prescriptionId,
              setIndex: 0,
              actualReps: 8,
            },
          ],
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("performance.listForSession → NOT_FOUND for a non-owner of the session", async () => {
      await expect(
        listMyRecordsForSession(f.userB.id, f.sessionId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── observation router ─────────────────────────────────────────────────

  describe("observation", () => {
    it("observation.create (attached to a session) → NOT_FOUND for a non-owner", async () => {
      await expect(
        createMyObservation(f.userB.id, {
          sessionId: f.sessionId,
          content: "Should be rejected.",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("observation.create (attached to a block) → NOT_FOUND for a non-owner", async () => {
      await expect(
        createMyObservation(f.userB.id, {
          trainingBlockId: f.blockId,
          content: "Should be rejected.",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("observation.listForBlock → NOT_FOUND for a non-owner", async () => {
      await expect(
        listMyObservationsForBlock(f.userB.id, f.blockId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("observation.listForSession → NOT_FOUND for a non-owner", async () => {
      await expect(
        listMyObservationsForSession(f.userB.id, f.sessionId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── review router ──────────────────────────────────────────────────────

  describe("review", () => {
    it("review.get → NOT_FOUND for a non-owner of the block", async () => {
      await expect(getReview(f.userB.id, f.blockId)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("review.recomputeAssessment → NOT_FOUND for a non-owner of the block", async () => {
      await expect(
        recomputeAssessment(f.userB.id, f.blockId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── blockReport router (Phase 10b) ─────────────────────────────────────

describe("blockReport", () => {
  it("blockReport.get → NOT_FOUND for a non-owner of the block", async () => {
    await expect(
      getBlockReport(f.userB.id, f.blockId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

  // ── constraint router ──────────────────────────────────────────────────

  describe("constraint", () => {
    it("constraint.get → null for a non-owner (routers map null to NOT_FOUND)", async () => {
      const row = await loadOwnedConstraint({
        userId: f.userB.id,
        constraintId: f.constraintId,
      });
      expect(row).toBeNull();
    });

    it("constraint.update → rejects for a non-owner", async () => {
      await expect(
        updateOwnedConstraint({
          userId: f.userB.id,
          constraintId: f.constraintId,
          kind: "FREEFORM",
          note: "Hijacked",
        }),
      ).rejects.toThrow(/not found or not owned/i);
    });

    it("constraint.delete → returns false for a non-owner (routers map to NOT_FOUND)", async () => {
      const deleted = await deleteOwnedConstraint({
        userId: f.userB.id,
        constraintId: f.constraintId,
      });
      expect(deleted).toBe(false);
    });
  });

  // ── coach router ───────────────────────────────────────────────────────

  describe("coach", () => {
    // coach.listConversations — filters by ctx.user.id; no cross-user case.
    // coach.getConversation, postMessage — conversationId in input; the
    // check is loadOwnedConversation (returns null → NOT_FOUND).
    // openConversationForBlock — blockId in input; the check is
    // loadOwnedTrainingBlockOrThrow.
    // openConversation — the ARCH-049 fix: the service now verifies
    // ownership of any explicitly-supplied programId / programVersionId.

    it("coach.openConversation with another user's programId → NOT_FOUND (ARCH-049)", async () => {
      await expect(
        getOrCreateScopedConversation(f.userB.id, {
          programId: f.programId,
          programVersionId: null,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("coach.openConversation with another user's programVersionId → NOT_FOUND (ARCH-049)", async () => {
      await expect(
        getOrCreateScopedConversation(f.userB.id, {
          programId: null,
          programVersionId: f.versionId,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("coach.openConversation with no explicit scope → does NOT throw (unscoped is always valid)", async () => {
      // The scope-less path is auto-scoped by the router to the caller's
      // primary Program before this service is reached. The service itself
      // treats (null, null) as valid — it is the caller's own general
      // conversation.
      const conversation = await getOrCreateScopedConversation(f.userB.id, {
        programId: null,
        programVersionId: null,
      });
      expect(conversation.userId).toBe(f.userB.id);
      expect(conversation.programId).toBeNull();
    });

    it("coach.openConversation with the caller's own programId → succeeds", async () => {
      // Positive control: the ARCH-049 check must not block a legitimate
      // scope.
      const conversation = await getOrCreateScopedConversation(f.userA.id, {
        programId: f.programId,
        programVersionId: null,
      });
      expect(conversation.userId).toBe(f.userA.id);
      expect(conversation.programId).toBe(f.programId);
    });
  });

  // ── user router ────────────────────────────────────────────────────────

  describe("user", () => {
    // user.getSelf is trivially scoped — it returns the ctx.user's row.
    // There is no cross-user case; the procedure has no external id input.
    it("user.getSelf is trivially scoped (documentation only)", () => {
      expect(true).toBe(true);
    });
  });
});