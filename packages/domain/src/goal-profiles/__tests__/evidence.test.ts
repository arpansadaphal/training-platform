// packages/domain/src/goal-profiles/__tests__/evidence.test.ts
//
// ARCH-054: the shipped hypertrophy evidence block is complete, well-formed, and pinned. A change to any
// tier here is a regrade, which needs its own decision entry, so the snapshot of tiers is asserted.

import { describe, expect, it } from "vitest";
import type { AxisType, EvidenceTier } from "../../analysis/types";
import { HYPERTROPHY_CONFIG, hypertrophyProfile } from "../hypertrophy";
import {
  EVIDENCE_TIER_DEFINITIONS,
  formatTierRange,
  primarySources,
  thresholdTierSpan,
  tiersIn,
} from "../evidence";

const evidence = HYPERTROPHY_CONFIG.evidence;

describe("HYPERTROPHY evidence block", () => {
  it("exists and covers every relevant axis", () => {
    expect(evidence).toBeDefined();
    for (const axis of hypertrophyProfile.relevantAxes) {
      expect(evidence?.axes[axis].claims.length).toBeGreaterThan(0);
    }
  });

  it("uses well-formed tier ranges on every axis and claim", () => {
    const all = [...Object.values(evidence!.axes), evidence!.fitScoreProjection];
    for (const axis of all) {
      expect(axis.thresholdTier.from).toBeLessThanOrEqual(axis.thresholdTier.to);
      for (const claim of axis.claims) {
        expect(claim.tier.from).toBeLessThanOrEqual(claim.tier.to);
        expect([1, 2, 3, 4]).toContain(claim.tier.from);
        expect([1, 2, 3, 4]).toContain(claim.tier.to);
      }
    }
  });

  it("pins the threshold tiers restated from the config comments (no regrading)", () => {
    const tiers: Record<AxisType, string> = {
      VOLUME: "Tier 2–3",
      FREQUENCY: "Tier 4",
      EXERCISE_SELECTION_BALANCE: "Tier 3–4",
      PROGRESSION_SOUNDNESS: "Tier 3–4",
      RECOVERY_COST: "Tier 4",
    };
    for (const [axis, expected] of Object.entries(tiers) as [AxisType, string][]) {
      expect(formatTierRange(evidence!.axes[axis].thresholdTier)).toBe(expected);
    }
    expect(formatTierRange(evidence!.fitScoreProjection.thresholdTier)).toBe("Tier 4");
  });

  it("has no threshold at Tier 1: the strongest cutpoints are Tier 2", () => {
    expect(thresholdTierSpan(evidence!)).toEqual({ from: 2, to: 4 });
  });

  it("never describes itself as validated", () => {
    const text = JSON.stringify(evidence);
    expect(text).not.toMatch(/\bvalidated\b/i);
  });

  // ARCH-063 / B3: a new tier needs its own entry here; a regrade needs a decision entry, not a test edit.
  it("pins the near-failure claim: Tier 4, cited to Refalo 2023 and Robinson 2024", () => {
    const claim = evidence!.axes.PROGRESSION_SOUNDNESS.claims.find((c) => /0 reps in reserve/.test(c.claim));
    expect(claim).toBeDefined();
    expect(claim?.tier).toEqual({ from: 4, to: 4 });
    expect(claim?.sources).toEqual(["Robinson 2024", "Refalo 2023"]);
    // The check's cutpoint lives in the config, beside the claim that explains it.
    expect(HYPERTROPHY_CONFIG.progressionRules?.maxShareAtFailure).toBe(0.5);
  });

  it("pins the whole-pattern claim on Exercise selection: Tier 3, still a coaching heuristic", () => {
    const claim = evidence!.axes.EXERCISE_SELECTION_BALANCE.claims.find((c) => /whole movement group/.test(c.claim));
    expect(claim?.tier).toEqual({ from: 3, to: 3 });
    expect(claim?.sources).toEqual([]);
  });

  it("does not change the validated flag", () => {
    expect(HYPERTROPHY_CONFIG.validated).toBe(false);
  });
});

describe("evidence helpers", () => {
  it("formats single tiers and ranges", () => {
    expect(formatTierRange({ from: 2, to: 2 })).toBe("Tier 2");
    expect(formatTierRange({ from: 3, to: 4 })).toBe("Tier 3–4");
  });

  it("lists every tier in a range", () => {
    expect(tiersIn({ from: 2, to: 4 })).toEqual([2, 3, 4]);
  });

  it("collects distinct sources in first-cited order", () => {
    expect(primarySources(evidence!.axes.FREQUENCY)).toEqual([
      "Schoenfeld 2019",
      "Pelland et al., Sports Med 2026",
      "Remmert 2025 (preprint, not peer reviewed)",
    ]);
  });

  it("defines all four tiers, each with a meaning and a not-this", () => {
    for (const tier of [1, 2, 3, 4] as EvidenceTier[]) {
      expect(EVIDENCE_TIER_DEFINITIONS[tier].meaning.length).toBeGreaterThan(0);
      expect(EVIDENCE_TIER_DEFINITIONS[tier].notThis.length).toBeGreaterThan(0);
    }
  });
});
