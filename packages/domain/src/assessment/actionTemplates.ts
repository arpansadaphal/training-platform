// packages/domain/src/assessment/actionTemplates.ts
//
// Deterministic, template-based Action descriptions — NOT AI-authored.
// (06-assessment-engine.md step 7: "templates keyed by
// (axisType, status, goalProfileKey), not AI-authored.") The AI Coach may
// rephrase these in conversation (L0), but it never originates the
// underlying suggestion; see 10-ai-coach-architecture.md.
//
// Each template returns a `description` and a `rootCauseKey`. Two actions
// with the same `rootCauseKey` deduplicate into one (see computeAssessment).
//
// rootCauseKey format: `<axisType>:<verb>-<target>` — e.g.
// `volume:add-chest`. The `<axisType>` prefix is the *conceptual owner* of
// the root cause, not necessarily the source axis. A frequency-side fix for
// a volume problem deliberately emits a `volume:`-prefixed key so the two
// dedupe. Phase 4's MutationSpec will map from these keys.
//
// PROVISIONAL wording: descriptions are illustrative, not validated. When
// the AxisWeight / band content lands from sports science, the wording may
// be revised too. The rootCauseKey format is stable; it is the bridge to
// Phase 4.

import type { AssessedAxis } from "./types";

export interface ActionTemplateResult {
  readonly description: string;
  readonly rootCauseKey: string;
}

/**
 * Look up a template for one assessed axis. Returns `null` when there is no
 * template for the (axisType, band, goalProfileKey) triple — the axis was
 * still assessed, but the engine has nothing to recommend for it, so it
 * contributes no ActionSuggestion. `null` is not an error.
 */
export function actionTemplateFor(
  axis: AssessedAxis,
  goalProfileKey: string,
): ActionTemplateResult | null {
  const band = axis.status.band;
  const scope = axis.scopeKey ?? "overall";

  // Only HYPERTROPHY is registered today (Phase 3). Future profiles add
  // their own branch here; the switch is deliberately explicit rather than
  // a lookup table so a missing branch is a compile-time exhaustiveness
  // reminder when a new goal profile lands.
  if (goalProfileKey === "HYPERTROPHY") {
    switch (axis.axisType) {
      case "VOLUME": {
        if (band === "Low") {
          return {
            description: `Add weekly volume for ${scope}.`,
            rootCauseKey: `volume:add-${scope}`,
          };
        }
        if (band === "High") {
          return {
            description: `Trim marginal sets for ${scope}; the surplus is unlikely to add adaptation.`,
            rootCauseKey: `volume:trim-${scope}`,
          };
        }
        if (band === "Excessive") {
          return {
            description: `Reduce weekly volume for ${scope}.`,
            rootCauseKey: `volume:reduce-${scope}`,
          };
        }
        return null;
      }

      case "FREQUENCY": {
                if (band === "Low") {
          // E6: Low now means the weekly dose is spread over too few sessions (or the muscle has no real
          // exposure). The key is no longer shared with VOLUME x Low, so the two actions do not dedupe.
          const noExposure = typeof axis.metricValue === "number" && axis.metricValue === 0;
          return {
            description: noExposure
              ? `Give ${scope} at least one session with two or more hard sets.`
              : `Split ${scope} across more training days so no session carries more than about ten sets.`,
            rootCauseKey: `frequency:split-${scope}`,
          };
        }
        if (band === "High") {
          return {
            description: `Reduce the number of ${scope}-focused days per week.`,
            rootCauseKey: `frequency:reduce-${scope}`,
          };
        }
        return null;
      }

      case "EXERCISE_SELECTION_BALANCE": {
        if (band === "Gaps present") {
          return {
            description: `Fill movement-pattern gaps in the current split.`,
            rootCauseKey: `exerciseSelectionBalance:fill-gaps`,
          };
        }
        return null;
      }

      case "PROGRESSION_SOUNDNESS": {
        if (band === "Issue found") {
          return {
            description: `Align progression schemes across prescriptions.`,
            rootCauseKey: `progressionSoundness:align-schemes`,
          };
        }
        return null;
      }

      case "RECOVERY_COST": {
        if (band === "Moderate") {
          return {
            description: `Monitor recovery; no structural change required yet.`,
            rootCauseKey: `recoveryCost:monitor`,
          };
        }
        if (band === "High") {
          return {
            description: `Trim intensity on the highest-fatigue days.`,
            rootCauseKey: `recoveryCost:trim-intensity`,
          };
        }
        if (band === "Excessive") {
          return {
            description: `Reduce weekly intensity or insert a deload day.`,
            rootCauseKey: `recoveryCost:reduce-intensity`,
          };
        }
        return null;
      }
    }
  }

  return null;
}