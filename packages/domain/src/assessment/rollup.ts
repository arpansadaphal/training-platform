// packages/domain/src/assessment/rollup.ts
//
// The leverage roll-up — the single most important rule in the engine,
// restated from 06-assessment-engine.md as a literal algorithm:
//
//   1. For every AnalysisAxisResult, look up its Weight from the active
//      GoalProfileConfig (keyed by `${axisType}:${scopeKey}`).
//   2. Map its Status to a Severity (per-axis, per-band severity map).
//   3. leverage = severityWeightTable[severity][weight].
//
// Every step that cannot resolve — an axis whose band is UNVALIDATED, an
// axis whose band has no severity mapping, an axis whose weight is null or
// missing — blocks the roll-up. The function returns a BLOCKED outcome with
// the partial assessed set and a reason string; `computeAssessment` turns
// that into an UNVALIDATED AssessmentResult.
//
// No numeric thresholds anywhere. No fallback to a "closest" value. The
// weight-resolution precedence is documented on `GoalProfileConfig.axisWeights`
// in ../analysis/types.ts and implemented in `resolveWeight` below.

import type {
  Analysis,
  AxisType,
  GoalProfileConfig,
  Leverage,
  Severity,
  Weight,
} from "../analysis/types";
import type { AssessedAxis } from "./types";

// ---------------------------------------------------------------------------
// Weight resolution (precedence chain per GoalProfileConfig.axisWeights)
// ---------------------------------------------------------------------------

type WeightResolution =
  | { readonly kind: "RESOLVED"; readonly weight: Weight }
  | { readonly kind: "UNRESOLVED"; readonly reason: string };

/**
 * Resolution precedence, deliberately explicit:
 *
 *   1. `${axisType}:${scopeKey ?? ""}` — fully-scoped key, wins if present.
 *   2. `${axisType}:`                  — axis-level fallback, used if the
 *                                        scoped key is absent.
 *   3. Neither present, OR present with `weight: null` — UNRESOLVED.
 *
 * An unresolved key terminates in "we don't know" (weight null, overall
 * UNVALIDATED), never a fabricated value and never a silent default.
 */
function resolveWeight(
  config: GoalProfileConfig,
  axisType: AxisType,
  scopeKey: string | null,
): WeightResolution {
  const scopedKey = `${axisType}:${scopeKey ?? ""}`;
  const axisKey = `${axisType}:`;

  const scoped = config.axisWeights[scopedKey];
  if (scoped) {
    if (scoped.weight === null) {
      return {
        kind: "UNRESOLVED",
        reason: `axisWeights["${scopedKey}"] is explicitly null — [SCIENTIFIC INPUT REQUIRED]`,
      };
    }
    return { kind: "RESOLVED", weight: scoped.weight };
  }

  const axisLevel = config.axisWeights[axisKey];
  if (axisLevel) {
    if (axisLevel.weight === null) {
      return {
        kind: "UNRESOLVED",
        reason: `axisWeights["${axisKey}"] is explicitly null — [SCIENTIFIC INPUT REQUIRED]`,
      };
    }
    return { kind: "RESOLVED", weight: axisLevel.weight };
  }

  return {
    kind: "UNRESOLVED",
    reason: `no axisWeights entry for "${scopedKey}" or fallback "${axisKey}"`,
  };
}

// ---------------------------------------------------------------------------
// Roll-up outcome
// ---------------------------------------------------------------------------

/**
 * The roll-up succeeded for every axis. The returned `assessedAxes` is the
 * full ordered list, in the same order the source `analysis.axisResults`
 * were supplied (determinism relies on this ordering being preserved).
 */
export interface RollUpOk {
  readonly kind: "OK";
  readonly assessedAxes: readonly AssessedAxis[];
}

/**
 * At least one axis could not be rolled up. `assessedAxes` contains the axes
 * that *did* roll up; the caller (computeAssessment) must NOT classify them
 * into strengths/attention/opportunity because the whole is unvalidated.
 * `reason` combines every individual blocker, semicolon-separated.
 */
export interface RollUpBlocked {
  readonly kind: "BLOCKED";
  readonly reason: string;
  readonly assessedAxes: readonly AssessedAxis[];
}

export type RollUpOutcome = RollUpOk | RollUpBlocked;

// ---------------------------------------------------------------------------
// The roll-up itself
// ---------------------------------------------------------------------------

export function rollUpLeverage(
  analysis: Analysis,
  config: GoalProfileConfig,
): RollUpOutcome {
  const assessed: AssessedAxis[] = [];
  const blockers: string[] = [];

  for (const axis of analysis.axisResults) {
    const scopeLabel = axis.scopeKey ? `${axis.axisType}:${axis.scopeKey}` : axis.axisType;

    // Step 1 — the axis must have a resolved band. An axis whose status is
    // UNVALIDATED has no band name to look up in the severity map; the
    // blocker is the axis itself, not the config.
    if (axis.status.kind !== "BAND") {
      blockers.push(`${scopeLabel} has no resolved band (${axis.status.reason})`);
      continue;
    }
    const band = axis.status.band;

    // Step 2 — per-axis, per-band severity map. A missing entry is a config
    // hole, not a default.
    const severityRow = config.severityMap[axis.axisType];
    const severity: Severity | undefined = severityRow?.[band];
    if (!severity) {
      blockers.push(
        `${scopeLabel} has band "${band}" but no severity mapping for that (axis, band) pair`,
      );
      continue;
    }

    // Step 3 — weight resolution via the precedence chain.
    const weightResolution = resolveWeight(config, axis.axisType, axis.scopeKey);
    if (weightResolution.kind === "UNRESOLVED") {
      blockers.push(`${scopeLabel} — ${weightResolution.reason}`);
      continue;
    }
    const weight = weightResolution.weight;

    // Step 4 — leverage lookup. The table is a compile-time complete record;
    // a missing cell would be a TypeScript error, not a runtime blocker.
    const leverage: Leverage = config.severityWeightTable[severity][weight];

    assessed.push({
      axisType: axis.axisType,
      scopeKey: axis.scopeKey,
      metricValue: axis.metricValue,
      status: axis.status,
      severity,
      weight,
      leverage,
    });
  }

  if (blockers.length > 0) {
    return {
      kind: "BLOCKED",
      reason: blockers.join("; "),
      assessedAxes: assessed,
    };
  }
  return { kind: "OK", assessedAxes: assessed };
}