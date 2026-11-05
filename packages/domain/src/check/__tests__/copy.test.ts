import { describe, expect, it } from "vitest";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";
import { CHECK_PRESETS } from "../presets";
import { allCheckCopy } from "../copy";

describe("Program Checker copy", () => {
  it("passes FORBIDDEN_COPY_PATTERNS", () => {
    const lines = allCheckCopy();
    expect(lines.length).toBeGreaterThan(40);
    expect(() => assertCleanCopy(lines)).not.toThrow();
  });

  it("keeps the preset titles and blurbs clean too", () => {
    expect(() => assertCleanCopy(CHECK_PRESETS.flatMap((p) => [p.title, p.blurb]))).not.toThrow();
  });

  it("rejects what the lint is meant to catch (guards the guard)", () => {
    expect(() => assertCleanCopy(["This will build muscle"])).toThrow();
    expect(() => assertCleanCopy(["Check your form"])).toThrow();
  });
});
