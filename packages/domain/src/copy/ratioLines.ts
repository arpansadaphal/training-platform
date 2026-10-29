// packages/domain/src/copy/ratioLines.ts
//
// Plain lines for the "Cross-muscle balance" section. Display copy only: it states the weekly hard-set totals
// the engine counted (analysis/ratios.ts) and their ratio. It does not grade them, name a cause or say what
// they mean for the lifter (invariants 9 and 10): "you press 22 sets and pull 17" is a fact, "your shoulders
// are at risk" would be a diagnosis.

import type { CrossMuscleRatios } from "../analysis/types";

export const RATIO_TIER_NOTE =
  "Tier 3: a coaching comparison, not a measured threshold. It is informational and is not part of the Fit band.";

const num = (n: number): string => String(Math.round(n * 10) / 10);
const setsText = (n: number): string => `${num(n)} hard ${n === 1 ? "set" : "sets"} a week`;

/** "2 to 1", "1 to 1.6", or "1 to 1" for two totals that are both above 0. */
function ratioText(a: number, b: number): string {
  if (!(a > 0) || !(b > 0)) return "";
  const r = a / b;
  if (Math.abs(r - 1) < 0.05) return "1 to 1";
  return r > 1 ? `${num(r)} to 1` : `1 to ${num(1 / r)}`;
}

function line(first: string, a: number, second: string, b: number, verb: string): string {
  const head =
    a > 0 && b > 0
      ? `${first} ${verb} ${setsText(a)} and ${second} ${verb} ${setsText(b)} (${ratioText(a, b)}).`
      : a > 0
        ? `${first} ${verb} ${setsText(a)} and ${second} ${verb} none.`
        : `${first} ${verb} none, and ${second} ${verb} ${setsText(b)}.`;
  return head;
}

/** One line per ratio that has anything to say, in a fixed order. Empty when the program has none. */
export function ratioLines(ratios: CrossMuscleRatios | undefined): string[] {
  if (!ratios) return [];
  const out: string[] = [];
  const pp = ratios.pushPull;
  if (pp) {
    out.push(
      pp.pullSets === 0
        ? `You press ${setsText(pp.pushSets)} and pull none.`
        : pp.pushSets === 0
          ? `You pull ${setsText(pp.pullSets)} and press none.`
          : `You press ${setsText(pp.pushSets)} and pull ${setsText(pp.pullSets)} (${ratioText(pp.pushSets, pp.pullSets)}).`,
    );
  }
  const al = ratios.armsLegs;
  if (al) out.push(line("Your arms", al.armSets, "your legs", al.legSets, "get"));
  const qh = ratios.quadsHamstrings;
  if (qh) out.push(line("Your quads", qh.quadSets, "your hamstrings", qh.hamstringSets, "get"));
  return out;
}
