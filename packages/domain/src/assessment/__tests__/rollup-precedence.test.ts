// packages/domain/src/assessment/__tests__/rollup-precedence.test.ts
//
// Tests the weight-resolution precedence chain (Q2 confirmation):
//
//   1. Fully-scoped key ("VOLUME:chest") — wins if present.
//   2. Axis-level fallback ("VOLUME:")   — used if the scoped key is absent.
//   3. Neither present -> weight is null -> axis is UNVALIDATED.
//
// Additional case (from the confirmation's "present but null" rule): a
// scoped key that exists with `weight: null` is NOT a signal to fall through
// to the axis-level default. `null` is an explicit "[SCIENTIFIC INPUT
// REQUIRED]" marker, not an "absent" marker. The chain terminates at the
// first key that exists.

import { describe, expect, it } from "vitest";
import type { Analysis, GoalProfileConfig } from "../../analysis/types";
import { rollUpLeverage } from "../rollup";

const BASE_CONFIG: Omit<GoalProfileConfig, "axisWeights"> = {
  goalProfileKey: "PRECEDENCE_TEST",
  statusBands: {
    VOLUME: [],
    FREQUENCY: [],
    EXERCISE_SELECTION_BALANCE: [],
    PROGRESSION_SOUNDNESS: [],
    RECOVERY_COST: [],
  },
  severityMap: { VOLUME: { Low: "MAJOR" } },
  severityWeightTable: {
    NONE: { LOW: "NONE", MEDIUM: "NONE", HIGH: "NONE" },
    MINOR: { LOW: "NONE", MEDIUM: "LOW", HIGH: "MODERATE" },
    MODERATE: { LOW: "LOW", MEDIUM: "MODERATE", HIGH: "HIGH" },
    MAJOR: { LOW: "MODERATE", MEDIUM: "HIGH", HIGH: "HIGH" },
  },
  materialitySeverityThreshold: "MODERATE",
  fitScoreProjection: {
    leverageOrdinal: ["NONE", "LOW", "MODERATE", "HIGH"],
    worstLeverageToBand: {
      NONE: "STRONG",
      LOW: "STRONG",
      MODERATE: "DECENT",
      HIGH: "NEEDS_WORK",
    },
  },
  validated: true,
  sourceNote: "TEST FIXTURE ONLY — precedence test.",
};

const CHEST_LOW_ANALYSIS: Analysis = {
  programVersionId: "precedence-v1",
  axisResults: [
    {
      axisType: "VOLUME",
      scopeKey: "chest",
      metricValue: 3,
      status: { kind: "BAND", band: "Low" },
    },
  ],
  computedAt: "2026-01-01T00:00:00.000Z",
};

function configWith(axisWeights: GoalProfileConfig["axisWeights"]): GoalProfileConfig {
  return { ...BASE_CONFIG, axisWeights };
}

describe("rollUpLeverage — weight-resolution precedence", () => {
  it("scoped key wins when both scoped and axis-level keys are present", () => {
    const config = configWith({
      "VOLUME:chest": { weight: "HIGH" },
      "VOLUME:": { weight: "LOW" },
    });
    const result = rollUpLeverage(CHEST_LOW_ANALYSIS, config);
    expect(result.kind).toBe("OK");
    if (result.kind !== "OK") return;
    expect(result.assessedAxes).toHaveLength(1);
    // HIGH weight × MAJOR severity = HIGH leverage.
    expect(result.assessedAxes[0]!.weight).toBe("HIGH");
    expect(result.assessedAxes[0]!.leverage).toBe("HIGH");
  });

  it("falls back to axis-level key when scoped key is absent", () => {
    const config = configWith({
      "VOLUME:": { weight: "LOW" },
    });
    const result = rollUpLeverage(CHEST_LOW_ANALYSIS, config);
    expect(result.kind).toBe("OK");
    if (result.kind !== "OK") return;
    expect(result.assessedAxes[0]!.weight).toBe("LOW");
    // LOW weight × MAJOR severity = MODERATE leverage (see 12-cell table).
    expect(result.assessedAxes[0]!.leverage).toBe("MODERATE");
  });

  it("returns BLOCKED when neither scoped nor axis-level key is present", () => {
    const config = configWith({});
    const result = rollUpLeverage(CHEST_LOW_ANALYSIS, config);
    expect(result.kind).toBe("BLOCKED");
    if (result.kind !== "BLOCKED") return;
    // No axis rolled up — the only axis was blocked at weight resolution.
    expect(result.assessedAxes).toHaveLength(0);
    expect(result.reason).toContain("no axisWeights entry");
    expect(result.reason).toContain("VOLUME:chest");
    expect(result.reason).toContain("VOLUME:");
  });

  it("does NOT fall through to the axis-level default when the scoped key exists with weight: null", () => {
    const config = configWith({
      "VOLUME:chest": { weight: null, rationale: "UNRESOLVED" },
      "VOLUME:": { weight: "LOW" },
    });
    const result = rollUpLeverage(CHEST_LOW_ANALYSIS, config);
    expect(result.kind).toBe("BLOCKED");
    if (result.kind !== "BLOCKED") return;
    expect(result.assessedAxes).toHaveLength(0);
    expect(result.reason).toContain('axisWeights["VOLUME:chest"]');
    expect(result.reason).toContain("SCIENTIFIC INPUT REQUIRED");
    // And crucially: it did NOT silently take the axis-level LOW.
    expect(result.assessedAxes).not.toContainEqual(
      expect.objectContaining({ weight: "LOW" }),
    );
  });

  it("returns BLOCKED when the axis-level key exists but weight is null", () => {
    const config = configWith({
      "VOLUME:": { weight: null, rationale: "UNRESOLVED" },
    });
    const result = rollUpLeverage(CHEST_LOW_ANALYSIS, config);
    expect(result.kind).toBe("BLOCKED");
    if (result.kind !== "BLOCKED") return;
    expect(result.reason).toContain('axisWeights["VOLUME:"]');
  });
});