import { describe, expect, it } from "vitest";
import { matchExercise } from "../exerciseMatch";
import { LIBRARY_NAMES } from "./libraryNames";

const m = (q: string) => matchExercise(q, LIBRARY_NAMES);

describe("matchExercise", () => {
  it("matches the full name exactly, ignoring case, spacing and punctuation", () => {
    expect(m("barbell bench press")).toMatchObject({ status: "exact", best: "Barbell Bench Press" });
    expect(m("Pull Up")).toMatchObject({ status: "exact", best: "Pull-Up" });
    expect(m("pullups")).toMatchObject({ status: "exact", best: "Pull-Up" });
    expect(m("Farmers Carry")).toMatchObject({ status: "exact", best: "Farmer's Carry" });
    expect(m("Triceps Pushdown")).toMatchObject({ status: "exact", best: "Tricep Pushdown" });
  });

  it("expands common abbreviations", () => {
    expect(m("RDL")).toMatchObject({ status: "exact", best: "Romanian Deadlift" });
    expect(m("OHP")).toMatchObject({ status: "exact", best: "Overhead Press" });
    expect(m("DB Bench Press")).toMatchObject({ status: "exact", best: "Dumbbell Bench Press" });
    expect(m("BB Row")).toMatchObject({ status: "exact", best: "Barbell Row" });
  });

  it("accepts a text contained in exactly one name", () => {
    expect(m("Skull")).toMatchObject({ status: "unique", best: "Skull Crusher" });
    expect(m("Bulgarian")).toMatchObject({ status: "unique", best: "Bulgarian Split Squat" });
  });

  it("returns ranked candidates when several names contain the text", () => {
    const r = m("Bench");
    expect(r.status).toBe("ambiguous");
    expect(r.best).toBe("Barbell Bench Press");
    expect(r.candidates.length).toBeGreaterThan(1);
    expect(r.candidates.length).toBeLessThanOrEqual(5);
    expect(m("Squat").best).toBe("Back Squat");
  });

  it("falls back to close spellings and asks for a yes", () => {
    expect(m("Barbel Bench Pres")).toMatchObject({ status: "suggested", best: "Barbell Bench Press" });
    expect(m("Romainian Deadlift")).toMatchObject({ status: "suggested", best: "Romanian Deadlift" });
  });

  it("reports none when nothing is close", () => {
    expect(m("Zzzzz Qqqq")).toEqual({ status: "none", best: null, candidates: [] });
    expect(m("   ")).toEqual({ status: "none", best: null, candidates: [] });
  });
});
