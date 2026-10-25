import { describe, expect, it } from "vitest";
import {
  COMEBACK_AFTER_DAYS,
  computeNextTargets,
  judgeSession,
  type NextTargetInput,
  type TargetPrescription,
} from "../nextTargets";
import type { LoggedSet, SessionSets } from "../history";
import { loadStepFor, roundToGrid } from "../loadSteps";
import {
  repsLeftText,
  startingWeightFromSession,
  stopWithText,
  suggestWeight,
} from "../startingWeight";
import { assertCleanCopy } from "./forbiddenCopy";

const RX: TargetPrescription = { targetSets: 3, repsLow: 8, repsHigh: 12, plannedRpe: 8 };

function set(reps: number | null, load: number | null, rpe: number | null = 8): LoggedSet {
  return { reps, load, rpe };
}

function session(id: string, sets: LoggedSet[]): SessionSets {
  return { sessionId: id, date: "2026-10-01T10:00:00.000Z", sets };
}

function input(over: Partial<NextTargetInput>): NextTargetInput {
  return {
    history: [],
    prescription: RX,
    equipment: "barbell",
    unit: "kg",
    daysSinceLastTraining: 2,
    ...over,
  };
}

const sets = (reps: number[], load: number, rpe: number | null = 8) =>
  reps.map((r) => set(r, load, rpe));

describe("computeNextTargets: the double-progression rule", () => {
  it("has no target for an exercise with no history", () => {
    const t = computeNextTargets(input({ history: [] }));
    expect(t.kind).toBe("FIRST_TIME");
    expect(t.weight).toBeNull();
    expect(t.reason).toMatch(/first time/i);
  });

  it("adds one load step when every set reached the top of the range", () => {
    const t = computeNextTargets(input({ history: [session("a", sets([12, 12, 12], 47.5))] }));
    expect(t).toMatchObject({ kind: "UP", weight: 50, lastLoad: 47.5 });
    expect(t.reason).toBe("Up 2.5 kg: you hit 12 reps on every set last time.");
  });

  it("holds when one set is one rep short of the top", () => {
    const t = computeNextTargets(input({ history: [session("a", sets([12, 12, 11], 47.5))] }));
    expect(t).toMatchObject({ kind: "HOLD", weight: 47.5 });
    expect(t.reason).toContain("work up to 12 reps on every set");
  });

  it("does not advance on fewer sets than planned, even at the top of the range", () => {
    const t = computeNextTargets(input({ history: [session("a", sets([12, 12], 47.5))] }));
    expect(t).toMatchObject({ kind: "HOLD", weight: 47.5 });
  });

  it("allows one step above the planned effort and no more", () => {
    const rpe9 = computeNextTargets(input({ history: [session("a", sets([12, 12, 12], 40, 9))] }));
    expect(rpe9.kind).toBe("UP");
    const rpe10 = computeNextTargets(input({ history: [session("a", sets([12, 12, 12], 40, 10))] }));
    expect(rpe10).toMatchObject({ kind: "HOLD", weight: 40 });
    expect(rpe10.reason).toContain("harder than planned");
  });

  it("never blocks on missing effort, or when the plan states none", () => {
    const noEffort = computeNextTargets(input({ history: [session("a", sets([12, 12, 12], 40, null))] }));
    expect(noEffort.kind).toBe("UP");
    const noPlan = computeNextTargets(
      input({
        history: [session("a", sets([12, 12, 12], 40, 10))],
        prescription: { ...RX, plannedRpe: null },
      }),
    );
    expect(noPlan.kind).toBe("UP");
  });

  it("holds after one session short of the bottom of the range on most sets", () => {
    const t = computeNextTargets(input({ history: [session("a", sets([7, 7, 9], 50))] }));
    expect(t).toMatchObject({ kind: "HOLD", weight: 50 });
    expect(t.reason).toBe("Same weight: 2 of 3 sets were under 8 reps last time.");
  });

  it("treats the bottom of the range as inside it, and a single weak set as a hold", () => {
    expect(judgeSession(sets([8, 8, 8], 50), RX, false)?.outcome).toBe("HOLD");
    expect(judgeSession(sets([10, 9, 7], 50), RX, false)?.outcome).toBe("HOLD");
    expect(judgeSession(sets([7, 7, 9], 50), RX, false)?.outcome).toBe("MISS");
  });

  it("drops 10% after two misses in a row, on the weight grid", () => {
    const t = computeNextTargets(
      input({ history: [session("b", sets([6, 7, 7], 50)), session("a", sets([7, 7, 8], 50))] }),
    );
    expect(t).toMatchObject({ kind: "DELOAD", weight: 45, lastLoad: 50 });
    expect(t.reason).toContain("two sessions in a row under 8 reps");
  });

  it("does not deload when only the latest session was a miss", () => {
    const t = computeNextTargets(
      input({ history: [session("b", sets([6, 7, 7], 50)), session("a", sets([10, 10, 10], 50))] }),
    );
    expect(t.kind).toBe("HOLD");
  });

  it("deloads by at least one grid step and never below the lightest row", () => {
    const light = computeNextTargets(
      input({ history: [session("b", sets([5, 5, 5], 20)), session("a", sets([5, 5, 5], 20))] }),
    );
    expect(light.weight).toBe(17.5);
    const lightest = computeNextTargets(
      input({ history: [session("b", sets([5, 5, 5], 2.5)), session("a", sets([5, 5, 5], 2.5))] }),
    );
    expect(lightest.weight).toBe(2.5);
  });

  it("judges a session at its most-used load (ties go heavier)", () => {
    const t = computeNextTargets(
      input({
        history: [session("a", [set(12, 40), set(12, 50), set(12, 50), set(12, 50)])],
      }),
    );
    expect(t).toMatchObject({ kind: "UP", weight: 52.5, lastLoad: 50 });
    const tie = judgeSession([set(12, 40), set(12, 40), set(12, 50), set(12, 50)], RX, false);
    expect(tie?.load).toBe(50);
  });

  it("uses the most recent session, not the best one", () => {
    const t = computeNextTargets(
      input({ history: [session("b", sets([10, 9, 9], 45)), session("a", sets([12, 12, 12], 50))] }),
    );
    expect(t).toMatchObject({ kind: "HOLD", weight: 45 });
  });
});

