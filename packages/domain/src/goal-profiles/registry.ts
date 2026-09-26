// packages/domain/src/goal-profiles/registry.ts
//
// Minimal in-memory registry stub. Phase 2 registers exactly one profile
// (HYPERTROPHY, unvalidated). Phase 3 will flesh out the roll-up side of the
// registry and the Strength profile; the interface is frozen here so adding
// a profile never requires touching the engine.

import type { GoalProfileDefinition, GoalProfileRegistry } from "./types";
import { hypertrophyProfile } from "./hypertrophy";

class InMemoryGoalProfileRegistry implements GoalProfileRegistry {
  private readonly byKey = new Map<string, GoalProfileDefinition>();

  register(profile: GoalProfileDefinition): void {
    if (this.byKey.has(profile.key)) {
      throw new Error(`Goal profile already registered: ${profile.key}`);
    }
    this.byKey.set(profile.key, profile);
  }

  get(key: string): GoalProfileDefinition {
    const profile = this.byKey.get(key);
    if (!profile) throw new Error(`Unknown goal profile: ${key}`);
    return profile;
  }

  list(): readonly GoalProfileDefinition[] {
    return Array.from(this.byKey.values());
  }
}

export const goalProfileRegistry: GoalProfileRegistry = (() => {
  const r = new InMemoryGoalProfileRegistry();
  r.register(hypertrophyProfile);
  return r;
})();