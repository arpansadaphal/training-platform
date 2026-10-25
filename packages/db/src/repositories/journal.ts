// packages/db/src/repositories/journal.ts
//
// Project 4: reads for the training journal, the export, the milestone line on
// the summary and the "note from last time" on the session screen. All flat
// statements run side by side and joined in memory (nested selects would run
// as extra statements one after another; see performanceRecord.ts).
//
// "Logged session" everywhere here means a COMPLETED Session with at least one
// PerformanceRecord. A session completed with nothing logged is not a training
// session, so it is neither a journal entry nor counted toward a milestone.

import { prisma } from "../client";

export interface JournalSessionRow {
  id: string;
  startedAt: Date | null;
  completedAt: Date;
  dayName: string;
  /** The session's notes, oldest first, verbatim. */
  notes: string[];
}

const LOGGED_COMPLETED_SESSION = (userId: string) =>
  ({
    status: "COMPLETED",
    completedAt: { not: null },
    trainingBlock: { userId },
    performanceRecords: { some: {} },
  }) as const;

/** Every logged session of the user, oldest first, with its day name and notes. */
export async function listJournalSessionsForUser(userId: string): Promise<JournalSessionRow[]> {
  const [sessions, days, observations] = await Promise.all([
    prisma.session.findMany({
      where: LOGGED_COMPLETED_SESSION(userId),
      orderBy: { completedAt: "asc" },
      select: { id: true, workoutDayId: true, startedAt: true, completedAt: true },
    }),
    prisma.workoutDay.findMany({
      where: { sessions: { some: LOGGED_COMPLETED_SESSION(userId) } },
      select: { id: true, name: true },
    }),
    prisma.observation.findMany({
      where: { userId, session: { status: "COMPLETED", trainingBlock: { userId } } },
      orderBy: { createdAt: "asc" },
      select: { sessionId: true, content: true },
    }),
  ]);
  const dayName = new Map(days.map((d) => [d.id, d.name]));
  const notesBySession = new Map<string, string[]>();
  for (const o of observations) {
    if (o.sessionId === null) continue;
    const list = notesBySession.get(o.sessionId);
    if (list === undefined) notesBySession.set(o.sessionId, [o.content]);
    else list.push(o.content);
  }
  return sessions.flatMap((s) =>
    s.completedAt === null
      ? []
      : [
          {
            id: s.id,
            startedAt: s.startedAt,
            completedAt: s.completedAt,
            dayName: dayName.get(s.workoutDayId) ?? "Session",
            notes: notesBySession.get(s.id) ?? [],
          },
        ],
  );
}

/**
 * Each prescription's place in its workout day, for the user's logged sessions.
 * Sets logged in one batch share a timestamp, so the plan's own order is what
 * keeps a journal entry's lifts in a stable, familiar order.
 */
export async function listPrescriptionOrderForUser(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.exercisePrescription.findMany({
    where: { workoutDay: { sessions: { some: LOGGED_COMPLETED_SESSION(userId) } } },
    select: { id: true, orderIndex: true },
  });
  return new Map(rows.map((r) => [r.id, r.orderIndex]));
}

export interface LoggedSessionTime {
  id: string;
  completedAt: Date;
}

/** Id and finish time of every logged session of the user, oldest first. */
export async function listLoggedSessionTimesForUser(userId: string): Promise<LoggedSessionTime[]> {
  const rows = await prisma.session.findMany({
    where: LOGGED_COMPLETED_SESSION(userId),
    orderBy: { completedAt: "asc" },
    select: { id: true, completedAt: true },
  });
  return rows.flatMap((r) => (r.completedAt === null ? [] : [{ id: r.id, completedAt: r.completedAt }]));
}

/**
 * The name of the day a Session belongs to, read by the Session's id alone so
 * it can run beside the ownership check (the caller discards it if the check
 * fails; the notes it leads to are filtered by user id regardless).
 */
export async function findDayOfSessionId(
  sessionId: string,
): Promise<{ name: string; isRestDay: boolean } | null> {
  return prisma.workoutDay.findFirst({
    where: { sessions: { some: { id: sessionId } } },
    select: { name: true, isRestDay: true },
  });
}

export interface DayNoteRow {
  sessionId: string;
  completedAt: Date;
  /** Notes written in that session, oldest first, verbatim. */
  notes: string[];
}

/**
 * The notes written in the user's most recent COMPLETED session of the day
 * named `dayName` (case-insensitive, any program), excluding `excludeSessionId`.
 * Null when there is no earlier session of that day or it has no note. Only
 * the immediately previous session is looked at, so a note comes back once,
 * at the next session of the same day, not every time after.
 */
export async function findNotesOfLatestSessionOfDay(
  userId: string,
  dayName: string,
  excludeSessionId: string,
): Promise<DayNoteRow | null> {
  const sameDay = {
    id: { not: excludeSessionId },
    status: "COMPLETED",
    completedAt: { not: null },
    trainingBlock: { userId },
    workoutDay: { name: { equals: dayName, mode: "insensitive" } },
  } as const;
  const [latest, observations] = await Promise.all([
    prisma.session.findFirst({
      where: sameDay,
      orderBy: { completedAt: "desc" },
      select: { id: true, completedAt: true },
    }),
    prisma.observation.findMany({
      where: { userId, session: sameDay },
      orderBy: [{ session: { completedAt: "desc" } }, { createdAt: "asc" }],
      take: 50,
      select: { sessionId: true, content: true },
    }),
  ]);
  if (latest === null || latest.completedAt === null) return null;
  const notes = observations.filter((o) => o.sessionId === latest.id).map((o) => o.content);
  return notes.length === 0
    ? null
    : { sessionId: latest.id, completedAt: latest.completedAt, notes };
}
