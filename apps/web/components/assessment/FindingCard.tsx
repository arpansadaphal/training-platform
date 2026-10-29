// apps/web/components/assessment/FindingCard.tsx
//
// ARCH-063 / B2: one card per finding. A single-axis finding is the AxisCard it always was. A REGION or PATTERN
// finding says one problem once ("No lower-body training: quads, hamstrings, glutes and calves get 0 hard sets a
// week.") and keeps the members' numbers one click away under "Details". Display only: it reads a finding the
// engine already produced and computes no band, severity or leverage.

import { HYPERTROPHY_CONFIG, findingSentence, type AssessmentFinding } from "@training/domain";
import { AxisCard, type AxisCardVariant } from "./AxisCard";
import { findingBandLabel, findingLabel } from "./labels";
import styles from "./assessment.module.css";

interface Props {
  finding: AssessmentFinding;
  variant: AxisCardVariant;
}

function num(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function FindingCard({ finding, variant }: Props) {
  if (finding.kind === "AXIS") return <AxisCard axis={finding.lead} variant={variant} />;

  const sentence = findingSentence(finding, HYPERTROPHY_CONFIG);
  return (
    <div
      className={`${styles.axisCard} ${styles[`variant_${variant}`]}`}
      data-finding={finding.key}
    >
      <div className={styles.axisCardHeader}>
        <span className={styles.axisLabel}>{findingLabel(finding)}</span>
        <span className={styles.axisBand}>{findingBandLabel(finding)}</span>
      </div>
      {sentence !== null ? <p className={styles.axisSentence}>{sentence}</p> : null}
      <details className={styles.details}>
        <summary>Details</summary>
        <dl className={styles.axisMeta}>
          {finding.members.map((member) => (
            <div key={member.muscle}>
              <dt>{member.muscle}</dt>
              <dd>{num(member.sets)} hard sets / week</dd>
            </div>
          ))}
          <div>
            <dt>Severity</dt>
            <dd>{finding.lead.severity}</dd>
          </div>
          <div>
            <dt>Leverage</dt>
            <dd>{finding.lead.leverage}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
