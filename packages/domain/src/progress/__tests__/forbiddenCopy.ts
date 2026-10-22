// Mirrors FORBIDDEN_PATTERNS in packages/api/src/services/blockReport.test.ts
// (invariants 9 and 10, plus the no-streak / no-loss-aversion non-goals).
// Kept as a copy so the existing Block Report test is untouched; extend both
// together.

export const FORBIDDEN_COPY_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "outcome guarantee (will)", re: /\bwill\b/i },
  { name: "outcome guarantee (guarantee)", re: /\bguarantee/i },
  { name: "outcome guarantee (ensure)", re: /\bensure/i },
  { name: "outcome percentage claim", re: /\d+\s*%\s*(more|less|faster|bigger|stronger)/i },
  { name: "optimality claim", re: /\b(optimal|best|ideal)\b/i },
  { name: "medical claim", re: /\b(diagnos|injur|treat(ment)?|rehab)\b/i },
  { name: "streak framing", re: /\bstreak\b/i },
  { name: "loss-aversion framing", re: /\bdon'?t lose\b|\bmissing out\b|\bmiss out\b/i },
  { name: "cause attribution", re: /\b(recovery|technique|form|fatigue|overtrain)/i },
];

export function assertCleanCopy(lines: readonly string[]): void {
  for (const line of lines) {
    for (const { name, re } of FORBIDDEN_COPY_PATTERNS) {
      if (re.test(line)) {
        throw new Error(`Forbidden copy (${name}): "${line}"`);
      }
    }
  }
}
