// apps/web/app/app/journal/page.tsx
//
// Project 4: the training journal. A diary of completed sessions, newest
// first: date, day, how long, the top set of each lift, any new PRs in words
// and the lifter's own note. Server Component for the first page (one read,
// journal.get); "Load older" is the only client piece. A page, not the home
// screen.

import Link from "next/link";
import { redirect } from "next/navigation";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";
import { AppNav } from "@/components/nav/AppNav";
import { JournalList } from "./JournalList";
import styles from "./journal.module.css";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }

  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });
  const first = await caller.journal.get({});

  return (
    <>
      <AppNav />
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.heading}>Journal</h1>
          <a href="/app/journal/export" download className={styles.download}>
            Download my data
          </a>
        </header>
        <p className={styles.ownership}>Everything you log is yours. Download anytime.</p>

        {first.entries.length === 0 ? (
          <section className={styles.empty}>
            <p className={styles.emptyText}>Log your first session and it appears here.</p>
            <Link href="/train" className={styles.cta}>
              Go to Train
            </Link>
          </section>
        ) : (
          <JournalList initial={first} />
        )}
      </main>
    </>
  );
}
