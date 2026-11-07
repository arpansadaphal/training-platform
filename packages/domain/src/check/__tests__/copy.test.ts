import { describe, expect, it } from "vitest";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";
import { CHECK_PRESETS } from "../presets";
import { allCheckCopy, CHECK_COPY } from "../copy";
import { ratioLines } from "../../copy/ratioLines";
import { HYPERTROPHY_CONFIG } from "../../goal-profiles/hypertrophy";

describe("Program Checker copy", () => {
  it("passes FORBIDDEN_COPY_PATTERNS", () => {
    const lines = allCheckCopy();
    expect(lines.length).toBeGreaterThan(40);
    expect(() => assertCleanCopy(lines)).not.toThrow();
  });

  it("keeps the preset titles and blurbs clean too", () => {
    expect(() => assertCleanCopy(CHECK_PRESETS.flatMap((p) => [p.title, p.blurb]))).not.toThrow();
  });

  // ARCH-067 / Fix 2. The example on /check is static text, so it is held to what the real product would print:
  // the status is the band the profile gives that number, the pattern count is the profile's own, and the balance
  // line is the one ratioLines writes for those totals.
  describe("the example assessment on /check", () => {
    const [volume, selection] = CHECK_COPY.previewCards;
    const bandOf = (axis: "VOLUME" | "EXERCISE_SELECTION_BALANCE", value: number) =>
      HYPERTROPHY_CONFIG.statusBands[axis].find(
        (b) => (b.lowerBound === null || value >= b.lowerBound) && (b.upperBound === null || value < b.upperBound),
      )?.status;

    it("Chest at 14 hard sets a week is Adequate", () => {
      expect(volume!.detail).toBe("14 hard sets / week");
      expect(bandOf("VOLUME", 14)).toBe(volume!.status);
    });

    it("6 of 6 patterns is the profile's required set and reads Balanced", () => {
      expect(HYPERTROPHY_CONFIG.requiredMovementPatterns?.length).toBe(6);
      expect(selection!.detail).toBe("6 of 6 main movement patterns");
      expect(bandOf("EXERCISE_SELECTION_BALANCE", 6 / 6)).toBe(selection!.status);
    });

    it("the balance line is exactly what the product writes for 12 pressing and 10 pulling sets", () => {
      const lines = ratioLines({ pushPull: { pushSets: 12, pullSets: 10, ratio: 1.2 }, armsLegs: null, quadsHamstrings: null });
      expect(lines).toEqual([CHECK_COPY.previewBalance]);
    });
  });

  // ARCH-067 / Fix 4. About states what was tested and no more than the repo supports.
  describe("the About page claims", () => {
    const about = [CHECK_COPY.aboutWhat, CHECK_COPY.aboutIntro, CHECK_COPY.aboutReview, CHECK_COPY.aboutProvisional].join(" ");

    it("gives the numbers: 24 sample programs, 21 match, 3 documented exceptions", () => {
      expect(about).toMatch(/24 sample programs/);
      expect(about).toMatch(/21 match/);
      expect(about).toMatch(/3 are documented exceptions/);
    });

    it("does not say coaches reviewed the analysis, or say 'signed them off' a second time (the banner says it)", () => {
      expect(about).not.toMatch(/reviewed by|coaches reviewed|signed them off|human-validated/i);
    });

    it("is a prediction of what a coach would say, not what coaches said", () => {
      expect(CHECK_COPY.aboutIntro).toMatch(/our prediction of what a strength coach would say/);
    });
  });

  it("rejects what the lint is meant to catch (guards the guard)", () => {
    expect(() => assertCleanCopy(["This will build muscle"])).toThrow();
    expect(() => assertCleanCopy(["Check your form"])).toThrow();
  });
});
