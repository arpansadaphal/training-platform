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
// the assessment is renderable at all. A caller that pre-unwraps the union
// would defeat the guarantee.

import type {
  AssessedAxis,
  AssessmentResult,
  FitScoreResult,
} from "@training/domain";
import { AxisCard } from "./AxisCard";
import { UnvalidatedState } from "./UnvalidatedState";
import styles from "./assessment.module.css";

interface Props {
  result: AssessmentResult;
  fitScore: FitScoreResult;
}

function axisKey(axis: AssessedAxis): string {
  return `${axis.axisType}:${axis.scopeKey ?? ""}`;
}

export function AssessmentDisplay({ result, fitScore }: Props) {
  // Per Q3: an UNVALIDATED assessment carries no classifications — the inner
  // Assessment's strengths/attention/opportunity/actions are empty/null by
  // domain contract (see packages/domain/src/assessment/computeAssessment.ts).
  // Rendering those empty lists would fabricate the appearance of "no
  // problems found." The honest surface is the reason string.
  if (result.kind === "UNVALIDATED") {
    return <UnvalidatedState reason={result.reason} />;
  }

  const a = result.assessment;

  return (
    <article className={styles.wrapper}>
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
    </article>
  );
}