// apps/web/app/train/session/[id]/summary/page.tsx
//
// Phase A3a: the post-workout summary, the reward moment after "Mark
// complete". A full page, not a modal: it survives a refresh and can be
// revisited from the completed session. Computed on read from stored data
// (progress.getSessionSummary), so nothing about it is saved anywhere.
//
// Deliberately no app nav: the two buttons at the bottom are the exits.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";
import { fmtDuration, fmtLoad, fmtVolume } from "@/src/lib/progressFormat";
import styles from "./summary.module.css";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function signed(n: number): string {
  if (n === 0) return "0";
  return `${n > 0 ? "+" : "−"}${fmtLoad(Math.abs(n))}`;
}

/** "+5%" when load × reps is comparable, else the change in sets, labelled as such. */
function vsLastTime(m: {
  delta: number | null;
  volumeChangePercent: number | null;
}): string {
  if (m.volumeChangePercent !== null) {
    const pct = Math.round(m.volumeChangePercent);
    return pct === 0 ? "0%" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
  }
  if (m.delta === null) return "—";
  return m.delta === 0 ? "same sets" : `${signed(m.delta)} sets`;
}

export default async function SessionSummaryPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }
  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });

  let view;
  try {
    view = await caller.progress.getSessionSummary({ sessionId: id });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    // Not completed yet: the session page is where it belongs.
    if (err instanceof TRPCError && err.code === "PRECONDITION_FAILED") {
      redirect(`/train/session/${id}`);
    }
    throw err;
  }

  const { summary } = view;
  const volumeChange = summary.volumeChangePercent;

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Session complete</p>
      <h1 className={styles.title}>{view.dayName}</h1>
      <p className={styles.program}>{view.programName}</p>

      <p className={styles.verdict}>{summary.verdict}</p>

      <section className={styles.stats} aria-label="Session totals">
        <div className={styles.stat}>
          <span className={styles.statValue}>
            {summary.durationSeconds === null ? "—" : fmtDuration(summary.durationSeconds)}
          </span>
          <span className={styles.statLabel}>Duration</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            {summary.loggedSets}
            <span className={styles.statOf}> / {summary.plannedSets}</span>
          </span>
          <span className={styles.statLabel}>Sets logged</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            {fmtVolume(view.totalVolume)}
            <span className={styles.statOf}> {view.volumeUnit}</span>
          </span>
          <span className={styles.statLabel}>
            Total volume
            {volumeChange === null
              ? ""
              : ` · ${volumeChange > 0 ? "+" : volumeChange < 0 ? "−" : ""}${Math.round(Math.abs(volumeChange))}%`}
          </span>
        </div>
      </section>

      {summary.newPRs.length > 0 ? (
        <section className={styles.section} aria-labelledby="prs-heading">
          <h2 id="prs-heading" className={styles.sectionHeading}>
            New PRs
          </h2>
          <ul className={styles.prList}>
            {summary.newPRs.map((pr) => (
              <li key={pr.exerciseId} className={styles.pr}>
                <span className={styles.prName}>{pr.exerciseName}</span>
                <span className={styles.prValue}>
                  {fmtLoad(pr.weight)} {pr.unit} × {pr.reps}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.volumeDeltaPerMuscle.length > 0 ? (
        <details className={styles.muscles} open>
          <summary className={styles.musclesSummary}>Sets by muscle</summary>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Muscle</th>
                <th scope="col">Sets</th>
                <th scope="col">Volume vs last time</th>
              </tr>
            </thead>
            <tbody>
              {summary.volumeDeltaPerMuscle.map((m) => (
                <tr key={m.muscle}>
                  <th scope="row">{titleCase(m.muscle)}</th>
                  <td>{fmtLoad(m.sets)}</td>
                  <td>{vsLastTime(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.note}>
            Sets and volume count toward each muscle by how much the exercise works it.
          </p>
        </details>
      ) : null}

      <div className={styles.actions}>
        <Link href="/train" className={styles.primary}>
          Log another session
        </Link>
        <Link href="/app" className={styles.secondary}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
