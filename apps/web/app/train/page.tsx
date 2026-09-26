// apps/web/app/train/page.tsx
//
// The entry point for training. Lists the user's non-archived Programs,
// split into "ready to train" (has an active committed version) and "not
// ready yet" (no active version — needs a commit first).
//
// The "Start training" button on each ready Program posts to
// startTrainingAction, which calls session.getOrCreateNext and redirects to
// the Session detail. For a Program that already has a pending Session,
// getOrCreateNext returns it rather than creating a duplicate — so the same
// button means "continue" on the second visit and no state is lost.
//
// Rendered as a Server Component using the same pattern as
// apps/web/app/app/page.tsx: await auth(), redirect to /login if absent,
// then appRouter.createCaller(...) for the read. Per the Phase 6 layout
// finding, /train does its own auth check — there is no shared layout under
// app/app/ to inherit from.

import Link from "next/link";
import { redirect } from "next/navigation";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";
import { startTrainingAction } from "./actions";
import styles from "./train.module.css";

export const dynamic = "force-dynamic";

export default async function TrainPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }

  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });
  const programs = await caller.program.listMine({ includeArchived: false });

  const ready = programs.filter((p) => p.activeVersionId !== null);
  const notReady = programs.filter((p) => p.activeVersionId === null);

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/app">&larr; Dashboard</Link>
      </nav>

      <h1 className={styles.heading}>Training</h1>
      <p className={styles.muted}>
        Pick a program to start or continue training.
      </p>

      {programs.length === 0 ? (
        <p className={styles.emptyState}>
          You have no programs yet.{" "}
          <Link href="/app/programs">Create one</Link> to get started.
        </p>
      ) : null}

      {ready.length > 0 ? (
        <section>
          <h2 className={styles.sectionHeading}>Ready to train</h2>
          <ul className={styles.programList}>
            {ready.map((p) => (
              <li key={p.id} className={styles.programCard}>
                <div className={styles.programName}>{p.name}</div>
                <form action={startTrainingAction}>
                  <input type="hidden" name="programId" value={p.id} />
                  <button type="submit" className={styles.primaryButton}>
                    Start training
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {notReady.length > 0 ? (
        <section>
          <h2 className={styles.sectionHeading}>Not ready yet</h2>
          <ul className={styles.programList}>
            {notReady.map((p) => (
              <li key={p.id} className={styles.programCard}>
                <div>
                  <div className={styles.programName}>{p.name}</div>
                  <p className={styles.muted}>
                    Commit a version in the Builder to start training.
                  </p>
                </div>
                <Link
                  href={`/app/programs/${p.id}/build`}
                  className={styles.secondaryButton}
                >
                  Open Builder
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}