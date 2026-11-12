// apps/web/components/assessment/MuscleVolumeTable.tsx
//
// "Weekly sets per muscle" (ARCH-070): every muscle the engine counted, one line each, with a bar against the profile's
// Adequate range. Public checker only. The numbers are the VOLUME axes the findings were built from, so a muscle reads
// the same here as in a card. The bar is decoration: the number and the band name carry the meaning.

import { MUSCLE_VOLUME_COPY, type MuscleVolumeView } from "@training/domain";
import styles from "./assessment.module.css";

/** The bar runs 0 to the start of the Excessive band's neighbourhood: 30 sets, where the profile stops calling it studied. */
const BAR_MAX_SETS = 30;

const pct = (sets: number): string => `${Math.max(0, Math.min(1, sets / BAR_MAX_SETS)) * 100}%`;

export function MuscleVolumeTable({ view }: { view: MuscleVolumeView }) {
  return (
    <section className={styles.section} data-muscle-volume>
      <h2 className={styles.sectionHeading}>{MUSCLE_VOLUME_COPY.heading}</h2>
      <p className={styles.muscleSummary}>
        {MUSCLE_VOLUME_COPY.summary(view.inRange, view.total, view.lowerBound, view.upperBound)}
      </p>
      <table className={styles.muscleTable}>
        <thead>
          <tr>
            <th scope="col">{MUSCLE_VOLUME_COPY.columnMuscle}</th>
            <th scope="col" className={styles.muscleNum}>
              {MUSCLE_VOLUME_COPY.columnSets}
            </th>
            <th scope="col">{MUSCLE_VOLUME_COPY.columnRange}</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.muscle} data-muscle={row.muscle} data-band={row.band}>
              <th scope="row" className={styles.muscleName}>
                {row.label}
              </th>
              <td className={styles.muscleNum}>{Math.round(row.sets * 10) / 10}</td>
              <td>
                <span className={styles.muscleBand}>{row.band}</span>
                <span className={styles.muscleBar} aria-hidden="true">
                  <span
                    className={styles.muscleRange}
                    style={{ left: pct(view.lowerBound), width: `calc(${pct(view.upperBound)} - ${pct(view.lowerBound)})` }}
                  />
                  <span className={styles.muscleFill} data-band={row.band} style={{ width: pct(row.sets) }} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.balanceNote}>{MUSCLE_VOLUME_COPY.footnote}</p>
    </section>
  );
}
