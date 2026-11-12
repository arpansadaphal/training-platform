"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHECK_COPY, decodeCompactProgram } from "@training/domain";
import { storePendingCheck } from "@/src/lib/pendingCheck";
import styles from "../check.module.css";

/**
 * The sign-up handoff. The program travels in sessionStorage; when storage is unavailable (private mode,
 * blocked site data) it travels in the sign-up URL instead and comes back as /check/<hash>?import=1.
 */
export function CtaPanel({ hash, nothingFlagged = false }: { hash: string; nothingFlagged?: boolean }) {
  const router = useRouter();

  function createAccount() {
    // The count only words the sign-up heading ("Save your 26-exercise program."); without one the heading is generic.
    const program = decodeCompactProgram(hash);
    const exercises = program === null ? null : program.days.reduce((total, day) => total + day.rows.length, 0);
    const count = exercises === null ? "" : `&n=${exercises}`;
    router.push(storePendingCheck(hash) ? `/signup?from=check${count}` : `/signup?from=check&h=${hash}`);
  }

  return (
    <section className={styles.cta} aria-labelledby="check-cta">
      <h2 id="check-cta" className={styles.ctaHeading}>
        {nothingFlagged ? CHECK_COPY.trackingHeading : CHECK_COPY.ctaHeading}
      </h2>
      {nothingFlagged ? null : <p className={styles.note}>{CHECK_COPY.ctaLead}</p>}
      <ul className={styles.ctaList}>
        {(nothingFlagged ? CHECK_COPY.trackingBullets : CHECK_COPY.ctaBenefits).map((benefit) => (
          <li key={benefit}>{benefit}</li>
        ))}
      </ul>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={createAccount}>
          {nothingFlagged ? CHECK_COPY.ctaTrackingPrimary : CHECK_COPY.ctaPrimary}
        </button>
      </div>
      <p className={styles.note}>{CHECK_COPY.ctaFreeNote}</p>
      <Link href="/check#input" className={styles.textLink}>
        {CHECK_COPY.ctaSecondary}
      </Link>
    </section>
  );
}
