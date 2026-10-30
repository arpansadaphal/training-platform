// packages/domain/src/analysis/runsPerWeek.ts
//
// How many times a week the lifter runs the listed structure (ARCH-063, Session C1).
//
// By default a ProgramStructure is read as one representative week: every listed workout day happens once. When the
// lifter says how many days they train (AnalysisContext.daysPerWeek) and that differs from the number of days listed,
// the structure is a repeating cycle instead: three days (push, pull, legs) done on six days a week is the cycle run
// twice, and a four-day split done on six days is run one and a half times.
//
//   runsPerWeek = daysPerWeek / listedDays
//
// A structural read, not a threshold: no band, severity, weight or leverage changes. Only VOLUME and FREQUENCY read it
// (volume.ts, frequency.ts); the other axes and the cross-muscle ratios still read the listed days.
//
// Returns 1, meaning "unchanged", when no context was given, when daysPerWeek is not a positive finite number, when
// the structure has no training day to repeat, or when daysPerWeek equals the listed days.

import type { ProgramStructure } from "../types";
import type { AnalysisContext } from "./types";

export function runsPerWeek(structure: ProgramStructure, context?: Pick<AnalysisContext, "daysPerWeek">): number {
  const daysPerWeek = context?.daysPerWeek;
  if (daysPerWeek === undefined || !Number.isFinite(daysPerWeek) || daysPerWeek <= 0) return 1;
  const listedDays = structure.workoutDays.filter((d) => d.isRestDay !== true).length;
  if (listedDays === 0 || daysPerWeek === listedDays) return 1;
  return daysPerWeek / listedDays;
}
