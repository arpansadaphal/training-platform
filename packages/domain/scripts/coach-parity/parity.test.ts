// Coach-parity: the matcher's rules, the expected-headline table, and a ratchet on the exact set of passing
// programs. The ratchet is the point: it moves only by a deliberate edit here, alongside the engine change that
// moved it. Never loosen the matcher to turn a FAIL into a PASS; if a fail is not the engine's fault, say so in
// the handoff (ARCH-063).
import { describe, expect, it } from "vitest";
import type { AssessedAxis } from "../../src/assessment/types";
import { EXPECTED_HEADLINES } from "./expected";
import {
  directionSatisfies,
  headlineOf,
  isKnownSubject,
  matchHeadline,
  type ExpectedMatch,
  type Headline,
} from "./matcher";
import { scoreAll } from "./parity";

const axis = (over: Partial<AssessedAxis> & Pick<AssessedAxis, "axisType">): AssessedAxis => ({
  scopeKey: null,
  metricValue: 0,
  status: { kind: "BAND", band: "Low" },
  severity: "MAJOR",
  weight: "HIGH",
  leverage: "HIGH",
  ...over,
});

const volumeLow = (muscle: string, value: number): AssessedAxis =>
  axis({ axisType: "VOLUME", scopeKey: muscle, metricValue: value });

const exp = (subject: string, direction: ExpectedMatch["direction"]): ExpectedMatch => ({ subject, direction });
const EMPTY: Headline = { source: "none", label: "", subjects: [] };

describe("matcher rules", () => {
  it("expected `none` passes only on an empty headline", () => {
    expect(matchHeadline([exp("none", "none")], EMPTY).pass).toBe(true);
    expect(matchHeadline([exp("none", "none")], EMPTY).kind).toBe("empty");
    const withFinding = headlineOf({ biggestOpportunity: volumeLow("calves", 4) });
    expect(matchHeadline([exp("none", "none")], withFinding).pass).toBe(false);
  });

  it("a substantive expectation FAILS on an empty headline (zero findings is not a free pass)", () => {
    const b = EXPECTED_HEADLINES.find((e) => e.id === "B");
    expect(b?.match.some((m) => m.subject === "none")).toBe(false);
    expect(matchHeadline(b?.match ?? [], EMPTY).pass).toBe(false);
  });

  it("expected `low` accepts a computed `missing`; `missing` and `high` need an exact direction", () => {
    expect(directionSatisfies("low", "missing")).toBe(true);
    expect(directionSatisfies("low", "low")).toBe(true);
    expect(directionSatisfies("missing", "low")).toBe(false);
    expect(directionSatisfies("high", "low")).toBe(false);
    expect(directionSatisfies("high", "missing")).toBe(false);
  });

  it("the right subject in the wrong direction fails", () => {
    const high = headlineOf({ biggestOpportunity: axis({ axisType: "VOLUME", scopeKey: "biceps", metricValue: 36, status: { kind: "BAND", band: "Excessive" } }) });
    expect(matchHeadline([exp("muscle:biceps", "low")], high).pass).toBe(false);
    expect(matchHeadline([exp("muscle:biceps", "high")], high).pass).toBe(true);
  });

  it("containment is one-way: 'lats volume is low' does not satisfy pattern:pull", () => {
    const lats = headlineOf({ biggestOpportunity: volumeLow("lats", 0) });
    expect(matchHeadline([exp("pattern:pull", "missing")], lats).pass).toBe(false);
    expect(matchHeadline([exp("muscle:lats", "missing")], lats).pass).toBe(true);
  });

  it("a lead match is reported ahead of a contained one", () => {
    const headline: Headline = {
      source: "finding",
      label: "REGION:lower",
      subjects: [
        { subject: "muscle:hamstrings", direction: "low", via: "member" },
        { subject: "muscle:calves", direction: "missing", via: "lead" },
      ],
    };
    const both = matchHeadline([exp("muscle:hamstrings", "low"), exp("muscle:calves", "missing")], headline);
    expect(both.kind).toBe("lead");
    const memberOnly = matchHeadline([exp("muscle:hamstrings", "low")], headline);
    expect(memberOnly.kind).toBe("contained");
  });

  it("a PROGRESSION headline with no per-check facts names no check, so it cannot match one", () => {
    const ps = headlineOf({
      biggestOpportunity: axis({ axisType: "PROGRESSION_SOUNDNESS", metricValue: 1, status: { kind: "BAND", band: "Issue found" } }),
    });
    expect(ps.subjects.map((s) => s.subject)).toEqual(["check:unspecified"]);
    expect(matchHeadline([exp("check:effort-defined", "low")], ps).pass).toBe(false);
  });
});

describe("expected headlines", () => {
  it("covers exactly the 25 programs the audit scored", () => {
    expect(EXPECTED_HEADLINES).toHaveLength(25);
    expect(new Set(EXPECTED_HEADLINES.map((e) => e.id)).size).toBe(25);
    expect(EXPECTED_HEADLINES.map((e) => e.id)).not.toContain("P2-noRPE");
  });

  it("every entry has a headline, a note, a rationale and a non-empty match", () => {
    for (const e of EXPECTED_HEADLINES) {
      expect(e.expectedHeadline.length, e.id).toBeGreaterThan(0);
      expect(e.note, e.id).toMatch(/awaiting real coach review/);
      expect(e.rationale.length, e.id).toBeGreaterThan(0);
      expect(e.match.length, e.id).toBeGreaterThan(0);
    }
  });

  it("every subject is in the closed vocabulary, and `none` stands alone", () => {
    for (const e of EXPECTED_HEADLINES) {
      for (const m of e.match) expect(isKnownSubject(m.subject), `${e.id}: ${m.subject}`).toBe(true);
      if (e.match.some((m) => m.subject === "none")) expect(e.match, e.id).toHaveLength(1);
    }
  });

  it("only E, S7, PPLx3 and PPLx6 expect `none`", () => {
    const none = EXPECTED_HEADLINES.filter((e) => e.match.some((m) => m.subject === "none")).map((e) => e.id);
    expect(none.sort()).toEqual(["E", "PPLx3", "PPLx6", "S7"]);
  });
});

describe("coach parity ratchet", () => {
  const score = scoreAll();
  const passing = (): string[] => score.rows.filter((r) => r.result.pass).map((r) => r.expected.id).sort();
  const contained = (): string[] =>
    score.rows.filter((r) => r.result.kind === "contained").map((r) => r.expected.id).sort();

  // Moves only with an engine change. Part 0 baseline (the 2026-10-28 engine): D, E, P1, PPLx6, S2, S3.
  // After B1 (rank by deficit): + P3, S6, S6b.
  const PINNED_PASSING = ["D", "E", "P1", "P3", "PPLx6", "S2", "S3", "S6", "S6b"];
  const PINNED_CONTAINED: string[] = [];

  it("the passing set is exactly the pinned set", () => {
    expect(passing()).toEqual(PINNED_PASSING);
    expect(score.passed).toBe(PINNED_PASSING.length);
    expect(score.total).toBe(25);
  });

  it("the contained (not a direct hit) set is exactly the pinned set", () => {
    expect(contained()).toEqual(PINNED_CONTAINED);
  });

  it("a program passes with no finding at all only when the coach found nothing to fix", () => {
    for (const r of score.rows) {
      if (r.headline.source === "none" && r.result.pass) {
        expect(r.expected.match.map((m) => m.subject), r.expected.id).toEqual(["none"]);
      }
    }
  });
});