describe("computeNextTargets: comeback", () => {
  const history = [session("a", sets([12, 12, 12], 50))];

  it("is 10% lighter after 10 or more days off, and the rule's advance is skipped", () => {
    const t = computeNextTargets(input({ history, daysSinceLastTraining: COMEBACK_AFTER_DAYS }));
    expect(t).toMatchObject({ kind: "COMEBACK", weight: 45 });
    expect(t.reason).toBe("Comeback: 10% lighter after 10 days off.");
  });

  it("does not apply at 9 days", () => {
    expect(computeNextTargets(input({ history, daysSinceLastTraining: 9 })).kind).toBe("UP");
  });

  it("does not apply with no history or no training days known", () => {
    expect(computeNextTargets(input({ history: [], daysSinceLastTraining: 30 })).kind).toBe("FIRST_TIME");
    expect(computeNextTargets(input({ history, daysSinceLastTraining: null })).kind).toBe("UP");
  });

  it("rounds to the grid, one step down at least", () => {
    const t = computeNextTargets(
      input({ history: [session("a", sets([12, 12, 12], 20))], daysSinceLastTraining: 14 }),
    );
    expect(t.weight).toBe(17.5);
  });
});

describe("computeNextTargets: equipment and units", () => {
  const top = (load: number) => [session("a", sets([12, 12, 12], load))];

  it("steps by equipment", () => {
    expect(computeNextTargets(input({ equipment: "barbell", history: top(50) })).weight).toBe(52.5);
    expect(computeNextTargets(input({ equipment: "dumbbell", history: top(20) })).weight).toBe(22.5);
    expect(computeNextTargets(input({ equipment: "cable", history: top(40) })).weight).toBe(42.5);
    expect(computeNextTargets(input({ equipment: "machine", history: top(60) })).weight).toBe(65);
    expect(computeNextTargets(input({ equipment: null, history: top(30) })).weight).toBe(32.5);
  });

  it("steps in pounds on the pound grid", () => {
    expect(loadStepFor("barbell", "lb")).toBe(5);
    expect(loadStepFor("machine", "lb")).toBe(10);
    const t = computeNextTargets(input({ unit: "lb", history: top(135) }));
    expect(t).toMatchObject({ kind: "UP", weight: 140 });
    expect(t.reason).toBe("Up 5 lb: you hit 12 reps on every set last time.");
  });

  it("moves bodyweight work by reps only", () => {
    const bw = (reps: number[]) => [session("a", reps.map((r) => set(r, 0)))];
    const more = computeNextTargets(input({ equipment: "bodyweight", history: bw([8, 9, 10]) }));
    expect(more).toMatchObject({ kind: "MORE_REPS", weight: 0 });
    expect(more.reason).toBe("Aim for 9 reps on every set, one more than your lowest set last time.");
    const top12 = computeNextTargets(input({ equipment: "bodyweight", history: bw([12, 12, 12]) }));
    expect(top12.weight).toBe(0);
    expect(top12.reason).toContain("Add weight or a harder variation");
    const noLoad = computeNextTargets(
      input({ equipment: "bodyweight", history: [session("a", [set(8, null), set(8, null), set(9, null)])] }),
    );
    expect(noLoad.kind).toBe("MORE_REPS");
  });

  it("asks for a weight when the last session logged none", () => {
    const t = computeNextTargets(
      input({ history: [session("a", [set(10, null), set(10, null), set(10, null)])] }),
    );
    expect(t.kind).toBe("FIRST_TIME");
    expect(t.reason).toBe("No weight was logged last time. Pick one to start from.");
  });
});

