// packages/domain/src/goal-profiles/registry.ts
//
// In-memory goal-profile registry.
//
// Phase 3 exports the class (`InMemoryGoalProfileRegistry`) so `packages/api`
// services and Phase-3 tests can construct a fresh registry seeded with a
// fixture profile without mutating the singleton below. The singleton
// registers exactly one profile: HYPERTROPHY (unvalidated).
//
// Phase 2 shipped this class privately; Phase 3 makes it public so the
// worked-example test can register a fixture profile alongside — or instead
// of — the shipped one. The interface itself is unchanged.

import type { GoalProfileDefinition, GoalProfileRegistry } from "./types";
import { hypertrophyProfile } from "./hypertrophy";

export class InMemoryGoalProfileRegistry implements GoalProfileRegistry {
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