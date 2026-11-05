// packages/api/src/routers/check.test.ts
//
// The public Program Checker procedures against the real database: gated by
// CHECK_PUBLIC, rejecting bad hashes, reading a preset exactly as the Builder's
// previewAnalyze reads the same structure, and saving for a signed-in user only.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTrackedUsers, listExercises, makeTestUser, type UserRecord } from "@training/db";
import { CHECK_PRESETS, encodeCompactProgram, toProgramStructure } from "@training/domain";
import { appRouter } from "../router";
import { programStructureSchema } from "../schemas/programStructure";
import { createMyProgram } from "../services/programService";
import { createMyDraft, updateMyDraftStructure } from "../services/draftService";

const ppl = CHECK_PRESETS.find((p) => p.slug === "ppl-6")!;
const pplHash = encodeCompactProgram(ppl.program);
const anonymous = () => appRouter.createCaller({ user: null });

describe("check router", () => {
  const original = process.env.CHECK_PUBLIC;
  let user: UserRecord;

  beforeEach(async () => {
    process.env.CHECK_PUBLIC = "true";
    user = await makeTestUser("check router");
  });
  afterEach(async () => {
    if (original === undefined) delete process.env.CHECK_PUBLIC;
    else process.env.CHECK_PUBLIC = original;
    await cleanupTrackedUsers();
  });

  it("refuses every procedure when CHECK_PUBLIC is not 'true'", async () => {
    delete process.env.CHECK_PUBLIC;
    await expect(anonymous().check.exercises()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(anonymous().check.analyze({ hash: pplHash })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const signedIn = appRouter.createCaller({ user: { id: user.id, email: user.email } });
    await expect(signedIn.check.save({ hash: pplHash })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists the exercise library for an anonymous caller", async () => {
    const exercises = await anonymous().check.exercises();
    expect(exercises).toHaveLength(110);
    expect(exercises[0]).toMatchObject({ id: expect.any(String), name: expect.any(String), movementPattern: expect.any(String) });
  });

  it("rejects a malformed hash and an unknown exercise", async () => {
    await expect(anonymous().check.analyze({ hash: "not-a-program" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const unknown = encodeCompactProgram({ days: [{ name: "A", rows: [["Mystery Lift", 3, 8, 10]] }] });
    await expect(anonymous().check.analyze({ hash: unknown })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Unknown exercise: Mystery Lift",
    });
  });

  it("reads PPL 6-day exactly as the Builder's previewAnalyze reads the same structure", async () => {
    const checked = await anonymous().check.analyze({ hash: pplHash });
    expect(checked.summary).toEqual({ days: 6, exercises: 30 });

    const ids = new Map((await listExercises()).map((e) => [e.name, e.id]));
    const built = toProgramStructure(ppl.program, ids);
    if (!built.ok) throw new Error("preset has an unknown exercise");
    const program = await createMyProgram(user.id, "Builder parity");
    const draft = await createMyDraft(user.id, program.id, { label: "v1" });
    await updateMyDraftStructure(user.id, draft.id, programStructureSchema.parse(built.structure));
    const builder = await appRouter.createCaller({ user: { id: user.id, email: user.email } }).analysis.previewAnalyze({
      draftId: draft.id,
    });

    const strip = (r: typeof checked.assessment) => ({
      kind: r.kind,
      findings: r.assessment.findings,
      actions: r.assessment.actions,
      strengths: r.assessment.strengths,
      attentionAreas: r.assessment.attentionAreas,
      biggestOpportunity: r.assessment.biggestOpportunity,
      ratios: r.assessment.ratios,
      highVolume: r.assessment.highVolume,
    });
    expect(strip(checked.assessment)).toEqual(strip(builder.assessment));
    expect(checked.fitScore).toEqual(builder.fitScore);
    expect(checked.namedActions).toEqual(builder.namedActions);
  });

  it("save needs a signed-in user and creates one program with one populated draft", async () => {
    await expect(anonymous().check.save({ hash: pplHash })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const caller = appRouter.createCaller({ user: { id: user.id, email: user.email } });
    const { programId, draftId } = await caller.check.save({ hash: pplHash });
    const drafts = await caller.draft.listForProgram({ programId });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.id).toBe(draftId);
    const structure = drafts[0]!.structure as { workoutDays: { name: string; prescriptions: unknown[] }[] };
    expect(structure.workoutDays.map((d) => d.name)).toEqual(["Push", "Pull", "Legs", "Push", "Pull", "Legs"]);
    expect(structure.workoutDays.every((d) => d.prescriptions.length === 5)).toBe(true);
  });
});
