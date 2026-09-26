// packages/domain/src/assessment/version.ts
/**
 * Version of the assessment computation pipeline.
 *
 * Bump on ANY change that could alter an Assessment output for the same input:
 * band resolution logic, severity mapping, leverage roll-up, Fit Score
 * projection, action templates. Persisted into AssessmentSnapshot.engineVersion
 * (see 04-database-schema.md) so a historical snapshot can be traced to the
 * exact code that produced it.
 *
 * Semver:
 *   - MAJOR: a change that invalidates the meaning of a prior snapshot.
 *   - MINOR: new capability without invalidating prior snapshots.
 *   - PATCH: bug fix that changes output but preserves meaning.
 *
 * Starts at 0.x because thresholds remain unvalidated ([SCIENTIFIC INPUT
 * REQUIRED] per 00-product-freeze-reference.md). 1.0.0 lands when a validated
 * GoalProfileDefinition ships.
 */
export const ASSESSMENT_ENGINE_VERSION = "0.1.0" as const;