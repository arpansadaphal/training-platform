// apps/web/components/assessment/AxisCard.tsx
//
// One axis row. The input is an `AssessedAxis`, not an `AnalysisAxisResult`:
// AssessedAxis.status is already narrowed to the BAND variant at the domain
// level (see packages/domain/src/assessment/types.ts), so this component can
// read `axis.status.band` directly without a defensive re-narrow. This is the
// payoff of ARCH-028 — the domain guarantees the shape, the UI trusts it.

import type { AssessedAxis } from "@training/domain";
import styles from "./assessment.module.css";

export type AxisCardVariant = "strength" | "attention" | "opportunity";

interface Props {
  axis: AssessedAxis;
  variant: AxisCardVariant;
}

function axisLabel(axis: AssessedAxis): string {
  // scopeKey is an internal identifier (muscle group id at MVP). Human-
  // readable names would require a lookup table threaded through from the
  // RSC page — deferred to Phase 7's Review screen where the assessment is
  // rendered with full page context. Here we show type + scope as-is.
  return axis.scopeKey ? `${axis.axisType} · ${axis.scopeKey}` : axis.axisType;
}

export function AxisCard({ axis, variant }: Props) {
  return (
    <div className={`${styles.axisCard} ${styles[`variant_${variant}`]}`}>
      <div className={styles.axisCardHeader}>
        <span className={styles.axisLabel}>{axisLabel(axis)}</span>
        <span className={styles.axisBand}>{axis.status.band}</span>
      </div>
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
    </div>
  );
}