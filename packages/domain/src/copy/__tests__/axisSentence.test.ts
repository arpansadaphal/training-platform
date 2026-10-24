import { describe, expect, it } from "vitest";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";
import { axisSentence } from "../axisSentence";

const vol = HYPERTROPHY_CONFIG.statusBands.VOLUME;
const freq = HYPERTROPHY_CONFIG.statusBands.FREQUENCY;
const axis = (axisType: string, scopeKey: string | null, metricValue: number, band: string) => ({
  axisType,
  scopeKey,
  metricValue,
  status: { band },
});

describe("axisSentence: volume", () => {
  const lo = vol.find((b) => b.status === "Adequate")!.lowerBound!;
  const hi = vol.find((b) => b.status === "Adequate")!.upperBound!;

  it("leads a low finding with the gap in whole sets", () => {
    const s = axisSentence(axis("VOLUME", "back", lo - 6, "Low"), vol)!;
    expect(s).toBe(
      `Back volume is low: ${lo - 6} hard sets per week is under the ${lo}–${hi} range the evidence supports. Consider adding 6 more sets per week.`,
    );
  });

  it("rounds the gap up and speaks of one set in the singular", () => {
    expect(axisSentence(axis("VOLUME", "calves", lo - 0.4, "Low"), vol)).toContain("Consider adding 1 more set per week.");
    expect(axisSentence(axis("VOLUME", "calves", 1, "Low"), vol)).toContain("1 hard set per week");
    expect(axisSentence(axis("VOLUME", "calves", 0, "Low"), vol)).toContain("0 hard sets per week");
  });

  it("says in-range, high and excessive plainly, without blame", () => {
    expect(axisSentence(axis("VOLUME", "chest", 14, "Adequate"), vol)).toBe(
      `Chest volume is in range: 14 hard sets per week sits within the ${lo}–${hi} the evidence supports.`,
    );
    expect(axisSentence(axis("VOLUME", "chest", hi + 2, "High"), vol)).toContain("information, not a problem");
    expect(axisSentence(axis("VOLUME", "chest", 40, "Excessive"), vol)).toContain("not a harm threshold");
  });

  it("is silent when the axis is not assessed or has no numeric value", () => {
    expect(axisSentence(axis("VOLUME", "chest", 14, "N/A"), vol)).toBeNull();
    expect(axisSentence({ ...axis("VOLUME", "chest", 0, "Low"), metricValue: "n/a" }, vol)).toBeNull();
  });
});

describe("axisSentence: frequency", () => {
  it("covers each band", () => {
    expect(axisSentence(axis("FREQUENCY", "chest", 0, "Low"), freq)).toContain("no session with 2 or more hard sets");
    expect(axisSentence(axis("FREQUENCY", "chest", 0.5, "Low"), freq)).toContain("fewer sessions than that volume needs");
    expect(axisSentence(axis("FREQUENCY", "rear delts", 1, "Adequate"), freq)).toBe(
      "Rear delts frequency is in range: its weekly sets are spread over enough sessions.",
    );
    expect(axisSentence(axis("FREQUENCY", "chest", 2, "High"), freq)).toContain("more sessions than its volume needs");
  });
});

describe("axisSentence: other axes keep their presentation", () => {
  it("returns null", () => {
    for (const t of ["EXERCISE_SELECTION_BALANCE", "PROGRESSION_SOUNDNESS", "RECOVERY_COST"]) {
      expect(axisSentence(axis(t, null, 3, "Low"), [])).toBeNull();
    }
  });
});

describe("axisSentence copy", () => {
  it("passes the forbidden-phrase lint for every band, muscle and value", () => {
    const lines: string[] = [];
    for (const band of ["Low", "Adequate", "High", "Excessive"]) {
      for (const muscle of ["chest", "back", "rear delts", "quads"]) {
        for (const v of [0, 1, 3.5, 8, 14, 22, 40]) {
          const s = axisSentence(axis("VOLUME", muscle, v, band), vol);
          if (s) lines.push(s);
        }
      }
    }
    for (const band of ["Low", "Adequate", "High"]) {
      for (const v of [0, 0.5, 1, 2]) {
        const s = axisSentence(axis("FREQUENCY", "glutes", v, band), freq);
        if (s) lines.push(s);
      }
    }
    expect(lines.length).toBeGreaterThan(50);
    assertCleanCopy(lines);
  });
});
