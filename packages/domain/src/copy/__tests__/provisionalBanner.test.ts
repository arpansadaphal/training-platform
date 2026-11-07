import { describe, expect, it } from "vitest";
import { assertCleanCopy } from "../../progress/__tests__/forbiddenCopy";
import { PROVISIONAL_BANNER_BODY, PROVISIONAL_BANNER_LEAD } from "../provisionalBanner";

describe("provisional banner copy (ARCH-065 / D3)", () => {
  it("passes the forbidden-copy lint", () => {
    assertCleanCopy([`${PROVISIONAL_BANNER_LEAD} ${PROVISIONAL_BANNER_BODY}`]);
  });

  it("still says the thresholds are not signed off, and never claims validation (ARCH-046)", () => {
    const text = `${PROVISIONAL_BANNER_LEAD} ${PROVISIONAL_BANNER_BODY}`;
    expect(text).toMatch(/no expert has signed them off yet/);
    expect(text).not.toMatch(/\bvalidated\b/i);
    expect(text).toMatch(/^Provisional:/);
  });
});
