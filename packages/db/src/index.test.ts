import { describe, it, expect } from "vitest";

/**
 * Phase 0's trivial pipeline test for @training/db.
 *
 * Deliberately does NOT touch Postgres — CI has no live database at this
 * phase, and 02-system-architecture.md's three-layer rule means business
 * logic tests never need one. Repository functions get real integration
 * coverage in the phase that first needs them.
 */
describe("@training/db", () => {
  it("module loads and exposes the expected exports", async () => {
    const mod = await import("./index.js");
    expect(typeof mod.createUser).toBe("function");
    expect(typeof mod.findUserById).toBe("function");
    expect(typeof mod.findUserByEmailWithHash).toBe("function");
  });
});