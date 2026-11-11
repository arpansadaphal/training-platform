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
    expect(checked.summary).toEqual({ days: 6, exercises: 30, daysPerWeek: 6 });

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

  describe("daysPerWeek (ARCH-067)", () => {
    // The first three days of the preset, alone and listed twice: the same training week either way.
    const three = ppl.program.days.slice(0, 3);
    const threeHash = encodeCompactProgram({ days: three });
    const sixHash = encodeCompactProgram({ days: [...three, ...three] });
    const weekly = (r: Awaited<ReturnType<ReturnType<typeof anonymous>["check"]["analyze"]>>) =>
      r.assessment.assessment.allAssessedAxes
        .filter((a) => a.axisType === "VOLUME" || a.axisType === "FREQUENCY" || (a.axisType === "PROGRAM_STRUCTURE" && a.scopeKey === "total-volume"))
        .map((a) => [a.axisType, a.scopeKey, a.metricValue]);

    it("reads a 3-day routine run on 6 days as the same week as the 6 days listed", async () => {
      const told = await anonymous().check.analyze({ hash: threeHash, daysPerWeek: 6 });
      const listed = await anonymous().check.analyze({ hash: sixHash });
      expect(told.summary).toEqual({ days: 3, exercises: 15, daysPerWeek: 6 });
      expect(weekly(told)).toEqual(weekly(listed));
    });

    it("is the older read when the days equal the days listed, or are not given", async () => {
      const plain = await anonymous().check.analyze({ hash: threeHash });
      const equal = await anonymous().check.analyze({ hash: threeHash, daysPerWeek: 3 });
      expect(plain.summary.daysPerWeek).toBe(3);
      // computedAt is the engine's one wall-clock read; everything else must match.
      const pinned = (r: typeof plain) => JSON.parse(JSON.stringify(r, (k, v) => (k === "computedAt" ? undefined : v)));
      expect(pinned(equal)).toEqual(pinned(plain));
    });

    it("does not offer to run the days twice once the lifter has said how many days they train", async () => {
      const told = await anonymous().check.analyze({ hash: threeHash, daysPerWeek: 6 });
      expect(JSON.stringify(told.namedActions)).not.toMatch(/twice a week/);
    });

    it("rejects days outside 1-7", async () => {
      await expect(anonymous().check.analyze({ hash: threeHash, daysPerWeek: 8 })).rejects.toBeDefined();
      await expect(anonymous().check.analyze({ hash: threeHash, daysPerWeek: 0 })).rejects.toBeDefined();
    });
  });

  // ARCH-068. The once-a-week "Program observation": a note beside the assessment, never part of it.
  describe("the once-a-week observation (ARCH-068)", () => {
    const row = (name: string, sets = 3): [string, number, number, number] => [name, sets, 8, 10];
    const observe = async (days: Parameters<typeof encodeCompactProgram>[0]["days"], daysPerWeek?: number) =>
      (await anonymous().check.analyze({ hash: encodeCompactProgram({ days }), ...(daysPerWeek ? { daysPerWeek } : {}) })).observation;

    // The audit's bro split: no shoulders, no arms, no hamstrings, calves or side delts, each trained muscle once a week.
    const BRO = [
      { name: "Chest", rows: [row("Barbell Bench Press", 4), row("Incline Dumbbell Press")] },
      { name: "Back", rows: [row("Barbell Row", 4)] },
      { name: "Legs", rows: [row("Back Squat", 4)] },
    ];

    it("a bro split fires variant B: every muscle it trains is once a week, and the total is under the floor", async () => {
      const o = await observe(BRO);
      expect(o?.variant).toBe("UNDER_FLOOR");
      expect(o?.text).toBe(
        "Every muscle you train is trained once a week. Your total is 15 sets, under the general floor — for volume specifically, the fix is to add a second training day rather than cram more sets into your current days.",
      );
    });

    it("a once-a-week program with 18 sets of one muscle in one session fires variant A", async () => {
      const o = await observe([
        { name: "Chest day", rows: [row("Barbell Bench Press", 6), row("Incline Dumbbell Press", 6), row("Dumbbell Fly", 6)] },
        { name: "Back day", rows: [row("Barbell Row", 6), row("Lat Pulldown", 6), row("Seated Cable Row", 6)] },
        { name: "Leg day", rows: [row("Back Squat", 6), row("Leg Press", 6), row("Leg Curl", 6)] },
      ]);
      expect(o?.variant).toBe("CAP_EXCEEDED");
      expect(o?.text).toContain("Your chest gets 18 sets, all in one session");
    });

    it("a once-a-week program that reaches the floor fires variant C, informational", async () => {
      const ppl = CHECK_PRESETS.find((p) => p.slug === "ppl-6")!.program.days.slice(0, 3);
      const o = await observe(ppl);
      expect(o?.variant).toBe("IN_RANGE");
      expect(o?.text).toContain("this is informational");
    });

    it("a 6-day PPL, a balanced upper/lower and the other presets read null", async () => {
      for (const slug of ["ppl-6", "upper-lower-4", "full-body-3", "beginner-2", "home-dumbbells-3", "bro-split-5"]) {
        const preset = CHECK_PRESETS.find((p) => p.slug === slug)!;
        expect(await observe(preset.program.days), slug).toBeNull();
      }
    });

    it("a 3-day PPL run on 6 days (each muscle twice) reads null", async () => {
      const ppl = CHECK_PRESETS.find((p) => p.slug === "ppl-6")!.program.days.slice(0, 3);
      expect(await observe(ppl, 6)).toBeNull();
    });

    // ARCH-071. Hinge (hamstrings 0) and whole-program volume (15 of 40 sets) are both HIGH leverage; the whole-program one wins.
    it("the bro split's biggest opportunity is whole-program volume, and the hinge finding is still there", async () => {
      const r = await anonymous().check.analyze({ hash: encodeCompactProgram({ days: BRO }) });
      const a = r.assessment.assessment;
      expect(a.biggestOpportunity).toMatchObject({ axisType: "PROGRAM_STRUCTURE", scopeKey: "total-volume" });
      expect(a.findings?.[0]?.key).toBe("PROGRAM_STRUCTURE:total-volume");
      expect(a.findings?.map((f) => f.key)).toContain("pattern:hinge");
      // Same leverage, so this is the tie-break and not a re-grade.
      const hinge = a.findings!.find((f) => f.key === "pattern:hinge")!;
      expect(hinge.lead.leverage).toBe(a.findings![0]!.lead.leverage);
    });

    it("the whole-program action agrees with the note: it adds a day, not sets on the days listed", async () => {
      const r = await anonymous().check.analyze({ hash: encodeCompactProgram({ days: BRO }) });
      expect(r.observation?.text).toContain("add a second training day rather than cram more sets into your current days");
      const volume = r.namedActions.find((a) => a.rootCauseKey === "programStructure:add-volume")!;
      expect(volume.description).toMatch(/^Add a training day: 3 sets of /);
      expect(volume.description).toMatch(/That brings the week to \d+(\.\d+)? hard sets, a start toward the general floor of 40\./);
      expect(volume.description).toMatch(/A second day like it brings the week to \d+(\.\d+)?/);
      expect(volume.suggestions).toBeUndefined();
      expect(volume.newDay?.exercises.length).toBeGreaterThan(0);
    });

    it("a program with no note keeps the older action (sets on the days listed)", async () => {
      const ppl = CHECK_PRESETS.find((p) => p.slug === "ppl-6")!.program.days.slice(0, 3);
      const r = await anonymous().check.analyze({ hash: encodeCompactProgram({ days: ppl }) });
      expect(r.observation?.variant).toBe("IN_RANGE");
      expect(r.namedActions.some((a) => a.newDay !== undefined && a.rootCauseKey === "programStructure:add-volume")).toBe(false);
    });

    it("is not part of the assessment: the same program's findings, strengths and Fit never mention it", async () => {
      const r = await anonymous().check.analyze({ hash: encodeCompactProgram({ days: BRO }) });
      expect(r.observation).not.toBeNull();
      expect(JSON.stringify([r.assessment, r.fitScore, r.namedActions])).not.toMatch(/trained once a week/);
    });
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
