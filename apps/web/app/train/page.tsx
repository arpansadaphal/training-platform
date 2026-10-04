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
//
// Phase 10c addition: an anticipation cue — a purely informational,
// forward-looking line about where the user is in the current TrainingBlock
// ("N sessions remaining in this block, then your Review"). Rendered on the
// card for whichever Program has the ACTIVE block. At MVP only one Program
// per user can have an ACTIVE TrainingBlock, so this is a single-card
// decoration, not a per-row fetch.
//
// The cue deliberately avoids streaks, login counts, and loss-aversion
// framing — Final Freeze §26's explicit exclusion list. When the block has
// no declared plannedLengthWeeks, the cue degrades to a fact ("N sessions
// completed in this block") rather than inventing a block length.

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

  // The program list and the identity summary are independent reads; fetch
  // them in parallel. The identity summary carries the current block's
  // anticipation cue (Phase 10c), which is derived server-side from the
  // block's plannedLengthWeeks, the active version's workoutDay count, and
  // the count of COMPLETED Sessions in the block.
  const [programs, identity] = await Promise.all([
    caller.program.listMine({ includeArchived: false }),
    caller.program.getIdentitySummary(),
  ]);

  const ready = programs.filter((p) => p.activeVersionId !== null);
  const notReady = programs.filter((p) => p.activeVersionId === null);

  // The anticipation cue belongs to whichever Program has an ACTIVE
  // TrainingBlock — which is what identity.primaryProgram.currentBlock
  // resolves to (findActiveTrainingBlockForProgram returns ACTIVE only).
  // At MVP only one Program can have an ACTIVE block per user, so this is a
  // single-card decoration, not a per-row fetch.
  const cueProgramId = identity.primaryProgram?.currentBlock
    ? identity.primaryProgram.id
    : null;
  const cueText =
    identity.primaryProgram?.currentBlock?.anticipationCue.text ?? null;

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
                {p.id === cueProgramId && cueText ? (
                  <p className={styles.muted}>{cueText}</p>
                ) : null}
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