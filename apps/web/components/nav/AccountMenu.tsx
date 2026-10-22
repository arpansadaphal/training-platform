// apps/web/components/nav/AccountMenu.tsx
//
// Phase A3a: sign-out for the phone layout. The top bar (and its Sign out
// button) is hidden at <=40rem, so the dashboard carries a small menu in its
// top-right corner instead. A native <details>: no client JavaScript. Hidden
// by CSS above 40rem, where the top bar still has Sign out.

import { signOut } from "@/src/server/auth";
import styles from "./AppNav.module.css";

export function AccountMenu() {
  return (
    <details className={styles.accountMenu}>
      <summary className={styles.accountButton} aria-label="Account menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </summary>
      <div className={styles.accountPanel}>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className={styles.accountSignOut}>
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
