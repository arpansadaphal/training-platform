import { describe, expect, it } from "vitest";
import {
  DEFAULT_TARGET,
  RPE_OPTIONS,
  nearestRpeOption,
  rpeLabel,
  rpeOptionText,
  weightOptions,
  weightTarget,
} from "../loggingOptions";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";

describe("weightOptions", () => {
  it("lists bodyweight, then 2.5 kg steps up to 200 kg", () => {
    const kg = weightOptions("kg");
    expect(kg[0]).toEqual({ value: 0, label: "Bodyweight", otherLabel: null });
    expect(kg[1]!.value).toBe(2.5);
    expect(kg[kg.length - 1]!.value).toBe(200);
    expect(kg).toHaveLength(81);
    expect(kg.find((o) => o.value === 100)).toEqual({ value: 100, label: "100 kg", otherLabel: "220 lb" });
  });

  it("lists 5 lb steps, with the kilogram equivalent small", () => {
    const lb = weightOptions("lb");
    expect(lb[1]!.value).toBe(5);
    expect(lb.find((o) => o.value === 225)).toEqual({ value: 225, label: "225 lb", otherLabel: "102.1 kg" });
  });

  it("adds an off-step weight (the plan's, a logged one) in order, once", () => {
    const o = weightOptions("kg", [52, 52, 50]);
    const values = o.map((x) => x.value);
    expect(values.filter((v) => v === 52)).toHaveLength(1);
    expect(values.indexOf(52)).toBe(values.indexOf(50) + 1);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it("targets the plan's weight, else 20 kg / 45 lb", () => {
    expect(weightTarget("kg", 62.5)).toBe(62.5);
    expect(weightTarget("kg", null)).toBe(20);
    expect(weightTarget("lb", 0)).toBe(DEFAULT_TARGET.lb);
    // The default is always on the list.
    expect(weightOptions("kg").some((o) => o.value === 20)).toBe(true);
    expect(weightOptions("lb").some((o) => o.value === 45)).toBe(true);
  });
});

describe("RPE options", () => {
  it("maps the five labelled choices to RPE 4, 6, 8, 9, 10", () => {
    expect(RPE_OPTIONS.map((o) => [rpeOptionText(o), o.rpe])).toEqual([
      ["Easy — 6+ reps left", 4],
      ["Moderate — 4-5 reps left", 6],
      ["Hard — 2-3 reps left", 8],
      ["Very hard — 1 rep left", 9],
      ["Max effort — 0 reps left", 10],
    ]);
    expect(rpeLabel(8)).toBe("Hard — 2-3 reps left (RPE 8)");
    expect(rpeLabel(7)).toBe("RPE 7");
    expect(rpeLabel(7.5)).toBe("RPE 7.5");
  });

  it("defaults to the option nearest the plan's RPE, a tie going to the harder one", () => {
    expect(nearestRpeOption(8).rpe).toBe(8);
    expect(nearestRpeOption(9).rpe).toBe(9);
    expect(nearestRpeOption(7).rpe).toBe(8);
    expect(nearestRpeOption(5).rpe).toBe(6);
    expect(nearestRpeOption(1).rpe).toBe(4);
  });

  it("copy passes the forbidden-phrase lint", () => {
    assertCleanCopy([
      ...RPE_OPTIONS.map(rpeOptionText),
      ...RPE_OPTIONS.map((o) => rpeLabel(o.rpe)),
      ...weightOptions("kg").flatMap((o) => [o.label, o.otherLabel ?? ""]),
      ...weightOptions("lb").flatMap((o) => [o.label, o.otherLabel ?? ""]),
    ]);
  });
});
