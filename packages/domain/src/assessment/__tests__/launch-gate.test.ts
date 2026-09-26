// packages/domain/src/assessment/__tests__/launch-gate.test.ts
//
// Tests the launch gate's four required cases (Q6 confirmation):
//
//   1. production + unvalidated profile   -> throws
//   2. production + all-validated profile -> does NOT throw
//   3. preview                            -> does NOT throw
//   4. development                        -> does NOT throw
//
// Uses InMemoryGoalProfileRegistry for the "all-validated" case so the
// test does not depend on a future Strength profile's existence. The
// "unvalidated" case uses the shipped singleton registry, which contains
// HYPERTROPHY with validated: false.

import { describe, expect, it } from "vitest";
import { InMemoryGoalProfileRegistry } from "../../goal-profiles/registry";
import { goalProfileRegistry } from "../../goal-profiles/registry";
import type { GoalProfileDefinition } from "../../goal-profiles/types";
import {
  PRODUCTION_ENV,
  assertNoUnvalidatedProfilesInProduction,
} from "../launchGate";
import { workedExampleConfig } from "../__fixtures__/workedExample";

// A validated profile, using the worked-example fixture's config
// (validated: true) so loadConfig() returns a well-formed config.
const validatedProfile: GoalProfileDefinition = {
  key: "TEST_VALIDATED",
  relevantAxes: [],
  loadConfig: () => workedExampleConfig,
};

function makeValidatedRegistry(): InMemoryGoalProfileRegistry {
  const r = new InMemoryGoalProfileRegistry();
  r.register(validatedProfile);
  return r;
}

describe("assertNoUnvalidatedProfilesInProduction", () => {
  it("throws in production when any registered profile is unvalidated", () => {
    expect(() =>
      assertNoUnvalidatedProfilesInProduction(PRODUCTION_ENV, goalProfileRegistry),
    ).toThrow(/Launch gate failed/);
  });

  it("names the offending profile key(s) in the error message", () => {
    expect(() =>
      assertNoUnvalidatedProfilesInProduction(PRODUCTION_ENV, goalProfileRegistry),
    ).toThrow(/HYPERTROPHY/);
  });

  it("does NOT throw in production when every registered profile is validated", () => {
    expect(() =>
      assertNoUnvalidatedProfilesInProduction(PRODUCTION_ENV, makeValidatedRegistry()),
    ).not.toThrow();
  });

  it("does NOT throw in preview regardless of profile validation status", () => {
    expect(() =>
      assertNoUnvalidatedProfilesInProduction("preview", goalProfileRegistry),
    ).not.toThrow();
  });

  it("does NOT throw in development regardless of profile validation status", () => {
    expect(() =>
      assertNoUnvalidatedProfilesInProduction("development", goalProfileRegistry),
    ).not.toThrow();
  });

  it("PRODUCTION_ENV is the literal string \"production\"", () => {
    expect(PRODUCTION_ENV).toBe("production");
  });
});