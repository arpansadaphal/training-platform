// cueStepsOf: the structured cues win; the legacy text column is the fallback, each line an "action" step.
// No database needed.

import { describe, expect, it } from "vitest";
import { cueStepsOf } from "../exercise";

describe("cueStepsOf", () => {
  it("reads cueSteps when it holds well-formed steps", () => {
    const steps = [
      { kind: "setup", text: "Bench at 30°." },
      { kind: "feel", text: "Feel your chest." },
    ];
    expect(cueStepsOf({ cues: ["old"], cueSteps: steps })).toEqual(steps);
  });

  it("falls back to the legacy lines as action steps when cueSteps is null", () => {
    expect(cueStepsOf({ cues: ["one", "two"], cueSteps: null })).toEqual([
      { kind: "action", text: "one" },
      { kind: "action", text: "two" },
    ]);
  });

  it("drops malformed steps, and falls back when none survive", () => {
    expect(
      cueStepsOf({
        cues: ["legacy"],
        cueSteps: [
          { kind: "nonsense", text: "x" },
          { kind: "action" },
          null,
          "str",
          { kind: "action", text: " " },
        ],
      }),
    ).toEqual([{ kind: "action", text: "legacy" }]);
    expect(
      cueStepsOf({
        cues: [],
        cueSteps: [
          { kind: "nonsense", text: "x" },
          { kind: "action", text: "ok" },
        ],
      }),
    ).toEqual([{ kind: "action", text: "ok" }]);
  });

  it("is empty when there is nothing at all", () => {
    expect(cueStepsOf({ cues: [], cueSteps: null })).toEqual([]);
    expect(cueStepsOf({ cues: [], cueSteps: {} })).toEqual([]);
  });
});
