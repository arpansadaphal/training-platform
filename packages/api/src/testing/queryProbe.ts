// packages/api/src/testing/queryProbe.ts
//
// Test-only: counts the Prisma calls a function makes and the length of its
// longest chain of calls that each had to wait for the one before. On Vercel
// every call is a network round trip to the database, so the chain, not the
// count, is what a user waits for (ARCH-062's perf budget tests use this).
//
// Prisma middleware cannot be removed once added, so one hook is installed on
// first use and records only while a measurement is open. Measurements must
// not overlap; the vitest config runs files in a single fork, and tests inside
// a file are sequential.

import { prisma } from "@training/db";

interface Call {
  label: string;
  start: number;
  end: number;
}

let open: Call[] | null = null;
let installed = false;

function install(): void {
  if (installed) return;
  installed = true;
  prisma.$use(async (params, next) => {
    const sink = open;
    if (sink === null) return next(params);
    const start = performance.now();
    try {
      return await next(params);
    } finally {
      sink.push({
        label: `${params.model ?? "raw"}.${params.action}`,
        start,
        end: performance.now(),
      });
    }
  });
}

export interface QueryMeasurement<T> {
  result: T;
  /** Prisma calls made. */
  calls: number;
  /** Longest chain of calls where each started after the previous one finished. */
  depth: number;
  /** Per-call labels in start order, for reading a report. */
  labels: string[];
  /** Wall time of fn in ms. Against a latency proxy this is roughly depth x round trip. */
  ms: number;
}

export async function measureQueries<T>(fn: () => Promise<T>): Promise<QueryMeasurement<T>> {
  install();
  const sink: Call[] = [];
  open = sink;
  const t0 = performance.now();
  let result: T;
  try {
    result = await fn();
  } finally {
    open = null;
  }
  const ms = Math.round(performance.now() - t0);
  const calls = [...sink].sort((a, b) => a.start - b.start);
  const level: number[] = [];
  let depth = 0;
  calls.forEach((c, i) => {
    let best = 0;
    for (let j = 0; j < i; j++) {
      if (calls[j]!.end <= c.start && level[j]! > best) best = level[j]!;
    }
    level[i] = best + 1;
    if (level[i]! > depth) depth = level[i]!;
  });
  return { result, calls: calls.length, depth, labels: calls.map((c) => c.label), ms };
}
