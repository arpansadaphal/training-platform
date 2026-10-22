"use client";

// apps/web/components/progress/LineChart.tsx
//
// One series over sessions. Single measure, single axis, no legend (the
// heading above names the series). Points are spaced by session, not by
// calendar time, so a gap between workouts does not squash the rest. Touch or
// drag anywhere on the plot to read a point; the reading appears as text below
// the chart. A table of the same data sits under "Show as table".

import { useId, useState } from "react";
import { useLocalDates } from "@/src/lib/useLocalDates";
import styles from "./progress.module.css";

export interface ChartPoint {
  /** ISO date of the session. */
  date: string;
  value: number;
  /** Text for the reading, e.g. "105 kg × 5". */
  detail: string;
}

interface LineChartProps {
  points: readonly ChartPoint[];
  /** Formats a value for axis labels, e.g. (n) => `${n} kg`. */
  formatValue: (n: number) => string;
  /** Accessible summary of the chart. */
  label: string;
  height?: number;
}

const W = 320;
const PAD = { left: 44, right: 14, top: 12, bottom: 24 };

export function LineChart({ points, formatValue, label, height = 168 }: LineChartProps) {
  const dates = useLocalDates(points.map((p) => p.date));
  const [picked, setPicked] = useState<number | null>(null);
  const tableId = useId();
  const selected = picked ?? points.length - 1;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const bump = Math.max(1, max * 0.05);
    min -= bump;
    max += bump;
  }
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) =>
    points.length === 1 ? PAD.left + innerW / 2 : PAD.left + (i * innerW) / (points.length - 1);
  const y = (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH;
  const ticks = [min, (min + max) / 2, max];

  function pick(event: React.PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    let nearest = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(i) - px) < Math.abs(x(nearest) - px)) nearest = i;
    }
    setPicked(nearest);
  }

  return (
    <div className={styles.chart}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className={styles.chartSvg}
        role="img"
        aria-label={label}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border, #ddd)"
              strokeWidth="1"
            />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className={styles.axisText}>
              {formatValue(t)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={height - 6} textAnchor="start" className={styles.axisText}>
          {dates[0]}
        </text>
        {points.length > 1 ? (
          <text x={W - PAD.right} y={height - 6} textAnchor="end" className={styles.axisText}>
            {dates[points.length - 1]}
          </text>
        ) : null}
        <polyline
          points={points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
          fill="none"
          stroke="var(--accent, #047857)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={p.date + i}
            cx={x(i)}
            cy={y(p.value)}
            r={i === selected ? 6 : 4}
            fill="var(--accent, #047857)"
            stroke="var(--bg, #fff)"
            strokeWidth="2"
          />
        ))}
        <rect
          x={PAD.left - 10}
          y={0}
          width={innerW + 20}
          height={height}
          fill="transparent"
          className={styles.chartHit}
          onPointerDown={pick}
          onPointerMove={(e) => {
            if (e.buttons === 1) pick(e);
          }}
        />
      </svg>
      <p className={styles.readout} aria-live="polite">
        <span className={styles.readoutDate}>{dates[selected]}</span> {points[selected]!.detail}
      </p>
      <details className={styles.tableToggle}>
        <summary>Show as table</summary>
        <table className={styles.table} aria-label={`${label}, table`} id={tableId}>
          <tbody>
            {points.map((p, i) => (
              <tr key={p.date + i}>
                <th scope="row">{dates[i]}</th>
                <td>{p.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
