// packages/domain/src/analysis/__tests__/configValidation.test.ts
//
// Acceptance-criteria check (phase-02-analysis-engine.md):
//   "No test or source file in this phase contains a plausible-looking numeric
//    threshold presented as validated."
//
// Every export from __fixtures__/testGoalProfiles.ts that looks like a
// GoalProfileConfig must have `validated: false`. If a future contributor
// adds a fixture with `validated: true`, this test fails.

import { describe, expect, it } from "vitest";
import * as fixtures from "../__fixtures__/testGoalProfiles";
import type { GoalProfileConfig } from "../types";

function isGoalProfileConfig(value: unknown): value is GoalProfileConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    "goalProfileKey" in value &&
    "statusBands" in value &&
    "validated" in value
  );
}

describe("test-only GoalProfileConfig fixtures", () => {
  const configs = Object.entries(fixtures).filter(
    (entry): entry is [string, GoalProfileConfig] => isGoalProfileConfig(entry[1]),
  );

  it("exposes at least one fixture config", () => {
    expect(configs.length).toBeGreaterThan(0);
  });

  it.each(configs)("%s has validated: false", (_name, config) => {
    expect(config.validated).toBe(false);
  });
});