// P2 ("Busy professional: 2 x 45 min full body") leaves the scored parity set (ARCH-063, Session D follow-up). Its
// expected headline was `time-budget/none`: the engine saying nothing about the budget. A headline matcher cannot
// tell that from the engine saying nothing for any other reason, and P2's sessions FIT the budget, so there is no
// time-budget finding to match. What P2 actually exercises is the time-budget axis and how many actions surface.
// This file tests that, against P2 itself.
import { describe, expect, it } from "vitest";
import { findingSentence } from "../../src/copy/findingSentence";
import { HYPERTROPHY_CONFIG } from "../../src/goal-profiles/hypertrophy";
import { PROGRAMS_BY_ID } from "./programs";
import { REF, run } from "./lib";

const P2 = PROGRAMS_BY_ID.get("P2")!;

function assess(context?: { minutesPerSession: number }) {
  REF.muscleGroups.sort((a, b) => a.name.localeCompare(b.name)); // production order, as parity.ts does
  return run(P2.program, { defaultRpe: P2.defaultRpe, quiet: true, ...(context ? { context } : {}) }).a;
}
const timeBudgetAxis = (a: ReturnType<typeof assess>) => a.allAssessedAxes.find((x) => x.scopeKey === "time-budget");
const keys = (a: ReturnType<typeof assess>): string[] => (a.findings ?? []).map((f) => f.key);

describe("P2 with a 45-minute budget", () => {
  const a = assess({ minutesPerSession: 45 });

  it("says nothing about time: its two sessions are 11 sets, 27.5 minutes, inside 45", () => {
    const axis = timeBudgetAxis(a);
    expect(axis?.metricValue).toBe(27.5);
    expect(axis?.status.band).toBe("Within range");
    expect(keys(a)).not.toContain("PROGRAM_STRUCTURE:time-budget");
    expect(a.actions.map((x) => x.rootCauseKey)).not.toContain("programStructure:fit-budget");
  });

  it("surfaces at most 2 actions (it was 15 in the audit, 3 after Session B)", () => {
    expect(a.actions.length).toBeLessThanOrEqual(2);
  });
});

describe("P2 without a budget", () => {
  it("has no time-budget axis, and the same findings and actions as with a budget it fits", () => {
    const without = assess();
    const fits = assess({ minutesPerSession: 45 });
    expect(timeBudgetAxis(without)).toBeUndefined();
    expect(keys(without)).toEqual(keys(fits));
    expect(without.actions.map((x) => x.rootCauseKey)).toEqual(fits.actions.map((x) => x.rootCauseKey));
  });
});

describe("P2 against a budget it exceeds", () => {
  const a = assess({ minutesPerSession: 20 });

  it("flags the longest session, says how many sets would bring it inside, and adds one action", () => {
    expect(timeBudgetAxis(a)?.status.band).toBe("Over budget");
    const finding = a.findings!.find((f) => f.key === "PROGRAM_STRUCTURE:time-budget")!;
    // 27.5 minutes against 20 is 7.5 over, so 3 sets at 2.5 minutes each.
    expect(findingSentence(finding, HYPERTROPHY_CONFIG)).toBe(
      "Session Day A is about 28 minutes. You said 20. Consider supersetting or trimming 3 sets.",
    );
    expect(a.actions.map((x) => x.rootCauseKey)).toContain("programStructure:fit-budget");
    expect(a.actions.length).toBeLessThanOrEqual(2);
  });
});
