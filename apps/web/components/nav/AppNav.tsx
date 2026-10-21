// apps/web/components/nav/AppNav.tsx
//
// Phase A2: the one navigation bar for every authenticated page. Before this,
// only /app had a nav, so a user who committed a program in the Builder had
// no visible way to reach Train or the dashboard (the lazy-lifter
// diagnostic's first blocker).
//
// A Server Component: sign-out is a server action, so it works without
// client JavaScript and without a client-bundle import of the auth module.

import Link from "next/link";
import { signOut } from "@/src/server/auth";
import styles from "./AppNav.module.css";

export function AppNav() {
  return (
    <nav className={styles.nav} aria-label="Main">
      <Link href="/app" className={styles.brand}>
        Training Platform
      </Link>
      <span className={styles.spacer} />
      <Link href="/app" className={styles.navLink}>
        Dashboard
      </Link>
      <Link href="/app/programs" className={styles.navLink}>
        Programs
      </Link>
      <Link href="/train" className={styles.navLink}>
        Train
      </Link>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button type="submit" className={styles.signOutButton}>
          Sign out
        </button>
      </form>
    </nav>
  );
}
