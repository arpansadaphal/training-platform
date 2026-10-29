// packages/domain/src/assessment/patternGaps.ts
//
// ARCH-063 / B2. Two small readers over the profile's Tier 3 grouping config, shared by the roll-up (which raises
// the Exercise selection severity while a whole pattern group is absent) and the finding composer (which groups
// Lows by region and explains a missing pattern group). Pure; reads only the config and what an axis carries.

import type {
  GoalProfileConfig,
  MovementPattern,
  RegionKey,
  WholePatternGap,
} from "../analysis/types";

/**
 * The whole-pattern groups that are absent: every pattern in the group is among `missing`. Config order.
 * "Pulling" is absent only when BOTH horizontal and vertical pulls are missing; a program with rows but no
 * pulldown is missing a pattern, not the group.
 */
export function absentPatternGaps(
  missing: readonly MovementPattern[] | undefined,
  config: GoalProfileConfig,
): readonly WholePatternGap[] {
  if (missing === undefined || missing.length === 0) return [];
  const absent = new Set<MovementPattern>(missing);
  return (config.wholePatternGaps ?? []).filter(
    (group) => group.patterns.length > 0 && group.patterns.every((p) => absent.has(p)),
  );
}

/** The region a muscle-group name belongs to in the profile, or null. */
export function regionOf(config: GoalProfileConfig, muscleGroupName: string): RegionKey | null {
  for (const region of config.regions ?? []) {
    if (region.muscles.includes(muscleGroupName)) return region.key;
  }
  return null;
}
