// apps/web/components/assessment/ProvisionalBanner.tsx
//
// The provisional-thresholds banner (ARCH-046).
//
// Mounted inside AssessmentDisplay, so every consumer — Review, Builder,
// Coach panel, History — gets it without needing to remember to render it.
// The enforcement is structural: AssessmentDisplay is the only component
// permitted to render an assessment-result payload directly (see
// scripts/check-provisional-banner.sh), so no new assessment surface can
// bypass this.
//
// Non-dismissable by design. Not a toast, not a collapsible callout. The
// banner exists to state a fact about the assessment below it that the
// user needs to see every time — that the numbers were produced from
// provisional, not-yet-validated configuration. A dismissible banner
// would be dismissed.
//
// No "use client" directive: this component has no hooks and no state. It
// works equally as a server-rendered or client-rendered element.

import styles from "./ProvisionalBanner.module.css";

export function ProvisionalBanner() {
  return (
    <aside
      className={styles.banner}
      role="note"
      aria-label="Provisional thresholds disclaimer"
    >
      <p className={styles.text}>
        <strong>Thresholds are provisional.</strong> This assessment is not
        yet scientifically validated.
      </p>
    </aside>
  );
}