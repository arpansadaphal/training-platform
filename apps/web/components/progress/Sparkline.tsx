// apps/web/components/progress/Sparkline.tsx
//
// A bare trend line for the collapsed Progress row: no axes, no labels, the
// newest point marked. Decorative (aria-hidden): the row's verdict line says
// the same thing in words.

interface SparklineProps {
  values: readonly number[];
  width?: number;
  height?: number;
}

export function Sparkline({ values, width = 88, height = 32 }: SparklineProps) {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <line
          x1="8"
          x2={width - 8}
          y1={height / 2}
          y2={height / 2}
          stroke="var(--border, #ddd)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="2 5"
        />
      </svg>
    );
  }
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (values.length - 1);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent, #047857)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={x(last)}
        cy={y(values[last]!)}
        r="3.5"
        fill="var(--accent, #047857)"
        stroke="var(--bg, #fff)"
        strokeWidth="2"
      />
    </svg>
  );
}
