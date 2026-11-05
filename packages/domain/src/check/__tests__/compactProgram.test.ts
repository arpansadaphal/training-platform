import { describe, expect, it } from "vitest";
import { CHECK_LIMITS, decodeCompactProgram, encodeCompactProgram } from "../compactProgram";
import { toProgramStructure } from "../toStructure";
import { CHECK_PRESETS } from "../presets";
import type { CompactProgram } from "../types";

const sample: CompactProgram = {
  days: [
    { name: "Push", rows: [["Barbell Bench Press", 3, 8, 10], ["Farmer's Carry", 2, 1, 1]] },
    { name: "Légs ✓", rows: [["Back Squat", 4, 6, 8]] },
  ],
};

const b64 = (value: unknown) => encodeCompactProgram({ days: [] }) && Buffer.from(JSON.stringify(value)).toString("base64url");

describe("compact program hash", () => {
  it("round-trips, including non-ASCII day names", () => {
    expect(decodeCompactProgram(encodeCompactProgram(sample))).toEqual(sample);
  });

  it("round-trips every preset and stays well under the length cap", () => {
    for (const preset of CHECK_PRESETS) {
      const hash = encodeCompactProgram(preset.program);
      expect(decodeCompactProgram(hash)).toEqual(preset.program);
      expect(hash.length).toBeLessThan(CHECK_LIMITS.maxHashLength);
    }
  });

  it("rejects garbage, empty and oversized input", () => {
    expect(decodeCompactProgram("")).toBeNull();
    expect(decodeCompactProgram("!!!not base64!!!")).toBeNull();
    expect(decodeCompactProgram(b64("hello"))).toBeNull();
    expect(decodeCompactProgram("A".repeat(CHECK_LIMITS.maxHashLength + 1))).toBeNull();
  });

  it("rejects shapes the checker would never build", () => {
    expect(decodeCompactProgram(b64([]))).toBeNull();
    expect(decodeCompactProgram(b64([["Push", []]]))).toBeNull();
    expect(decodeCompactProgram(b64([["Push", [["Back Squat", 0, 8, 10]]]]))).toBeNull();
    expect(decodeCompactProgram(b64([["Push", [["Back Squat", 3, 12, 8]]]]))).toBeNull();
    expect(decodeCompactProgram(b64([["Push", [["Back Squat", 3.5, 8, 10]]]]))).toBeNull();
    expect(decodeCompactProgram(b64([["Push", [["Back Squat", 3, 8]]]]))).toBeNull();
    const tooManyDays = Array.from({ length: CHECK_LIMITS.maxDays + 1 }, () => ["D", [["Back Squat", 3, 8, 10]]]);
    expect(decodeCompactProgram(b64(tooManyDays))).toBeNull();
    const tooManyRows = [["D", Array.from({ length: CHECK_LIMITS.maxRowsPerDay + 1 }, () => ["Back Squat", 3, 8, 10])]];
    expect(decodeCompactProgram(b64(tooManyRows))).toBeNull();
  });
});

describe("toProgramStructure", () => {
  const ids = new Map([
    ["Barbell Bench Press", "id-bench"],
    ["Back Squat", "id-squat"],
  ]);

  it("applies the documented defaults: RPE 8 and a bodyweight load", () => {
    const r = toProgramStructure({ days: [{ name: "A", rows: [["barbell bench press", 3, 8, 10]] }] }, ids);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.structure.workoutDays[0]!.prescriptions[0]).toMatchObject({
      exerciseId: "id-bench",
      targetSets: 3,
      targetRepsLow: 8,
      targetRepsHigh: 10,
      targetRpe: 8,
      loadScheme: { type: "BODYWEIGHT" },
    });
  });

  it("reports unknown names instead of guessing", () => {
    const r = toProgramStructure({ days: [{ name: "A", rows: [["Mystery Lift", 3, 8, 10]] }] }, ids);
    expect(r).toEqual({ ok: false, unknownExercises: ["Mystery Lift"] });
  });
});
