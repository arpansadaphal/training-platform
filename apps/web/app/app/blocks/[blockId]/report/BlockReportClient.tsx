"use client";

// Client renderer for the Block Report (Phase 10b).
//
// Follows the Phase 6/7 Client* convention: all Date fields are ISO strings
// by the time they arrive here; snapshot Json columns stay as unknown and
// are cast at the AssessmentDisplay call site — same discipline as
// ReviewClient.

import Link from "next/link";
import type { AssessmentResult, FitScoreResult } from "@training/domain";
import { AssessmentDisplay } from "@/components/assessment/AssessmentDisplay";
import styles from "./blockReport.module.css";

export interface ClientBlockReportData {
  blockId: string;
  programId: string;
  programName: string;
  versionNumber: number;
  status: "COMPLETED" | "ABANDONED";
  startedAtIso: string;
  endedAtIso: string | null;
  snapshot: {
    reason: string;
    engineVersion: string;
    thresholdsVersion: string;
    computedAtIso: string;
    /** Raw Json; cast at the AssessmentDisplay call site. */
    assessment: unknown;
    /** Raw Json; cast at the AssessmentDisplay call site. */
    fitScore: unknown;
  };
  execution: {
    sessionsCompleted: number;
    totalSetsLogged: number;
    systematicDeviations: Array<{
      exerciseId: string;
      exerciseName: string;
      kind: string;
      occurrences: number;
    }>;
  };
  observations: Array<{
    id: string;
    content: string;
    createdAtIso: string;
  }>;
  previousBlock: {
    blockId: string;
    startedAtIso: string;
    endedAtIso: string | null;
  } | null;
  narrative: {
    executionLine: string;
    deviationsLine: string | null;
    previousComparisonLines: string[];
    firstBlockLine: string | null;
  };
}

interface Props {
  report: ClientBlockReportData;
}

export function BlockReportClient({ report }: Props) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Block Report — {report.programName}
        </h1>
        <p className={styles.subtitle}>
          Version {report.versionNumber} ·{" "}
          {report.status === "COMPLETED" ? "Completed" : "Ended early"} ·{" "}
          {formatRange(report.startedAtIso, report.endedAtIso)}
        </p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>What happened</h2>
        <div className={styles.narrative}>
          <p className={styles.narrativeLine}>
            {report.narrative.executionLine}
          </p>
          {report.narrative.deviationsLine && (
            <p className={styles.narrativeLine}>
              {report.narrative.deviationsLine}
            </p>
          )}
        </div>
      </section>

      {report.execution.systematicDeviations.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Systematic deviations</h2>
          <ul className={styles.deviations}>
            {report.execution.systematicDeviations.map((d) => (
              <li
                key={`${d.exerciseId}|${d.kind}`}
                className={styles.deviationRow}
              >
                <span className={styles.deviationLabel}>
                  {d.exerciseName} — {humanizeKind(d.kind)}
                </span>
                <span className={styles.deviationCount}>{d.occurrences}×</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>The design you trained</h2>
        {/* Json from the snapshot cast at the call site, per the Client*
            convention. AssessmentDisplay mounts the provisional banner
            itself (ARCH-046). */}
        <AssessmentDisplay
          result={report.snapshot.assessment as AssessmentResult}
          fitScore={report.snapshot.fitScore as FitScoreResult}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Compared to your previous block
        </h2>
        {report.previousBlock === null ? (
          <p className={styles.firstBlockNote}>
            {report.narrative.firstBlockLine}
          </p>
        ) : (
          <>
            <div className={styles.narrative}>
              {report.narrative.previousComparisonLines.map((line, i) => (
                <p key={i} className={styles.narrativeLine}>
                  {line}
                </p>
              ))}
            </div>
            <Link
              href={`/app/blocks/${report.previousBlock.blockId}/report`}
              className={styles.previousLink}
            >
              See the previous block's report
            </Link>
          </>
        )}
      </section>

      {report.observations.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your notes</h2>
          <ul className={styles.observations}>
            {report.observations.map((o) => (
              <li key={o.id} className={styles.observation}>
                <span className={styles.observationDate}>
                  {formatDate(o.createdAtIso)}
                </span>
                {o.content}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.cta}>
        <Link
          href={`/app/programs/${report.programId}/build`}
          className={styles.ctaLink}
        >
          Revise this program
        </Link>
      </div>
    </div>
  );
}

function humanizeKind(kind: string): string {
  switch (kind) {
    case "REPS_BELOW":
      return "reps below plan";
    case "REPS_ABOVE":
      return "reps above plan";
    case "LOAD_BELOW":
      return "load below plan";
    case "LOAD_ABOVE":
      return "load above plan";
    case "SETS_SKIPPED":
      return "sets skipped";
    default:
      return kind.toLowerCase().replace(/_/g, " ");
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatRange(startIso: string, endIso: string | null): string {
  const start = formatDate(startIso);
  if (!endIso) return `${start} — present`;
  return `${start} — ${formatDate(endIso)}`;
}