// apps/web/app/app/progress/page.tsx
//
// Phase A3a: is the training working? Per exercise, the top-set trend and a
// plain verdict over the last few sessions. Server Component, one read
// (progress.getForUser); the accordion is the only client piece.

import Link from "next/link";
import { redirect } from "next/navigation";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";
import { AppNav } from "@/components/nav/AppNav";
import { ProgressList } from "@/components/progress/ProgressList";
import styles from "@/components/progress/progress.module.css";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }

  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });
  const exercises = await caller.progress.getForUser();

  return (
    <>
      <AppNav />
      <main className={styles.page}>
        <h1 className={styles.heading}>Progress</h1>
        {exercises.length === 0 ? (
          <section className={styles.empty}>
            <p className={styles.emptyText}>
              Log 2-3 sessions with a lift and we&apos;ll show your trend.
            </p>
            <Link href="/train" className={styles.cta}>
              Go to Train
            </Link>
          </section>
        ) : (
          <ProgressList exercises={exercises} />
        )}
      </main>
    </>
  );
}
