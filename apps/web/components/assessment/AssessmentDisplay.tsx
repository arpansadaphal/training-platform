// apps/web/components/assessment/AssessmentDisplay.tsx
//
// The generic Assessment renderer, in the Final Freeze §9's fixed order:
// Overall → Strengths → Attention → Biggest Opportunity → Actions.
//
// Reused (not copied) by Phase 7's Review screen and Phase 8's Coach panel.
// Per 16-repository-structure.md's "no shared UI package" rule, those phases
// re-import this same component from apps/web; they do not extract it to a
// shared package. A future mobile app renders its own component against the
// same AssessmentResult type.
//
// The union narrowing happens here, once, at the top — the caller passes the
// raw AssessmentResult and FitScoreResult, and this component decides whether
// the assessment is renderable at all.
//
// ARCH-046: this component is also the ONLY place the provisional-
// thresholds banner is mounted. Every assessment surface in the app goes
// through here, so mounting the banner here means no surface can display
// an assessment without the disclaimer.
// scripts/check-provisional-banner.sh enforces the delegation rule
// structurally — a new component that imports AssessmentResult or
// FitScoreResult without going through this file fails CI.
//
// PHASE 10.2 (Option B): the meaning of `kind: "UNVALIDATED"` changed when
// the HYPERTROPHY config was populated. Before, UNVALIDATED meant the
// roll-up was BLOCKED — null weights, missing bands, no classification to
// show. Now, with the config populated but `validated: false`, the roll-up
// SUCCEEDS and the classification fields are populated. The UNVALIDATED
// kind now means "provisional", not "unavailable". This component renders
// the classification under the provisional banner when there is content to
// show, and falls back to the UnvalidatedState message only when the
// classification is genuinely empty (the roll-up-blocked case).

"use client";

import type {
  AssessedAxis,
  Assessment,
  AssessmentResult,
  FitScoreResult,
} from "@training/domain";
import { AxisCard } from "./AxisCard";
import { ProvisionalBanner } from "./ProvisionalBanner";
import { UnvalidatedState } from "./UnvalidatedState";
import { useProvisionalBanner } from "@/src/lib/provisionalBanner";
import styles from "./assessment.module.css";

interface Props {
  result: AssessmentResult;
  fitScore: FitScoreResult;
}

function axisKey(axis: AssessedAxis): string {
  return `${axis.axisType}:${axis.scopeKey ?? ""}`;
}

/**
 * Whether the inner Assessment has any content worth rendering.
 *
 * The discriminator between two very different states that both carry
 * `kind: "UNVALIDATED"`:
 *   - Populated-but-provisional (roll-up succeeded, config validated false):
 *     strengths / attentionAreas / biggestOpportunity / actions carry real
 *     content. Render it under the banner.
 *   - Genuinely blocked (roll-up failed): those four fields are empty/null
 *     by domain contract. Show the reason string instead.
 *
 * Known limitation: a program that legitimately has no findings at all
 * would take the fallback path. At MVP this does not occur — every
 * assessable program carries at least one strength (Adequate VOLUME axes
 * are strengths via strengthEligibleAxes). If it appears in practice,
 * refine the discriminator.
 */
function hasRenderableContent(a: Assessment): boolean {
  return (
    a.strengths.length > 0 ||
    a.attentionAreas.length > 0 ||
    a.biggestOpportunity !== null ||
    a.actions.length > 0
  );
}

export function AssessmentDisplay({ result, fitScore }: Props) {
  // ARCH-046: the banner is a property of the configuration, not of any
  // one assessment. `useProvisionalBanner` reads HYPERTROPHY_CONFIG's
  // `validated` flag and returns true while it is false — which, at MVP,
  // is always. When a validated config ships, the hook returns false and
  // the banner disappears from every surface at once.
  const provisional = useProvisionalBanner();
  const a = result.assessment;

  // Genuinely blocked: UNVALIDATED and no classification content.
  // Fall back to the reason string. This is the "roll-up could not
  // classify" state — null weights, missing bands, missing severity
  // mapping. There is nothing useful to render.
  if (result.kind === "UNVALIDATED" && !hasRenderableContent(a)) {
    return (
      <>
        {provisional ? <ProvisionalBanner /> : null}
        <UnvalidatedState reason={result.reason} />
      </>
    );
  }

  // Provisional-but-populated (or fully VALIDATED): render the
  // classification. When the result is UNVALIDATED, show the reason string
  // as a subordinate note so the user knows why the assessment is labeled
  // provisional.
  return (
    <article className={styles.wrapper}>
      {provisional ? <ProvisionalBanner /> : null}

      {result.kind === "UNVALIDATED" ? (
        <p className={styles.provisionalReason}>{result.reason}</p>
      ) : null}

      <AssessmentBody a={a} fitScore={fitScore} />
    </article>
  );
}

function AssessmentBody({
  a,
  fitScore,
}: {
  a: Assessment;
  fitScore: FitScoreResult;
}) {
  return (
    <>
      <section className={styles.overall}>
        <h2 className={styles.sectionHeading}>Overall</h2>
        <p className={styles.overallSummary}>{a.overallSummary}</p>
        {fitScore.kind === "VALIDATED" ? (
          <p className={styles.fitScore}>
            Fit Score:{" "}
            <span className={styles.fitScoreBand}>
              {fitScore.fitScore.band}
            </span>
          </p>
        ) : null}
      </section>

      {a.strengths.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Strengths</h2>
          <div className={styles.axisList}>
            {a.strengths.map((axis) => (
              <AxisCard
                key={axisKey(axis)}
                axis={axis}
                variant="strength"
              />
            ))}
          </div>
        </section>
      ) : null}

      {a.attentionAreas.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Attention areas</h2>
          <div className={styles.axisList}>
            {a.attentionAreas.map((axis) => (
              <AxisCard
                key={axisKey(axis)}
                axis={axis}
                variant="attention"
              />
            ))}
          </div>
        </section>
      ) : null}

      {a.biggestOpportunity ? (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Biggest Opportunity</h2>
          <AxisCard axis={a.biggestOpportunity} variant="opportunity" />
        </section>
      ) : null}

      {a.actions.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Actions</h2>
          <ul className={styles.actionList}>
            {a.actions.map((action) => (
              <li key={action.rootCauseKey} className={styles.actionItem}>
                <p className={styles.actionDescription}>
                  {action.description}
                </p>
                <p className={styles.actionRootCause}>
                  Root cause key: <code>{action.rootCauseKey}</code>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}