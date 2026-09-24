import { describe, it, expect } from "vitest";
import { DOMAIN_PACKAGE_VERSION } from "./index";

describe("@training/domain", () => {
  it("exports a version marker", () => {
    expect(DOMAIN_PACKAGE_VERSION).toBe("0.0.0");
  });
});