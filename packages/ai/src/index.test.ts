import { describe, it, expect } from "vitest";
import { AI_PACKAGE_VERSION } from "./index";

describe("@training/ai", () => {
  it("exports a version marker", () => {
    expect(AI_PACKAGE_VERSION).toBe("0.0.0");
  });
});