describe("computeNextTargets: the first session spent finding a weight", () => {
  it("starts the next session from the estimate of the last set", () => {
    // 20 kg x 10 (7+ left), 30 kg x 10 (3-4 left), 40 kg x 10 (1-2 left)
    const found = [session("a", [set(10, 20, 2), set(10, 30, 6.5), set(10, 40, 8.5)])];
    const t = computeNextTargets(input({ history: found }));
    expect(t).toMatchObject({ kind: "START", weight: 37.5 });
    expect(t.reason).toBe("Start at 37.5 kg, from how last time's sets felt.");
  });

  it("reads one light warm-up set before the work as work, not as a search for a weight", () => {
    const t = computeNextTargets(
      input({ history: [session("a", [set(12, 40), set(12, 50), set(12, 50), set(12, 50)])] }),
    );
    expect(t).toMatchObject({ kind: "UP", weight: 52.5 });
  });

  it("falls back to the rule when the sets were all at one weight", () => {
    const t = computeNextTargets(input({ history: [session("a", sets([10, 10, 10], 40))] }));
    expect(t.kind).toBe("HOLD");
  });
});

describe("startingWeight", () => {
  const rng = { repsLow: 8, repsHigh: 12 };

  it("suggests a weight for 2-3 reps left in the middle of the range, rounded down", () => {
    expect(suggestWeight({ load: 40, reps: 10, repsLeft: 0, unit: "kg", ...rng })).toBe(37.5);
    expect(suggestWeight({ load: 40, reps: 10, repsLeft: 3.5, unit: "kg", ...rng })).toBe(40);
  });

  it("never jumps more than 20% over the set just done", () => {
    expect(suggestWeight({ load: 20, reps: 10, repsLeft: 8, unit: "kg", ...rng })).toBe(22.5);
    expect(suggestWeight({ load: 20, reps: 5, repsLeft: 8, unit: "kg", ...rng })).toBe(20);
  });

  it("works in pounds on the pound grid", () => {
    expect(suggestWeight({ load: 95, reps: 10, repsLeft: 1.5, unit: "lb", ...rng })).toBe(90);
  });

  it("has no suggestion without a load or reps", () => {
    expect(suggestWeight({ load: null, reps: 10, repsLeft: 2, unit: "kg", ...rng })).toBeNull();
    expect(suggestWeight({ load: 40, reps: null, repsLeft: 2, unit: "kg", ...rng })).toBeNull();
    expect(suggestWeight({ load: 0, reps: 10, repsLeft: 2, unit: "kg", ...rng })).toBeNull();
  });

  it("reads the starting weight from the last set that has an effort", () => {
    const w = startingWeightFromSession({
      sets: [set(10, 30, 6.5), set(10, 40, 8.5), set(10, 40, null)],
      unit: "kg",
      ...rng,
    });
    expect(w).toBe(37.5);
    expect(startingWeightFromSession({ sets: [set(10, 40, null)], unit: "kg", ...rng })).toBeNull();
  });

  it("speaks effort in reps left", () => {
    expect(repsLeftText(10)).toBe("0 reps left");
    expect(repsLeftText(9)).toBe("1 rep left");
    expect(repsLeftText(8.5)).toBe("1-2 reps left");
    expect(repsLeftText(8)).toBe("2-3 reps left");
    expect(repsLeftText(6.5)).toBe("3-4 reps left");
    expect(repsLeftText(6)).toBe("4-5 reps left");
    expect(repsLeftText(4.5)).toBe("5-6 reps left");
    expect(repsLeftText(4)).toBe("6+ reps left");
    expect(repsLeftText(2)).toBe("7+ reps left");
    expect(repsLeftText(7)).toBe("3 reps left");
    expect(stopWithText(8)).toBe("stop with 2-3 reps left");
    expect(stopWithText(null)).toBeNull();
  });

  it("rounds to the grid", () => {
    expect(roundToGrid(18, "kg")).toBe(17.5);
    expect(roundToGrid(136, "lb")).toBe(135);
  });
});

