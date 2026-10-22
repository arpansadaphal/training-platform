"use client";

// apps/web/components/progress/ProgressList.tsx
//
// The Progress accordion: one exercise open at a time, collapsed by default,
// so a phone screen holds the whole list. A collapsed row is the exercise name,
// its verdict line and a sparkline of top-set weight. Opening a row shows the
// weight chart, the estimated 1RM and PR chips, and the volume trend.

import { useState } from "react";
import type { ProgressExercise } from "@training/api";
import { fmtLoad, fmtVolume } from "@/src/lib/progressFormat";
import { LineChart, type ChartPoint } from "./LineChart";
import { Sparkline } from "./Sparkline";
import styles from "./progress.module.css";

export function ProgressList({ exercises }: { exercises: readonly ProgressExercise[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className={styles.list}>
      {exercises.map((ex) => {
        const open = openId === ex.exerciseId;
        const panelId = `progress-panel-${ex.exerciseId}`;
        return (
          <li key={ex.exerciseId} className={styles.item}>
            <button
              type="button"
              className={styles.row}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpenId(open ? null : ex.exerciseId)}
            >
              <span className={styles.rowText}>
                <span className={styles.rowName}>{ex.exerciseName}</span>
                <span className={styles.rowVerdict}>{verdictText(ex)}</span>
              </span>
              <Sparkline values={ex.records.map((r) => r.topSet.weight)} />
              <span className={styles.chevron} aria-hidden="true">
                {open ? "−" : "+"}
              </span>
            </button>
            {open ? (
              <div id={panelId} className={styles.panel}>
                <Detail ex={ex} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The verdict line without its repeated exercise-name prefix. */
function verdictText(ex: ProgressExercise): string {
  const prefix = `${ex.exerciseName}: `;
  const line = ex.verdictLine;
  const text = line.startsWith(prefix) ? line.slice(prefix.length) : line;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Detail({ ex }: { ex: ProgressExercise }) {
  if (ex.records.length === 0) {
    return (
      <p className={styles.panelNote}>
        No weight has been logged for this exercise yet, so there is no trend to chart.
      </p>
    );
  }

  const unit = ex.unit;
  const latest = ex.records[ex.records.length - 1]!;
  const pr = ex.personalRecord;

  const weightPoints: ChartPoint[] = ex.records.map((r) => ({
    date: r.date,
    value: r.topSet.weight,
    detail: `${fmtLoad(r.topSet.weight)} ${unit} × ${r.topSet.reps}${
      r.topSet.rpe === null ? "" : ` @ RPE ${fmtLoad(r.topSet.rpe)}`
    }`,
  }));
  const volumePoints: ChartPoint[] = ex.records.map((r) => ({
    date: r.date,
    value: r.totalVolume,
    detail: `${fmtVolume(r.totalVolume)} ${unit} total`,
  }));

  return (
    <>
      <div className={styles.chips}>
        <span className={styles.chip}>
          Est. 1RM <strong>{fmtLoad(latest.estimated1RM)} {unit}</strong>
        </span>
        {pr !== null ? (
          <span className={`${styles.chip} ${styles.chipPr}`}>
            PR <strong>{fmtLoad(pr.topSet.weight)} {unit} × {pr.topSet.reps}</strong>
          </span>
        ) : null}
      </div>

      <h3 className={styles.chartTitle}>Top set weight</h3>
      <LineChart
        points={weightPoints}
        formatValue={(n) => `${fmtLoad(n)}`}
        label={`${ex.exerciseName} top set weight in ${unit} over ${ex.records.length} sessions`}
      />

      <h3 className={styles.chartTitle}>Total volume per session</h3>
      <LineChart
        points={volumePoints}
        formatValue={(n) => fmtVolume(n)}
        label={`${ex.exerciseName} total volume in ${unit} over ${ex.records.length} sessions`}
        height={132}
      />
      <p className={styles.footnote}>
        Estimated 1RM uses the Epley formula and is an estimate from your logged sets.
      </p>
    </>
  );
}
