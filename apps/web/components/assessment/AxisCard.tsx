// apps/web/components/assessment/AxisCard.tsx
//
// One axis row. The input is an `AssessedAxis`, not an `AnalysisAxisResult`:
// AssessedAxis.status is already narrowed to the BAND variant at the domain
// level (see packages/domain/src/assessment/types.ts), so this component can
// read `axis.status.band` directly without a defensive re-narrow. This is the
// payoff of ARCH-028 — the domain guarantees the shape, the UI trusts it.
//
// Phase A: the card leads with words ("Weekly volume · Chest", "6 hard sets /
// week", one line on what the band means). The engine's own values (raw
// metric, weight, severity, leverage) stay one click away under "Details".
//
// Phase A3a.1: volume and frequency findings open with one plain sentence
// (domain/copy/axisSentence) that says where the number sits against the
// profile's range. It replaces the generic "what the band means" line for
// those two axes; the numbers stay visible under it.

import { HYPERTROPHY_CONFIG, axisSentence, type AssessedAxis } from "@training/domain";
import { axisLabel, meaningText, metricText } from "./labels";
import styles from "./assessment.module.css";

export type AxisCardVariant = "strength" | "attention" | "opportunity";

interface Props {
  axis: AssessedAxis;
  variant: AxisCardVariant;
  /**
   * A finding's own leading sentence (ARCH-063 / B3: which effort checks failed), used in place of the
   * band-level one when the engine produced it.
   */
  sentence?: string | null;
  /** ARCH-065 / Fix 3a: a second sentence under the first (which muscles are behind a whole-program finding). */
  detail?: string | null;
  /**
   * ARCH-065 / Fix 6. The public checker: no engine table. "Metric 6 / Weight HIGH / Severity NONE / Leverage NONE" tells
   * a lifter nothing, and the card already says the number in words. Every other surface keeps its Details.
   */
  plain?: boolean;
}

export function AxisCard({ axis, variant, sentence: given, detail, plain }: Props) {
  const sentence = given ?? axisSentence(axis, HYPERTROPHY_CONFIG.statusBands[axis.axisType] ?? []);
  const meaning = sentence === null ? meaningText(axis) : "";
  return (
    <div className={`${styles.axisCard} ${styles[`variant_${variant}`]}`}>
      <div className={styles.axisCardHeader}>
        <span className={styles.axisLabel}>{axisLabel(axis)}</span>
        <span className={styles.axisBand}>{axis.status.band}</span>
      </div>
      {sentence !== null ? <p className={styles.axisSentence}>{sentence}</p> : null}
      {detail ? <p className={styles.axisSentence}>{detail}</p> : null}
      <p className={styles.axisMetric}>{metricText(axis)}</p>
      {meaning ? <p className={styles.axisMeaning}>{meaning}</p> : null}
      {plain ? null : (
        <details className={styles.details}>
          <summary>Details</summary>
          <dl className={styles.axisMeta}>
            <div>
              <dt>Metric</dt>
              <dd>{String(axis.metricValue)}</dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>{axis.weight}</dd>
            </div>
            <div>
              <dt>Severity</dt>
              <dd>{axis.severity}</dd>
            </div>
            <div>
              <dt>Leverage</dt>
              <dd>{axis.leverage}</dd>
            </div>
          </dl>
        </details>
      )}
    </div>
  );
}
