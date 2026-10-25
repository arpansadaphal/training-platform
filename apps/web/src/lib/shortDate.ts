// apps/web/src/lib/shortDate.ts
//
// Short dates for the training record, in the viewer's own time zone. Used in
// client components, which the server also renders in its own zone, so the
// element that shows one carries suppressHydrationWarning (project convention).

const SHORT = { month: "short", day: "numeric" } as const;

/** "Oct 25". The year is added for a date outside the current year ("Oct 25, 2025"). */
export function formatShortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", sameYear ? SHORT : { ...SHORT, year: "numeric" });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today", "Yesterday", else the short date. */
export function formatConversationalDate(iso: string, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return formatShortDate(iso, now);
}
