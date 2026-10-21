// apps/web/components/review/SessionLog.tsx
//
// ARCH-058: the block summary line and per-session log (status, date,
// duration) shared by Review and the Block Report. Durations come from
// Session.startedAt / completedAt; nothing is estimated.

import styles from "./SessionLog.module.css";

/** ARCH-058. */
export interface ClientAdherenceSummary {
  sessionsSkipped: number;
  exercisesNotDone: number;
  exercisesUnlogged: number;
}

/** ARCH-058: dates as ISO strings per the Client* convention. */
export interface ClientSessionLogEntry {
  sessionId: string;
  sequenceIndex: number;
  workoutDayName: string;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
  startedAtIso: string | null;
  completedAtIso: string | null;
  durationMinutes: number | null;
}


function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 sessions completed · 1 skipped · 4 exercises not done · 2 exercises with no sets logged." */
export function summaryLine(
  completedSessions: number,
  summary: ClientAdherenceSummary,
): string {
  const parts = [plural(completedSessions, "session completed", "sessions completed")];
  if (summary.sessionsSkipped > 0) parts.push(`${summary.sessionsSkipped} skipped`);
  if (summary.exercisesNotDone > 0)
    parts.push(plural(summary.exercisesNotDone, "exercise not done", "exercises not done"));
  if (summary.exercisesUnlogged > 0)
    parts.push(
      plural(summary.exercisesUnlogged, "exercise with no sets logged", "exercises with no sets logged"),
    );
  return `This block: ${parts.join(" · ")}.`;
}

/** "1h 05m" / "48m". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** ARCH-058 session log, shared with the Block Report. */
export function SessionLogList({ entries }: { entries: ClientSessionLogEntry[] }) {
  return (
    <ul className={styles.sessionLog}>
      {entries.map((e) => (
        <li key={e.sessionId} className={styles.sessionLogItem}>
          <span>
            {e.sequenceIndex + 1}. {e.workoutDayName}
          </span>
          <span className={styles.muted} suppressHydrationWarning>
            {e.status === "SKIPPED"
              ? "Skipped"
              : e.status === "COMPLETED"
                ? [
                    e.completedAtIso
                      ? new Date(e.completedAtIso).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : null,
                    e.durationMinutes !== null ? formatDuration(e.durationMinutes) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : e.status === "IN_PROGRESS"
                  ? "In progress"
                  : "Not started"}
          </span>
        </li>
      ))}
    </ul>
  );
}