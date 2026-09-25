import { describe, it, expect } from "vitest";
import type { ProgramStructure } from "./index";

describe("@training/domain", () => {
  it("exports the ProgramStructure type", () => {
    // Compile-time check: if this type isn't exported, tsc fails.
    const sample: ProgramStructure = { workoutDays: [] };
    expect(sample.workoutDays).toEqual([]);
  });
});