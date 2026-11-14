import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_COPY_PATTERNS, assertCleanCopy } from "./forbiddenCopy";

const medical = FORBIDDEN_COPY_PATTERNS.find((p) => p.name === "medical claim")!;

describe("forbidden-copy lint: medical claim", () => {
  // The first version ended the stems with \b, so "injur" matched only the
  // bare stem and "injury" / "diagnosis" slipped through.
  it.each([
    "diagnose",
    "diagnosis",
    "diagnosed",
    "injury",
    "injuries",
    "injured",
    "rehab",
    "rehabilitation",
    "treatment",
    "Prevents injury",
    "A diagnosis of tendinitis",
  ])("rejects %s", (text) => {
    expect(medical.re.test(text)).toBe(true);
    expect(() => assertCleanCopy([text])).toThrow(/medical claim/);
  });

  it.each(["Chest 12 sets a week", "Bench press, 3 sets of 8", "Add a pulling exercise"])(
    "allows %s",
    (text) => {
      expect(medical.re.test(text)).toBe(false);
    },
  );

  // blockReport.test.ts keeps a hand-copied list. Both lists were wrong together
  // once, so the two literals must stay identical.
  it("matches the medical pattern in the Block Report test's copy of the list", () => {
    const file = resolve(__dirname, "../../../../api/src/services/blockReport.test.ts");
    expect(readFileSync(file, "utf8")).toContain(String(medical.re));
  });
});
