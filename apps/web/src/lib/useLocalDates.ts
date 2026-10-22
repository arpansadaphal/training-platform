"use client";

// apps/web/src/lib/useLocalDates.ts
//
// Dates render in the viewer's timezone, but a client component is also
// rendered on the server, in the server's. To avoid a hydration mismatch the
// first render uses UTC and an effect swaps in the local form.

import { useEffect, useState } from "react";

function format(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
}

export function useLocalDates(isos: readonly string[]): string[] {
  const key = isos.join("|");
  const [local, setLocal] = useState<string[] | null>(null);
  useEffect(() => {
    setLocal(isos.map((iso) => format(iso)));
  }, [key]);
  return local ?? isos.map((iso) => format(iso, "UTC"));
}
