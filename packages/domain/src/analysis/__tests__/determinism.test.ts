// packages/domain/src/analysis/__tests__/determinism.test.ts
//
// Phase-2 acceptance criterion: "run computeAnalysis twice on the same input,
// assert deep equality." The injected clock keeps `computedAt` stable.

import { describe, expect, it } from "vitest";
import { computeAnalysis } from "../computeAnalysis";
import { testReferenceData } from "../__fixtures__/exerciseReferenceData";
import {
  fullyCoveredProgram,
  programWithGaps,
} from "../__fixtures__/programStructures";
import { TEST_CONFIG_BOUNDED } from "../__fixtures__/testGoalProfiles";

const FIXED_CLOCK = () => new Date("2026-01-01T00:00:00.000Z");

describe("computeAnalysis determinism", () => {
  it("produces identical output for identical input (fully covered program)", () => {
    const a = computeAnalysis(fullyCoveredProgram, testReferenceData, TEST_CONFIG_BOUNDED, {
      now: FIXED_CLOCK,
    });
    const b = computeAnalysis(fullyCoveredProgram, testReferenceData, TEST_CONFIG_BOUNDED, {
      now: FIXED_CLOCK,
    });
    expect(a).toEqual(b);
  });

  it("produces identical output for identical input (gapped program)", () => {
    const a = computeAnalysis(programWithGaps, testReferenceData, TEST_CONFIG_BOUNDED, {
      now: FIXED_CLOCK,
    });
    const b = computeAnalysis(programWithGaps, testReferenceData, TEST_CONFIG_BOUNDED, {
      now: FIXED_CLOCK,
    });
    expect(a).toEqual(b);
  });
});