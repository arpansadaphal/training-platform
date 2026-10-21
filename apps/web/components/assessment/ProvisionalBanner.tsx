// apps/web/components/assessment/ProvisionalBanner.tsx
//
// The provisional-thresholds banner (ARCH-046; copy revised by ARCH-054).
//
// Mounted inside AssessmentDisplay, so every consumer — Review, Builder,
// Coach panel, History — gets it without needing to remember to render it.
// The enforcement is structural: AssessmentDisplay is the only component
// permitted to render an assessment-result payload directly (see
// scripts/check-provisional-banner.sh), so no new assessment surface can
// bypass this.
//
// Non-dismissable by design. Not a toast, not a collapsible callout. The
// banner states a fact about the assessment below it that the user needs
// to see every time: the thresholds are evidence-graded candidates, and no
// human expert has signed the profile off. ARCH-054 replaced "not yet
// scientifically validated" with that more precise statement and added the
// tier span. It must never say "validated" in the positive.
//
// No "use client" directive: no hooks and no state. The "See evidence"
// handler is passed in by AssessmentDisplay, which owns the panel.

import { HYPERTROPHY_CONFIG, thresholdTierSpan } from "@training/domain";
import styles from "./ProvisionalBanner.module.css";

export function ProvisionalBanner({
  onSeeEvidence,
  evidenceOpen = false,
}: {
  onSeeEvidence?: () => void;
  evidenceOpen?: boolean;
}) {
  const evidence = HYPERTROPHY_CONFIG.evidence;
  const span = evidence ? thresholdTierSpan(evidence) : null;
  return (
    <aside
      className={styles.banner}
      role="note"
      aria-label="Provisional thresholds disclaimer"
    >
      <p className={styles.text}>
        <strong>Thresholds are evidence-graded, not human-validated.</strong>{" "}
        Tier 1 rests on meta-analyses and trials; Tier 4 is engine-derived.
        {span ? ` These thresholds range from Tier ${span.from} to Tier ${span.to}.` : null}{" "}
        {onSeeEvidence ? (
          <button
            type="button"
            className={styles.link}
            onClick={onSeeEvidence}
            aria-expanded={evidenceOpen}
          >
            See evidence
          </button>
        ) : null}
      </p>
    </aside>
  );
}
