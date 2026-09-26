// apps/web/app/app/page.tsx
//
// The authenticated landing screen — the Identity/Progress surface. Replaces
// the Phase 0 empty shell.
//
// Per the Phase 7 file (Round 2 §4/§36): this is "the single highest-leverage,
// zero-new-scope response to 'does this feel like a training home.'" It shows
// the user's current Program, its active version status, a session-or-review
// primary call to action, and three lifetime headline stats. It is NOT a
// navigation grid.
//
// Server Component using the appRouter.createCaller pattern established in
// Phase 1 — no HTTP hop for the read. The single aggregation read
// (program.getIdentitySummary) is deliberate so the page renders in one
// round trip.

import Link from "next/link";
import { redirect } from "next/navigation";
import { appRouter } from "@training/api";
import { auth, signOut } from "@/src/server/auth";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }

  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });

  const [me, identity] = await Promise.all([
    caller.user.getSelf(),
    caller.program.getIdentitySummary(),
  ]);

  const { primaryProgram, currentSession, stats } = identity;

  return (
    <>
      <nav className={styles.nav}>
        <strong>Training Platform</strong>
        <span className={styles.spacer} />
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

      <main className={styles.page}>
        <h1 className={styles.heading}>
          {me.displayName ? `Hi, ${me.displayName}` : "Welcome back"}
        </h1>

        {primaryProgram === null ? (
          <EmptyState />
        ) : (
          <>
            <ProgramHero
              program={primaryProgram}
              currentSession={currentSession}
            />

            <StatsRow
              sessionsCompleted={stats.sessionsCompleted}
              totalSetsLogged={stats.totalSetsLogged}
              versionsCommitted={stats.versionsCommitted}
            />

            {primaryProgram.currentBlock ? (
              <BlockStrip
                blockId={primaryProgram.currentBlock.id}
                status={primaryProgram.currentBlock.status}
                startedAt={primaryProgram.currentBlock.startedAt}
                plannedLengthWeeks={
                  primaryProgram.currentBlock.plannedLengthWeeks
                }
              />
            ) : null}

            <p className={styles.footerLink}>
              <Link href="/app/programs">All programs →</Link>
            </p>
          </>
        )}
      </main>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <section className={styles.emptyState}>
      <h2 className={styles.emptyHeading}>Start your first program</h2>
      <p className={styles.muted}>
        Build a training program, get it analyzed transparently against a
        stated goal, then train it with honest logging. Review later tells you
        what the design predicted vs. what actually happened.
      </p>
      <Link href="/app/programs" className={styles.primaryButton}>
        Create a program
      </Link>
    </section>
  );
}

interface ProgramHeroProps {
  program: {
    id: string;
    name: string;
    activeVersion: {
      id: string;
      versionNumber: number;
      createdAt: Date;
    } | null;
    currentBlock: {
      id: string;
      status: "ACTIVE" | "COMPLETED" | "ABANDONED";
      startedAt: Date;
      plannedLengthWeeks: number | null;
    } | null;
  };
  currentSession: {
    id: string;
    status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
    workoutDayName: string;
    sequenceIndex: number;
  } | null;
}

function ProgramHero({ program, currentSession }: ProgramHeroProps) {
  const hasActiveVersion = program.activeVersion !== null;
  const hasActiveBlock = program.currentBlock?.status === "ACTIVE";

  // Choose the primary call to action in priority order.
  let cta: { href: string; label: string } | null = null;

  if (currentSession !== null) {
    cta = {
      href: `/train/session/${currentSession.id}`,
      label:
        currentSession.status === "IN_PROGRESS"
          ? `Continue ${currentSession.workoutDayName}`
          : `Start ${currentSession.workoutDayName}`,
    };
  } else if (hasActiveBlock) {
    cta = { href: "/train", label: "Start next session" };
  } else if (hasActiveVersion) {
    cta = {
      href: `/app/programs/${program.id}/build`,
      label: "Open Builder",
    };
  } else {
    cta = {
      href: `/app/programs/${program.id}/build`,
      label: "Commit a version to train",
    };
  }

  return (
    <section className={styles.hero}>
      <p className={styles.heroEyebrow}>Current program</p>
      <h2 className={styles.heroTitle}>{program.name}</h2>

      {hasActiveVersion && program.activeVersion ? (
        <p className={styles.heroMeta}>
          Version {program.activeVersion.versionNumber} active
          {currentSession !== null
            ? ` · Session ${currentSession.sequenceIndex + 1} in progress`
            : ""}
        </p>
      ) : (
        <p className={styles.heroMeta}>
          No committed version yet — open the Builder to commit one.
        </p>
      )}

      <div className={styles.heroActions}>
        <Link href={cta.href} className={styles.primaryButton}>
          {cta.label}
        </Link>
        <Link
          href={`/app/programs/${program.id}`}
          className={styles.secondaryButton}
        >
          View program
        </Link>
      </div>
    </section>
  );
}

interface StatsRowProps {
  sessionsCompleted: number;
  totalSetsLogged: number;
  versionsCommitted: number;
}

function StatsRow({
  sessionsCompleted,
  totalSetsLogged,
  versionsCommitted,
}: StatsRowProps) {
  return (
    <section className={styles.statsRow} aria-label="Lifetime stats">
      <Stat label="Sessions completed" value={sessionsCompleted} />
      <Stat label="Sets logged" value={totalSetsLogged} />
      <Stat label="Versions committed" value={versionsCommitted} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

interface BlockStripProps {
  blockId: string;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
  startedAt: Date;
  plannedLengthWeeks: number | null;
}

function BlockStrip({
  blockId,
  status,
  startedAt,
  plannedLengthWeeks,
}: BlockStripProps) {
  const daysIn = Math.max(
    0,
    Math.floor((Date.now() - startedAt.getTime()) / MS_PER_DAY),
  );
  const weeksIn = Math.floor(daysIn / 7);

  const durationText =
    plannedLengthWeeks !== null
      ? `${weeksIn} of ${plannedLengthWeeks} weeks planned`
      : `${weeksIn} ${weeksIn === 1 ? "week" : "weeks"} in`;

  return (
    <section className={styles.blockStrip}>
      <div className={styles.blockStripText}>
        <p className={styles.blockStripTitle}>This block</p>
        <p className={styles.muted}>
          {status === "ACTIVE" ? "In progress" : status.toLowerCase()} ·{" "}
          {durationText}
        </p>
      </div>
      <Link
        href={`/app/review/${blockId}`}
        className={styles.secondaryButton}
      >
        Review block
      </Link>
    </section>
  );
}