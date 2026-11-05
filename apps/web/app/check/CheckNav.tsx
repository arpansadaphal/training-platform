import Link from "next/link";
import styles from "./check.module.css";

/** Public header for /check pages: no session needed. */
export function CheckNav() {
  return (
    <nav className={styles.nav} aria-label="Site">
      <Link href="/" className={styles.navLink}>
        <strong>Training Platform</strong>
      </Link>
      <span className={styles.navSpacer} />
      <Link href="/login" className={styles.navLink}>
        Log in
      </Link>
      <Link href="/signup" className={styles.navLink}>
        Sign up
      </Link>
    </nav>
  );
}
