// packages/domain/src/analysis/bandResolution.ts
//
// Single source of truth for turning a numeric metric value into an
// `AxisStatus`, given a config's `AxisBandDefinition[]`.
//
// Rules (deliberately conservative, matching phases/phase-02-analysis-engine.md
// and the user's Q3 answer):
//   - No bands, or every band has both bounds null  -> UNVALIDATED.
//     An all-null bound set is the "[SCIENTIFIC INPUT REQUIRED]" placeholder
//     shape; it must never be rendered as if it were a real band.
//   - A band with both bounds null is a placeholder; it is skipped during
//     matching (so a partially-configured axis cannot accidentally match a
//     placeholder band).
//   - Bands are half-open [lower, upper); null lower = -inf, null upper = +inf.
//   - If no band matches the value, UNVALIDATED (with reason) rather than
//     silently picking "closest" — an unmatched value almost always means the
//     config has a hole, and pretending otherwise would violate invariant 1.

import type { AxisBandDefinition, AxisStatus } from "./types";

export function resolveBand(
  metricValue: number,
  bands: readonly AxisBandDefinition[],
): AxisStatus {
  if (bands.length === 0) {
    return { kind: "UNVALIDATED", reason: "No bands configured for this axis." };
  }

  const allPlaceholder = bands.every(
    (b) => b.lowerBound === null && b.upperBound === null,
  );
  if (allPlaceholder) {
    return {
      kind: "UNVALIDATED",
      reason:
        "All bands have null bounds — [SCIENTIFIC INPUT REQUIRED]; no thresholds to resolve against.",
    };
  }

  for (const band of bands) {
    if (band.lowerBound === null && band.upperBound === null) continue;
    const low = band.lowerBound ?? Number.NEGATIVE_INFINITY;
    const high = band.upperBound ?? Number.POSITIVE_INFINITY;
    if (metricValue >= low && metricValue < high) {
      return { kind: "BAND", band: band.status };
    }
  }

  return {
    kind: "UNVALIDATED",
    reason: `No configured band matches metric value ${metricValue}.`,
  };
}