describe("determinism and copy", () => {
  it("gives the same target for the same input", () => {
    const i = input({ history: [session("a", sets([12, 12, 12], 47.5))] });
    expect(JSON.stringify(computeNextTargets(i))).toBe(JSON.stringify(computeNextTargets(i)));
  });

  it("every reason passes the forbidden-copy lint", () => {
    const reasons: string[] = [];
    const add = (over: Partial<NextTargetInput>) => reasons.push(computeNextTargets(input(over)).reason);
    add({});
    add({ history: [session("a", sets([12, 12, 12], 47.5))] });
    add({ history: [session("a", sets([12, 12, 11], 47.5))] });
    add({ history: [session("a", sets([12, 12, 12], 40, 10))] });
    add({ history: [session("a", sets([7, 7, 9], 50))] });
    add({ history: [session("b", sets([6, 7, 7], 50)), session("a", sets([7, 7, 8], 50))] });
    add({ history: [session("a", sets([12, 12, 12], 50))], daysSinceLastTraining: 15 });
    add({ equipment: "bodyweight", history: [session("a", [set(8, 0), set(9, 0), set(9, 0)])] });
    add({ equipment: "bodyweight", history: [session("a", [set(12, 0), set(12, 0), set(12, 0)])] });
    add({ history: [session("a", [set(10, 20, 2), set(10, 30, 6.5), set(10, 40, 8.5)])] });
    add({ history: [session("a", [set(10, null), set(10, null)])] });
    add({ equipment: "bodyweight", history: [] });
    for (const a of [0, 1, 2, 3]) reasons.push(stopWithText(8) ?? "", repsLeftText(a + 6));
    assertCleanCopy(reasons);
  });
});
