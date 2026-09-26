// apps/web/components/assessment/UnvalidatedState.tsx
//
// Renders the "not yet validated" state per the Q3 ruling on Phase 4's E2E
// acceptance criterion. The shipped HYPERTROPHY_CONFIG has all-null
// thresholds (ARCH-029-031), so computeAssessment returns UNVALIDATED — and
// the correct product behavior is to say so honestly, not to fabricate a band
// or a Biggest Opportunity.
//
// This is the exact UI the rewritten Phase 4 E2E asserts against.

import styles from "./assessment.module.css";

interface Props {
  reason: string;
}

export function UnvalidatedState({ reason }: Props) {
  return (
    <div className={styles.unvalidated}>
      <h2 className={styles.unvalidatedTitle}>Assessment not yet available</h2>
      <p className={styles.unvalidatedReason}>{reason}</p>
      <p className={styles.unvalidatedHint}>
        The thresholds this assessment depends on have not been scientifically
        validated yet. Rather than show a band or a recommendation the system
        cannot stand behind, it shows this state until those thresholds are
        signed off. Your structure is saved and will be assessed as soon as
        the configuration is finalized.
      </p>
    </div>
  );
}