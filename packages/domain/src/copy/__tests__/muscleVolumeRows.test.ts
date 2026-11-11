import { describe, expect, it } from "vitest";
import type { AssessedAxis } from "../../assessment/types";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";
import { allMuscleVolumeCopy, MUSCLE_DISPLAY_ORDER, MUSCLE_VOLUME_COPY, muscleVolumeView } from "../muscleVolumeRows";

const volume = (muscle: string, sets: number, band: string): AssessedAxis =>
  ({ axisType: "VOLUME", scopeKey: muscle, metricValue: sets, status: { kind: "BAND", band }, severity: "NONE", weight: "HIGH", leverage: "NONE" }) as AssessedAxis;

describe("muscleVolumeView (ARCH-070)", () => {
  const axes = [
    volume("calves", 0, "Low"),
    volume("triceps", 3.5, "Low"),
    volume("chest", 13, "Adequate"),
    volume("upper back", 6, "Adequate"),
    volume("quads", 21, "High"),
    { axisType: "FREQUENCY", scopeKey: "chest", metricValue: 1, status: { kind: "BAND", band: "Adequate" } } as AssessedAxis,
    { axisType: "PROGRAM_STRUCTURE", scopeKey: "total-volume", metricValue: 30, status: { kind: "BAND", band: "Under-dosed" } } as AssessedAxis,
  ];
  const view = muscleVolumeView(axes, HYPERTROPHY_CONFIG)!;

  it("lists every VOLUME axis, and only those, top of the body to the bottom", () => {
    expect(view.rows.map((r) => r.muscle)).toEqual(["chest", "upper back", "triceps", "quads", "calves"]);
    expect(view.total).toBe(5);
  });

  it("keeps the engine's number and band as they are: nothing is recounted or regraded", () => {
    expect(view.rows.find((r) => r.muscle === "triceps")).toMatchObject({ sets: 3.5, band: "Low", label: "Triceps" });
    expect(view.rows.find((r) => r.muscle === "quads")).toMatchObject({ sets: 21, band: "High" });
    expect(view.rows.find((r) => r.muscle === "calves")).toMatchObject({ sets: 0, band: "Low" });
  });

  it("a muscle that is fine at 6 to 9 sets is listed (the strengths rule hides it at under 10)", () => {
    expect(view.rows.find((r) => r.muscle === "upper back")).toMatchObject({ sets: 6, band: "Adequate" });
  });

  it("reads the Adequate range from the profile, and counts the muscles in it", () => {
    expect([view.lowerBound, view.upperBound]).toEqual([6, 20]);
    expect(view.inRange).toBe(2);
    expect(MUSCLE_VOLUME_COPY.summary(view.inRange, view.total, view.lowerBound, view.upperBound)).toBe(
      "2 of 5 muscles are in the 6–20 range.",
    );
  });

  it("puts a muscle the order does not know after the known ones, alphabetically", () => {
    const v = muscleVolumeView([volume("zeta", 4, "Low"), volume("alpha", 4, "Low"), volume("chest", 8, "Adequate")], HYPERTROPHY_CONFIG)!;
    expect(v.rows.map((r) => r.muscle)).toEqual(["chest", "alpha", "zeta"]);
  });

  it("is null with no VOLUME axis, or a profile with no Adequate band", () => {
    expect(muscleVolumeView([], HYPERTROPHY_CONFIG)).toBeNull();
    expect(muscleVolumeView(axes, { ...HYPERTROPHY_CONFIG, statusBands: { ...HYPERTROPHY_CONFIG.statusBands, VOLUME: [] } })).toBeNull();
  });

  it("the display order covers the shipped profile's muscles", () => {
    const regions = (HYPERTROPHY_CONFIG.regions ?? []).flatMap((r) => r.muscles);
    for (const m of regions) expect(MUSCLE_DISPLAY_ORDER, m).toContain(m);
  });

  it("the copy passes the forbidden-copy lint", () => {
    assertCleanCopy(allMuscleVolumeCopy());
  });
});
