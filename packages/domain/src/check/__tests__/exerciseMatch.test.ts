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
    const r = m("Press");
    expect(r.status).toBe("ambiguous");
    expect(r.candidates.length).toBeGreaterThan(1);
    expect(r.candidates.length).toBeLessThanOrEqual(5);
  });

  // ARCH-065 / Fix 5a. A bare lift that means one thing in practice is accepted without a question; the parsed list
  // still shows its full name. (Before, "Bench" and "Squat" were ambiguous and asked "Did you mean ...?".)
  it("accepts a bare Bench, Squat, Row or Deadlift as the standard barbell lift", () => {
    expect(m("Bench")).toMatchObject({ status: "unique", best: "Barbell Bench Press" });
    expect(m("bench press")).toMatchObject({ status: "unique", best: "Barbell Bench Press" });
    expect(m("Squat")).toMatchObject({ status: "unique", best: "Back Squat" });
    expect(m("Squats")).toMatchObject({ status: "unique", best: "Back Squat" });
    expect(m("Row")).toMatchObject({ status: "unique", best: "Barbell Row" });
    expect(m("Deadlift")).toMatchObject({ status: "unique", best: "Conventional Deadlift" });
    expect(m("DL")).toMatchObject({ status: "unique", best: "Conventional Deadlift" });
  });

  it("does not turn a more specific lift into the default", () => {
    expect(m("DB Bench")).toMatchObject({ status: "unique", best: "Dumbbell Bench Press" });
    expect(m("Seated Row").best).toBe("Seated Cable Row");
    expect(m("Front Squat")).toMatchObject({ status: "exact", best: "Front Squat" });
    expect(m("Sumo Deadlift")).toMatchObject({ status: "exact", best: "Sumo Deadlift" });
  });

  it("ranks the usual lifts first: Incline offers the presses before the curl", () => {
    const r = m("Incline");
    expect(r.status).toBe("ambiguous");
    expect(r.best).toBe("Incline Dumbbell Press");
    expect(r.candidates.slice(0, 2)).toEqual(["Incline Dumbbell Press", "Incline Barbell Bench Press"]);
    expect(r.candidates).toContain("Incline Curl");
    expect(r.candidates.indexOf("Incline Curl")).toBeGreaterThan(1);
  });

  it("still asks about a curl, with the dumbbell curl first", () => {
    const r = m("Curl");
    expect(r.status).toBe("ambiguous");
    expect(r.candidates.slice(0, 2)).toEqual(["Dumbbell Curl", "Barbell Curl"]);
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

describe("matchExercise: plurals in real pastes (ARCH-066)", () => {
  it.each([
    ["Pull-Ups", "Pull-Up"],
    ["Pull Ups", "Pull-Up"],
    ["Chin-Ups", "Chin-Up"],
    ["Cable Crunches", "Cable Crunch"],
    ["Bulgarian Split Squats", "Bulgarian Split Squat"],
    ["Lateral Raises", "Lateral Raise"],
    ["Face Pulls", "Face Pull"],
  ])("%s is %s", (query, expected) => {
    expect(m(query)).toMatchObject({ status: "exact", best: expected });
  });

  it("every library name still matches itself exactly (the plural rule is applied to both sides)", () => {
    const misses = LIBRARY_NAMES.filter((name) => m(name).status !== "exact" || m(name).best !== name);
    expect(misses).toEqual([]);
  });
});

describe("matchExercise: qualified names and alternatives (ARCH-066)", () => {
  it("accepts the one library name that the typed words contain", () => {
    expect(m("seated dumbbell shoulder press")).toEqual({
      status: "unique",
      best: "Dumbbell Shoulder Press",
      candidates: ["Dumbbell Shoulder Press"],
    });
    expect(m("barbell back squat")).toMatchObject({ status: "unique", best: "Back Squat" });
    expect(m("barbell bicep curls")).toMatchObject({ status: "unique", best: "Barbell Curl" });
    expect(m("lying leg curls")).toMatchObject({ status: "unique", best: "Leg Curl" });
    expect(m("tricep rope pushdowns")).toMatchObject({ status: "unique", best: "Tricep Pushdown" });
  });

  it("asks when two library names fit and neither contains the other, offering just those two", () => {
    expect(m("chest-supported t-bar row")).toEqual({
      status: "ambiguous",
      best: "Chest-Supported Row",
      candidates: ["Chest-Supported Row", "T-Bar Row"],
    });
    expect(m("incline dumbbell curl")).toMatchObject({ status: "ambiguous" });
    expect(m("incline dumbbell curl").candidates).toEqual(expect.arrayContaining(["Incline Curl", "Dumbbell Curl"]));
  });

  it("does not accept a name with more than two added words", () => {
    expect(m("seated wide grip slow tempo barbell back squat").status).not.toBe("unique");
  });

  it("Overhead Barbell Press leads with Overhead Press and never offers Bench Press", () => {
    const r = m("overhead barbell press");
    expect(r.best).toBe("Overhead Press");
    expect(r.candidates).toEqual(["Overhead Press"]);
    expect(r.candidates.join(" ")).not.toMatch(/Bench/);
  });

  it("offers a best guess and at most two alternatives, each at least 60% as close as the guess", () => {
    for (const text of ["Incline", "Curl", "Dumbbell Press", "Row", "Press"]) {
      const r = m(text);
      expect(r.candidates.length, text).toBeLessThanOrEqual(3);
    }
    // Overhead Barbell Press used to come back with Barbell Bench Press and Incline Barbell Bench Press beside it.
    expect(m("overhead barbel press").candidates.join(" ")).not.toMatch(/Bench/);
  });

  it("keeps the usual lifts first: Incline leads with a press, Curl with Dumbbell Curl", () => {
    expect(m("Incline").best).toBe("Incline Dumbbell Press");
    expect(m("Curl").best).toBe("Dumbbell Curl");
  });
});
