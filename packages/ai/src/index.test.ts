import { describe, it, expect } from "vitest";
import { AI_PACKAGE_VERSION, domainVersionSeenFromAi } from "./index";

describe("@training/ai", () => {
  it("exports a version marker", () => {
    expect(AI_PACKAGE_VERSION).toBe("0.0.0");
  });

  it("can import from @training/domain", () => {
    expect(domainVersionSeenFromAi()).toBe("0.0.0");
  });
});