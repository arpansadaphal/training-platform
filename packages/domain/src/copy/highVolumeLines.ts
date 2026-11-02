// packages/domain/src/copy/highVolumeLines.ts
//
// ARCH-063 / Session D. Plain lines for the "What's trending high" section. Display copy only: it states the weekly
// hard sets and the band name the engine already produced, and computes no band, severity or leverage. A High band
// is information, not a defect; an Excessive one is also a finding of its own. Invariants 9 and 10: where a number
// sits, never what it will do or why.

import type { HighVolumeEntry } from "../assessment/types";

export const HIGH_VOLUME_HEADING = "What's trending high";

const num = (n: number): string => String(Math.round(n * 10) / 10);
const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "Biceps: 24.5 hard sets/week (High)", highest first (the order the engine gives). Empty when nothing is high. */
export function highVolumeLines(entries: readonly HighVolumeEntry[] | undefined): string[] {
  return (entries ?? []).map((e) => `${capitalise(e.muscle)}: ${num(e.sets)} hard sets/week (${e.band})`);
}
