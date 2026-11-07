// apps/web/app/check/CheckPreview.tsx
//
// A static example of what an assessment looks like (ARCH-067 / Fix 2), shown above the paste box so a stranger
// knows what the paste buys. Not the visitor's result and not interactive: no links, no buttons, no state.

import { CHECK_COPY } from "@training/domain";
import styles from "./check.module.css";

export function CheckPreview() {
  return (
    <section className={styles.preview} aria-labelledby="check-preview-heading">
      <div className={styles.previewTop}>
        <h2 id="check-preview-heading" className={styles.previewHeading}>
          {CHECK_COPY.previewHeading}
        </h2>
        <span className={styles.previewTag}>{CHECK_COPY.previewTag}</span>
      </div>
      <ul className={styles.previewCards}>
        {CHECK_COPY.previewCards.map((card) => (
          <li key={card.label} className={styles.previewCard}>
            <span className={styles.previewLabel}>{card.label}</span>
            <span className={styles.previewStatus}>{card.status}</span>
            <span className={styles.previewDetail}>{card.detail}</span>
          </li>
        ))}
        <li className={styles.previewCard}>
          <span className={styles.previewLabel}>{CHECK_COPY.previewBalanceHeading}</span>
          <span className={styles.previewDetail}>{CHECK_COPY.previewBalance}</span>
        </li>
      </ul>
    </section>
  );
}
