// packages/db/src/__tests__/immutability.test.ts
//
// Mechanical enforcement of invariant 3: "ProgramVersion is immutable once
// committed. Every edit after that produces version N+1, never an in-place
// change."
//
// This test scans the repository's TypeScript sources for any sign that a
// ProgramVersion row is being updated after creation — a symbol named
// `updateProgramVersion`, or a Prisma call of the form
// `programVersion.update(` / `programVersion.updateMany(`. It is a scan,
// not a runtime test: the guarantee it enforces is "such a call does not
// exist in the codebase," which cannot be checked at runtime.
//
// The same pattern is used for the ARCH-011 AI-boundary check in
// packages/ai; the two tests are deliberately similar so a future reader
// recognizes them as the same kind of structural invariant.

import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

// __dirname = packages/db/src/__tests__ — four levels up is the repo root.
const REPO_ROOT = resolve(__dirname, "../../../..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".vercel",
]);

const FORBIDDEN_SYMBOLS = [
  "updateProgramVersion",
  "programVersion.update(",
  "programVersion.updateMany(",
] as const;

async function* walkTypeScriptFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkTypeScriptFiles(full);
    } else if (
      entry.isFile() &&
      (full.endsWith(".ts") || full.endsWith(".tsx"))
    ) {
      yield full;
    }
  }
}

describe("ProgramVersion immutability (invariant 3)", () => {
  it("no source file defines updateProgramVersion or calls programVersion.update", async () => {
    const violations: Array<{ file: string; symbol: string; line: number }> = [];

    for await (const file of walkTypeScriptFiles(REPO_ROOT)) {
      // Skip this test file itself — the FORBIDDEN_SYMBOLS below appear in
      // its own source as strings and would self-trigger.
      if (file.endsWith("immutability.test.ts")) continue;

      const content = await readFile(file, "utf8");
      const lines = content.split("\n");

      for (const symbol of FORBIDDEN_SYMBOLS) {
        lines.forEach((line, idx) => {
          if (line.includes(symbol)) {
            violations.push({ file, symbol, line: idx + 1 });
          }
        });
      }
    }

    // On failure, the diff shows exactly which file/line/symbol matched.
    // A legitimate match would only come from a refactor that intentionally
    // introduced in-place version mutation — which is the invariant
    // violation this test exists to prevent.
    expect(violations).toEqual([]);
  });
});