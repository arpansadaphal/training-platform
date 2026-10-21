// packages/domain/src/goal-profiles/evidence.ts
//
// ARCH-054: evidence-tier vocabulary shared by every goal profile and every surface that shows it.
//
// The four tiers are the ones hypertrophy.ts has used in its comments since Phase 10.2. This file only
// names them for display: what each tier means, and what it does NOT mean. It grades nothing. A profile
// assigns tiers to its own claims (see HYPERTROPHY_EVIDENCE); nothing here may promote one.
//
// "Evidence-graded" is not "validated". `GoalProfileConfig.validated` still means "no human expert has
// signed this profile off end to end" and still gates production through the launch gate.

import type {
  AxisEvidence,
  EvidenceTier,
  EvidenceTierRange,
  GoalProfileEvidence,
} from "../analysis/types";

export interface EvidenceTierDefinition {
  readonly tier: EvidenceTier;
  readonly name: string;
  /** One sentence: what a claim at this tier rests on. */
  readonly meaning: string;
  /** One sentence: what a claim at this tier is NOT. */
  readonly notThis: string;
}

export const EVIDENCE_TIER_DEFINITIONS: Readonly<Record<EvidenceTier, EvidenceTierDefinition>> = {
  1: {
    tier: 1,
    name: "Direct research",
    meaning: "Rests on RCTs, meta-analyses or consensus statements.",
    notThis:
      "Not a guarantee for any one lifter: research describes average responses across groups.",
  },
  2: {
    tier: 2,
    name: "Research-informed synthesis",
    meaning: "An engine boundary derived from several research findings.",
    notThis:
      "The direction is well-supported; the exact boundary is our judgment, not a number a study measured.",
  },
  3: {
    tier: 3,
    name: "Expert / coaching heuristic",
    meaning: "Reflects common coaching practice and expert opinion.",
    notThis: "Not directly tested in controlled research; reasonable coaches disagree on it.",
  },
  4: {
    tier: 4,
    name: "Engine-derived",
    meaning: "A model parameter chosen so the engine behaves consistently.",
    notThis: "Not a scientific measurement: a product decision that can change with calibration.",
  },
};

/** "Tier 2" or "Tier 3–4". */
export function formatTierRange(range: EvidenceTierRange): string {
  return range.from === range.to ? `Tier ${range.from}` : `Tier ${range.from}–${range.to}`;
}

/** Every tier the range covers, strongest first. */
export function tiersIn(range: EvidenceTierRange): EvidenceTier[] {
  const tiers: EvidenceTier[] = [];
  for (let t = range.from; t <= range.to; t++) tiers.push(t as EvidenceTier);
  return tiers;
}

/** Distinct sources across an axis's claims, in first-cited order. */
export function primarySources(evidence: AxisEvidence): string[] {
  const seen = new Set<string>();
  for (const claim of evidence.claims) {
    for (const source of claim.sources) seen.add(source);
  }
  return [...seen];
}

/** The strongest and weakest threshold tiers across a profile's axes, for a one-line summary. */
export function thresholdTierSpan(evidence: GoalProfileEvidence): EvidenceTierRange {
  const ranges = Object.values(evidence.axes).map((axis) => axis.thresholdTier);
  let from: EvidenceTier = 4;
  let to: EvidenceTier = 1;
  for (const range of ranges) {
    if (range.from < from) from = range.from;
    if (range.to > to) to = range.to;
  }
  return { from, to };
}
