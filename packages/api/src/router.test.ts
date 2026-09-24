import { describe, it, expect } from "vitest";
import { appRouter } from "./router";

/**
 * Phase 0's trivial pipeline test for @training/api.
 *
 * Exercises the router's contract WITHOUT touching Postgres:
 *  - an unauthenticated caller must be rejected by protectedProcedure,
 *    before any DB access happens.
 * This is real behavior, not a stub assertion, and it doesn't need a
 * database.
 */
describe("@training/api appRouter", () => {
  it("exposes the user router with a getSelf procedure", () => {
    expect(appRouter.user.getSelf).toBeDefined();
  });

  it("rejects unauthenticated callers of user.getSelf before touching the DB", async () => {
    const caller = appRouter.createCaller({ user: null });
    await expect(caller.user.getSelf()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});