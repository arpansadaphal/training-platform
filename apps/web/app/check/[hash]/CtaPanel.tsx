"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHECK_COPY } from "@training/domain";
import { storePendingCheck } from "@/src/lib/pendingCheck";
import styles from "../check.module.css";

/**
 * The sign-up handoff. The program travels in sessionStorage; when storage is unavailable (private mode,
 * blocked site data) it travels in the sign-up URL instead and comes back as /check/<hash>?import=1.
 */
export function CtaPanel({ hash }: { hash: string }) {
  const router = useRouter();

  function createAccount() {
    router.push(storePendingCheck(hash) ? "/signup?from=check" : `/signup?from=check&h=${hash}`);
  }

  return (
    <section className={styles.cta} aria-labelledby="check-cta">
      <h2 id="check-cta" className={styles.ctaHeading}>
        {CHECK_COPY.ctaHeading}
      </h2>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={createAccount}>
          {CHECK_COPY.ctaPrimary}
        </button>
      </div>
      <Link href="/check#input" className={styles.textLink}>
        {CHECK_COPY.ctaSecondary}
      </Link>
    </section>
  );
}
