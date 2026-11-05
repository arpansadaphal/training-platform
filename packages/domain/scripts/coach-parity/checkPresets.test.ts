// The six /check presets are copies of harness programs (src/check/presets.ts). This keeps them from drifting,
// and shows the Checker's own structure (RPE 8, bodyweight load) reads the same as the harness's (RPE_BASED 8).
import { describe, expect, it } from "vitest";
import { computeAnalysis } from "../../src/analysis/computeAnalysis";
import { computeAssessment } from "../../src/assessment/computeAssessment";
import { provisionalFitBand } from "../../src/assessment/provisionalFit";
import { withoutRestDays } from "../../src/structure/restDay";
import { HYPERTROPHY_CONFIG } from "../../src/goal-profiles/hypertrophy";
import { CHECK_PRESETS } from "../../src/check/presets";
import { toProgramStructure } from "../../src/check/toStructure";
import { REF, build } from "./lib";
import { PROGRAMS_BY_ID } from "./programs";

const run = (structure: Parameters<typeof computeAnalysis>[0]) => {
  const result = computeAssessment(
    computeAnalysis(withoutRestDays(structure), REF, HYPERTROPHY_CONFIG, { now: () => new Date("2026-01-01T00:00:00Z") }),
    HYPERTROPHY_CONFIG,
    { goalId: "g" },
  );
  return { fit: provisionalFitBand(result), findings: result.assessment.findings, actions: result.assessment.actions };
};

describe("/check presets", () => {
  it("offers the six splits from the brief", () => {
    expect(CHECK_PRESETS.map((p) => p.harnessId)).toEqual(["S3", "S2", "PPLx6", "S4", "S7", "S8"]);
  });

  for (const preset of CHECK_PRESETS) {
    describe(preset.title, () => {
      const harness = PROGRAMS_BY_ID.get(preset.harnessId)!.program;

      it("copies the harness rows exactly", () => {
        expect(preset.program.days.map((d) => ({ name: d.name, rows: d.rows }))).toEqual(
          harness.days.map((d) => ({ name: d.name, rows: d.rows.map((r) => [r[0], r[1], r[2], r[3]]) })),
        );
      });

      it("reads the same through the Checker's structure as through the harness's", () => {
        const ids = new Map(REF.exercises.map((e) => [e.name, e.id]));
        const built = toProgramStructure(preset.program, ids);
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(run(built.structure)).toEqual(run(build(harness)));
      });
    });
  }
});
