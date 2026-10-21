// apps/web/components/assessment/EvidencePanel.tsx
//
// ARCH-054: what each axis's thresholds rest on. Opened from "See evidence" on the provisional banner
// and on the provisional Fit line.
//
// A pure restatement of GoalProfileConfig.evidence: the tier the profile already assigns, the sources its
// comments cite, and the shared definition of what that tier means and does NOT mean. It grades nothing
// and never says "validated".

import {
  EVIDENCE_TIER_DEFINITIONS,
  HYPERTROPHY_CONFIG,
  formatTierRange,
  hypertrophyProfile,
  primarySources,
  thresholdTierSpan,
  tiersIn,
  type AxisEvidence,
} from "@training/domain";
import { AXIS_NAMES } from "./labels";
import styles from "./assessment.module.css";

function EvidenceEntry({
  title,
  evidence,
  note,
}: {
  title: string;
  evidence: AxisEvidence;
  note?: string;
}) {
  const sources = primarySources(evidence);
  return (
    <section className={styles.evidenceEntry}>
      <div className={styles.axisCardHeader}>
        <h3 className={styles.evidenceTitle}>{title}</h3>
        <span className={styles.tierChip}>{formatTierRange(evidence.thresholdTier)}</span>
      </div>
      {note ? <p className={styles.evidenceSources}>{note}</p> : null}
      <p className={styles.evidenceSources}>
        {sources.length > 0 ? (
          <>
            <strong>Primary sources:</strong> {sources.join("; ")}
          </>
        ) : (
          "No external source cited: these thresholds are coaching judgment or engine-derived."
        )}
      </p>
      <dl className={styles.tierDefinitions}>
        {tiersIn(evidence.thresholdTier).map((tier) => {
          const def = EVIDENCE_TIER_DEFINITIONS[tier];
          return (
            <div key={tier}>
              <dt>
                Tier {tier}: {def.name}
              </dt>
              <dd>
                {def.meaning} <em>What it is not:</em> {def.notThis}
              </dd>
            </div>
          );
        })}
      </dl>
      <details className={styles.details}>
        <summary>What this rests on</summary>
        <ul className={styles.claimList}>
          {evidence.claims.map((claim) => (
            <li key={claim.claim}>
              <span className={styles.tierChip}>{formatTierRange(claim.tier)}</span> {claim.claim}
              {claim.sources.length > 0 ? (
                <span className={styles.claimSources}> ({claim.sources.join("; ")})</span>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/**
 * The Fit band's own tier is engine-derived, but it summarises findings graded higher. Saying both stops
 * "Tier 4" reading as "arbitrary". The span is computed from the axes, not written in.
 */
function fitBandNote(
  fit: AxisEvidence,
  span: { from: number; to: number },
): string {
  return (
    `Fit band: ${formatTierRange(fit.thresholdTier)} (engine-derived). ` +
    `The findings it summarises range from Tier ${span.from} to Tier ${span.to}.`
  );
}

export function EvidencePanel({ onClose }: { onClose: () => void }) {
  const evidence = HYPERTROPHY_CONFIG.evidence;
  return (
    <section className={styles.evidencePanel} aria-label="Evidence behind the thresholds" id="evidence-panel">
      <div className={styles.axisCardHeader}>
        <h2 className={styles.sectionHeading}>Evidence behind the thresholds</h2>
        <button type="button" className={styles.linkButton} onClick={onClose}>
          Close
        </button>
      </div>
      <p className={styles.evidenceIntro}>
        Each threshold carries the evidence tier the hypertrophy profile assigns it. The tiers are
        graded from the research; no expert has yet signed off the profile as a whole.
      </p>
      {evidence ? (
        <>
          {hypertrophyProfile.relevantAxes.map((axis) => (
            <EvidenceEntry key={axis} title={AXIS_NAMES[axis]} evidence={evidence.axes[axis]} />
          ))}
          <EvidenceEntry
            title="Fit band"
            evidence={evidence.fitScoreProjection}
            note={fitBandNote(evidence.fitScoreProjection, thresholdTierSpan(evidence))}
          />
        </>
      ) : (
        <p className={styles.evidenceIntro}>This goal profile does not list its evidence yet.</p>
      )}
    </section>
  );
}
