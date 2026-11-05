// packages/domain/src/check/compactProgram.ts
//
// The URL hash / sessionStorage form of a routine: base64url of a small JSON
// array, [[dayName, [[exercise, sets, repLow, repHigh], ...]], ...]. Decoding
// is a trust boundary (anyone can type a hash), so it validates shape and size
// and returns null on anything off.

import type { CompactDay, CompactProgram, CompactRow } from "./types";

export const CHECK_LIMITS = {
  maxDays: 7,
  maxRowsPerDay: 15,
  maxSets: 20,
  maxReps: 100,
  maxNameLength: 80,
  maxDayNameLength: 60,
  maxHashLength: 8000,
} as const;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(hash: string): string | null {
  try {
    const padded = hash.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function encodeCompactProgram(program: CompactProgram): string {
  return toBase64Url(JSON.stringify(program.days.map((d) => [d.name, d.rows])));
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function readRow(value: unknown): CompactRow | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const [name, sets, repLow, repHigh] = value as unknown[];
  if (typeof name !== "string" || name.length === 0 || name.length > CHECK_LIMITS.maxNameLength) return null;
  if (!isInt(sets, 1, CHECK_LIMITS.maxSets)) return null;
  if (!isInt(repLow, 1, CHECK_LIMITS.maxReps) || !isInt(repHigh, 1, CHECK_LIMITS.maxReps) || repLow > repHigh) return null;
  return [name, sets, repLow, repHigh];
}

/** Returns null for a malformed, oversized or empty hash. */
export function decodeCompactProgram(hash: string): CompactProgram | null {
  if (hash.length === 0 || hash.length > CHECK_LIMITS.maxHashLength) return null;
  const text = fromBase64Url(hash);
  if (text === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > CHECK_LIMITS.maxDays) return null;
  const days: CompactDay[] = [];
  for (const entry of raw as unknown[]) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [name, rows] = entry as [unknown, unknown];
    if (typeof name !== "string" || name.length === 0 || name.length > CHECK_LIMITS.maxDayNameLength) return null;
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > CHECK_LIMITS.maxRowsPerDay) return null;
    const parsedRows: CompactRow[] = [];
    for (const row of rows as unknown[]) {
      const parsed = readRow(row);
      if (parsed === null) return null;
      parsedRows.push(parsed);
    }
    days.push({ name, rows: parsedRows });
  }
  return { days };
}
