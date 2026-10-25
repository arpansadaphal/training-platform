"use client";

// apps/web/app/app/journal/JournalList.tsx
//
// The journal's entries as diary cards, and "Load older". Dates are formatted
// here, in the browser, so "Yesterday" means the lifter's yesterday. A note is
// shown exactly as written.

import { useState } from "react";
import type { JournalPage } from "@training/api";
import { durationText } from "@training/domain";
import { TRPCProvider, trpc } from "@/src/lib/trpc";
import { formatConversationalDate } from "@/src/lib/shortDate";
import styles from "./journal.module.css";

export function JournalList({ initial }: { initial: JournalPage }) {
  return (
    <TRPCProvider>
      <JournalListInner initial={initial} />
    </TRPCProvider>
  );
}

function JournalListInner({ initial }: { initial: JournalPage }) {
  const [entries, setEntries] = useState(initial.entries);
  const [nextBefore, setNextBefore] = useState(initial.nextBefore);
  const [failed, setFailed] = useState(false);
  const utils = trpc.useUtils();
  const [loading, setLoading] = useState(false);

  async function loadOlder() {
    if (nextBefore === null || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const page = await utils.journal.get.fetch({ before: nextBefore });
      setEntries((prev) => [...prev, ...page.entries]);
      setNextBefore(page.nextBefore);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ol className={styles.list} aria-label="Sessions, newest first">
        {entries.map((e) => (
          <li key={e.sessionId} className={styles.entry} data-journal-entry>
            <div className={styles.entryTop}>
              <span className={styles.date} suppressHydrationWarning>
                {formatConversationalDate(e.completedAt)}
              </span>
              {e.durationMinutes !== null ? (
                <span className={styles.duration}>{durationText(e.durationMinutes)}</span>
              ) : null}
            </div>
            <h2 className={styles.day}>{e.dayName}</h2>
            {e.topSets.length > 0 ? (
              <ul className={styles.topSets}>
                {e.topSets.map((t) => (
                  <li key={t.exerciseId}>{t.text}</li>
                ))}
              </ul>
            ) : null}
            {e.prLine !== null ? <p className={styles.pr}>{e.prLine}</p> : null}
            {e.note !== null ? <p className={styles.note}>{e.note}</p> : null}
          </li>
        ))}
      </ol>
      {nextBefore !== null ? (
        <div className={styles.more}>
          <button type="button" className={styles.loadOlder} onClick={loadOlder} disabled={loading}>
            {loading ? "Loading…" : "Load older"}
          </button>
          {failed ? (
            <p className={styles.error} role="status">
              Couldn&apos;t load older sessions. Try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
