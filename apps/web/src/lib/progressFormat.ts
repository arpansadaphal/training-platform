// apps/web/src/lib/progressFormat.ts
//
// Number formatting shared by the Progress view, the dashboard block and the
// post-workout summary.

/** 100 -> "100", 102.5 -> "102.5", 102.4999 -> "102.5". */
export function fmtLoad(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** 4500 -> "4,500". */
export function fmtVolume(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** 3725 -> "1h 2m", 2700 -> "45m", 40 -> "<1m". */
export function fmtDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "<1m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
