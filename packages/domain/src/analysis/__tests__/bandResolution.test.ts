// packages/domain/src/analysis/__tests__/bandResolution.test.ts
import { describe, expect, it } from "vitest";
import { resolveBand } from "../bandResolution";
import type { AxisBandDefinition } from "../types";

describe("resolveBand", () => {
  it("returns UNVALIDATED when there are no bands", () => {
    expect(resolveBand(10, [])).toEqual({
      kind: "UNVALIDATED",
      reason: "No bands configured for this axis.",
    });
  });

  it("returns UNVALIDATED when every band has both bounds null", () => {
    const bands: AxisBandDefinition[] = [
      { status: "Low", lowerBound: null, upperBound: null },
      { status: "High", lowerBound: null, upperBound: null },
    ];
    const result = resolveBand(10, bands);
    expect(result.kind).toBe("UNVALIDATED");
  });

  it("matches a below-range value to the lowest band", () => {
    const bands: AxisBandDefinition[] = [
      { status: "Low", lowerBound: null, upperBound: 8 },
      { status: "Adequate", lowerBound: 8, upperBound: 16 },
      { status: "High", lowerBound: 16, upperBound: null },
    ];
    expect(resolveBand(5, bands)).toEqual({ kind: "BAND", band: "Low" });
  });

  it("matches an in-range value to the middle band", () => {
    const bands: AxisBandDefinition[] = [
      { status: "Low", lowerBound: null, upperBound: 8 },
      { status: "Adequate", lowerBound: 8, upperBound: 16 },
      { status: "High", lowerBound: 16, upperBound: null },
    ];
    expect(resolveBand(10, bands)).toEqual({ kind: "BAND", band: "Adequate" });
  });

  it("matches an above-range value to the top band", () => {
    const bands: AxisBandDefinition[] = [
      { status: "Low", lowerBound: null, upperBound: 8 },
      { status: "Adequate", lowerBound: 8, upperBound: 16 },
      { status: "High", lowerBound: 16, upperBound: null },
    ];
    expect(resolveBand(42, bands)).toEqual({ kind: "BAND", band: "High" });
  });

  it("is half-open: value exactly at upperBound goes to next band", () => {
    const bands: AxisBandDefinition[] = [
      { status: "Low", lowerBound: null, upperBound: 8 },
      { status: "Adequate", lowerBound: 8, upperBound: 16 },
    ];
    expect(resolveBand(8, bands)).toEqual({ kind: "BAND", band: "Adequate" });
  });

  it("returns UNVALIDATED when no band matches the value", () => {
    const bands: AxisBandDefinition[] = [
      { status: "Middle", lowerBound: 8, upperBound: 16 },
    ];
    const result = resolveBand(42, bands);
    expect(result.kind).toBe("UNVALIDATED");
  });
});