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
import { appRouter, type TodayPlan } from "@training/api";
import { auth } from "@/src/server/auth";
import { AppNav } from "@/components/nav/AppNav";
import { AccountMenu } from "@/components/nav/AccountMenu";
import { startTrainingAction } from "@/app/train/actions";
import { loadUnitLabel } from "@/src/lib/loadLabels";
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

  const [me, identity, progress] = await Promise.all([
    caller.user.getSelf(),
    caller.program.getIdentitySummary(),
    caller.progress.getForUser(),
  ]);

  const {
    primaryProgram,
    currentSession,
    stats,
    recentClosedBlock,
    lastCompletedSessionAt,
    today,
    weekProgress,
  } = identity;

  return (
    <>
      <AppNav />

      <main className={styles.page}>
        <div className={styles.headerRow}>
          <h1 className={styles.heading}>
            {me.displayName ? `Hi, ${me.displayName}` : "Welcome back"}
          </h1>
          <AccountMenu />
        </div>

        {primaryProgram === null ? (
          <EmptyState />
        ) : (
          <>
            {today !== null ? (
              <TodayCard programId={primaryProgram.id} programName={primaryProgram.name} today={today} />
            ) : (
              <ProgramHero
                program={primaryProgram}
                currentSession={currentSession}
              />
            )}

            {weekProgress !== null ? (
              <p className={styles.weekLine}>
                {weekProgress.completed <= weekProgress.planned
                  ? `Past 7 days: ${weekProgress.completed} of ${weekProgress.planned} ${
                      weekProgress.planned === 1 ? "session" : "sessions"
                    }`
                  : `Past 7 days: ${weekProgress.completed} sessions (${weekProgress.planned} planned)`}
              </p>
            ) : null}

            <WhereYouStand lifts={progress.slice(0, 3)} />

            {primaryProgram.currentBlock && today?.comebackDays == null ? (
              <WelcomeBack lastCompletedSessionAt={lastCompletedSessionAt} />
            ) : null}

            {primaryProgram.currentBlock && primaryProgram.currentBlock.sessionsCompleted > 0 ? (
              <BlockStrip
                blockId={primaryProgram.currentBlock.id}
                status={primaryProgram.currentBlock.status}
                startedAt={primaryProgram.currentBlock.startedAt}
                plannedLengthWeeks={primaryProgram.currentBlock.plannedLengthWeeks}
                anticipationCueText={primaryProgram.currentBlock.anticipationCue.text}
              />
            ) : null}

            <StatsRow
              sessionsCompleted={stats.sessionsCompleted}
              totalSetsLogged={stats.totalSetsLogged}
            />

            {recentClosedBlock ? <RecentBlock block={recentClosedBlock} /> : null}

            <p className={styles.footerLink}>
              <Link href="/app/programs" className={styles.footerAnchor}>
                All programs →
              </Link>
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
    isRestDay?: boolean;
    sequenceIndex: number;
  } | null;
}

function ProgramHero({ program, currentSession }: ProgramHeroProps) {
  const hasActiveVersion = program.activeVersion !== null;
  const hasActiveBlock = program.currentBlock?.status === "ACTIVE";

  // Choose the primary call to action in priority order.
  let cta: { href: string; label: string } | null = null;

  // Phase A2: a PLANNED session is "next up", never "in progress"; only an
  // IN_PROGRESS one is continued. A stale IN_PROGRESS session never reaches
  // here (identityService drops it; the next start auto-closes it, ARCH-057).
  if (currentSession !== null) {
    cta = {
      href: `/train/session/${currentSession.id}`,
      label:
        currentSession.isRestDay === true
          ? "Open rest day"
          : currentSession.status === "IN_PROGRESS"
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
          {currentSession === null
            ? ""
            : currentSession.status === "IN_PROGRESS"
              ? ` · ${currentSession.workoutDayName} in progress`
              : currentSession.isRestDay === true
                ? " · Next up: rest day"
                : ` · Next up: ${currentSession.workoutDayName}`}
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
}

function StatsRow({ sessionsCompleted, totalSetsLogged }: StatsRowProps) {
  return (
    <section className={styles.statsRow} aria-label="Lifetime stats">
      <Stat label="Sessions completed" value={sessionsCompleted} />
      <Stat label="Sets logged" value={totalSetsLogged} />
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
  anticipationCueText: string;
}

/** Shown once a block has a session in it: an empty block says nothing and offers no review. */
function BlockStrip({
  blockId,
  status,
  startedAt,
  plannedLengthWeeks,
  anticipationCueText,
}: BlockStripProps) {
  const daysIn = Math.max(
    0,
    Math.floor((Date.now() - startedAt.getTime()) / MS_PER_DAY),
  );
  const weeksIn = Math.floor(daysIn / 7);

  // "0 weeks in" says nothing on day one; the week count appears from week 1.
  const durationText =
    weeksIn === 0
      ? null
      : plannedLengthWeeks !== null
        ? `${weeksIn} of ${plannedLengthWeeks} weeks planned`
        : `${weeksIn} ${weeksIn === 1 ? "week" : "weeks"} in`;

  return (
    <section className={styles.blockStrip}>
      <div className={styles.blockStripText}>
        <p className={styles.blockStripTitle}>This block</p>
        {status !== "ACTIVE" || durationText ? (
          <p className={styles.muted}>
            {[status === "ACTIVE" ? null : status.toLowerCase(), durationText]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        <p className={styles.muted}>{anticipationCueText}</p>
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

/**
 * Phase A3a: the three most recently trained lifts, each with its verdict
 * line. Facts from the user's own logs, linked to the full Progress view.
 */
function WhereYouStand({
  lifts,
}: {
  lifts: Array<{ exerciseId: string; verdictLine: string }>;
}) {
  if (lifts.length === 0) return null;
  return (
    <section className={styles.standing} aria-labelledby="standing-heading">
      <h2 id="standing-heading" className={styles.standingHeading}>
        Where you stand
      </h2>
      <ul className={styles.standingList}>
        {lifts.map((lift) => (
          <li key={lift.exerciseId}>
            <Link href="/app/progress" className={styles.standingLink}>
              {lift.verdictLine}
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/app/progress" className={styles.standingAll}>
        See all progress →
      </Link>
    </section>
  );
}

/**
 * The Today card (ARCH-062): what the lifter is doing today with a target for
 * every lift, or, for a few hours after a session, what they just did and
 * what is next. Facts from their own logs; no streak, no schedule.
 */
function TodayCard({
  programId,
  programName,
  today,
}: {
  programId: string;
  programName: string;
  today: TodayPlan;
}) {
  const startForm = (label: string) => (
    <form action={startTrainingAction}>
      <input type="hidden" name="programId" value={programId} />
      <button type="submit" className={styles.primaryButton}>
        {label}
      </button>
    </form>
  );

  if (today.state === "JUST_FINISHED" && today.finished) {
    const { finished } = today;
    return (
      <section className={styles.hero} aria-labelledby="today-heading">
        <p className={styles.heroEyebrow}>Done</p>
        <h2 id="today-heading" className={styles.heroTitle}>
          {finished.dayName}
        </h2>
        {finished.prs.length > 0 ? (
          <ul className={styles.todayList}>
            {finished.prs.map((pr) => (
              <li key={pr.exerciseName}>
                {pr.exerciseName}: new PR, {pr.load} {pr.unit} × {pr.reps}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.heroMeta}>Session logged.</p>
        )}
        {today.nextDayName ? (
          <p className={styles.heroMeta}>Next: {today.nextDayName}</p>
        ) : null}
        <div className={styles.heroActions}>
          {today.nextDayName ? startForm(`Start ${today.nextDayName}`) : null}
          <Link
            href={`/train/session/${finished.sessionId}/summary`}
            className={styles.secondaryButton}
          >
            View summary
          </Link>
          <Link href={`/app/programs/${programId}`} className={styles.secondaryButton}>
            View program
          </Link>
        </div>
      </section>
    );
  }

  const minutes = today.estimatedMinutes;
  return (
    <section className={styles.hero} aria-labelledby="today-heading">
      <p className={styles.heroEyebrow}>{today.state === "IN_PROGRESS" ? "In progress" : "Today"}</p>
      <h2 id="today-heading" className={styles.heroTitle}>
        {today.dayName}
      </h2>
      <p className={styles.heroMeta}>
        {today.isRestDay
          ? "Rest day. No training scheduled."
          : `About ${minutes} min · ${today.exercises.length} ${today.exercises.length === 1 ? "exercise" : "exercises"}`}
        {" · "}
        {programName}
      </p>
      {today.comebackDays !== null ? (
        <p className={styles.todayComeback}>
          Welcome back. Today runs about 10% lighter on purpose.
        </p>
      ) : null}
      {today.exercises.length > 0 ? (
        <ul className={styles.todayList}>
          {today.exercises.map((e) => {
            const reps = e.repsLow === e.repsHigh ? `${e.repsHigh}` : `${e.repsLow}–${e.repsHigh}`;
            const target =
              e.targetWeight === null
                ? "first time"
                : e.targetWeight === 0
                  ? `${reps} reps`
                  : `${e.targetWeight} ${loadUnitLabel(e.unit, e.equipment).replace("per dumbbell", "each")} × ${reps}`;
            return (
              <li key={e.prescriptionId} className={styles.todayExercise}>
                <span className={styles.todayName}>{e.name}</span>
                <span className={styles.todayTarget}>{target}</span>
                {e.last && e.last.load !== null && e.last.reps !== null ? (
                  <span className={styles.todayLast}>
                    last {e.last.load === 0 ? "bodyweight" : e.last.load} × {e.last.reps}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className={styles.heroActions}>
        {today.state === "IN_PROGRESS" && today.sessionId ? (
          <Link href={`/train/session/${today.sessionId}`} className={styles.primaryButton}>
            Continue
          </Link>
        ) : (
          startForm(today.isRestDay ? "Open rest day" : "Start")
        )}
        <Link href={`/app/programs/${programId}`} className={styles.secondaryButton}>
          View program
        </Link>
      </div>
    </section>
  );
}

/**
 * Phase A2: an informational line when the last completed session is more
 * than 3 days old. Not a streak and not a nag (Final Freeze §26): a fact,
 * shown only while a block is active.
 */
function WelcomeBack({ lastCompletedSessionAt }: { lastCompletedSessionAt: Date | null }) {
  if (lastCompletedSessionAt === null) return null;
  const days = Math.floor((Date.now() - lastCompletedSessionAt.getTime()) / MS_PER_DAY);
  if (days <= 3) return null;
  return (
    <p className={styles.welcomeBack}>
      Welcome back. Last trained {days} days ago.
    </p>
  );
}

function RecentBlock({
  block,
}: {
  block: { id: string; status: "ACTIVE" | "COMPLETED" | "ABANDONED"; startedAt: Date; endedAt: Date | null };
}) {
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <section className={styles.recentBlocks} aria-labelledby="recent-blocks-heading">
      <p id="recent-blocks-heading" className={styles.blockStripTitle}>
        Recent blocks
      </p>
      <p className={styles.muted}>
        {block.status === "COMPLETED" ? "Completed" : "Abandoned"} · {fmt(block.startedAt)} –{" "}
        {block.endedAt ? fmt(block.endedAt) : "?"}
      </p>
      <p className={styles.recentBlockLinks}>
        <Link href={`/app/review/${block.id}`} className={styles.footerAnchor}>
          Review
        </Link>
        {" · "}
        <Link href={`/app/blocks/${block.id}/report`} className={styles.footerAnchor}>
          Block Report
        </Link>
      </p>
    </section>
  );
}
