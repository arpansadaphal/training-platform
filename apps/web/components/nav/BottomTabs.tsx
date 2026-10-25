"use client";

// apps/web/components/nav/BottomTabs.tsx
//
// Phase A3a: the phone navigation. At <=40rem the top bar is hidden and these
// four tabs sit at the bottom of the screen, inside thumb reach (the founder's
// device is a phone, mid-workout). Hidden by CSS above 40rem, where the top
// bar is used. A client component only for the active-tab highlight.

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AppNav.module.css";

interface Tab {
  href: string;
  label: string;
  /** Path prefix that marks the tab active; "/app" matches exactly. */
  match: string;
  exact?: boolean;
  /** SVG path data, drawn on a 24x24 canvas. */
  icon: string;
}

const TABS: readonly Tab[] = [
  { href: "/app", label: "Dashboard", match: "/app", exact: true, icon: "M3 11l9-8 9 8M5 10v10h14V10" },
  { href: "/train", label: "Train", match: "/train", icon: "M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" },
  { href: "/app/progress", label: "Progress", match: "/app/progress", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { href: "/app/journal", label: "Journal", match: "/app/journal", icon: "M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM9 9h6M9 13h6" },
  { href: "/app/programs", label: "Programs", match: "/app/programs", icon: "M4 6h16M4 12h16M4 18h10" },
];

export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav className={styles.bottomBar} aria-label="Main" data-bottom-tabs>
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.match
          : pathname === tab.match || pathname.startsWith(`${tab.match}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            aria-current={active ? "page" : undefined}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={tab.icon} />
            </svg>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
