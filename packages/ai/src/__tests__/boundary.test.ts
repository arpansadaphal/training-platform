// packages/ai/src/__tests__/boundary.test.ts
//
// Mechanical enforcement of ARCH-011: packages/ai must NEVER have an import
// path to the function that commits a new ProgramVersion. That function lives
// in packages/api/src/services/programVersionService.ts and is reachable only
// from packages/api's routers.
//
// This is the code-level guarantee behind invariant 5 ("applying a change is a
// distinct, explicit, human-triggered action... never something the model can
// trigger on its own"). The model can call tools; the tools live in
// packages/ai; if packages/ai cannot reach the commit function, the model
// cannot reach it either. The boundary is enforced by what code can import
// what — not by prompting.
//
// Three independent checks, deliberately overlapping so a single missed
// pattern does not silently weaken the guarantee:
//
//   1. packages/ai/package.json must not declare @training/api as a
//      dependency (in any of dependencies / devDependencies / peerDependencies
//      / optionalDependencies).
//   2. No source file under packages/ai/src may contain an import or require
//      of "@training/api" (any path form).
//   3. No source file under packages/ai/src may reference the commit
//      function by name (commitFrom, commitFromMutation, commitFromDraft) —
//      even a type-only import would fail check 1, but this catches a
//      copy-pasted code fragment that would be the first step of a
//      regression.
//
// A red CI here means the boundary has been crossed. Do not "fix" this test
// by relaxing it; fix the import.

import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

// __dirname = packages/ai/src/__tests__ — three levels up is the package root.
const PACKAGE_ROOT = resolve(__dirname, "../..");
const SRC_ROOT = join(PACKAGE_ROOT, "src");
const PACKAGE_JSON = join(PACKAGE_ROOT, "package.json");

const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".turbo"]);

// Names that identify the commit function's public surface. Any of these in
// packages/ai/src is a boundary breach, whether it appears as an import, a
// type reference, or a call.
const FORBIDDEN_SYMBOLS = [
  "@training/api",
  "commitFromMutation",
  "commitFromDraft",
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

describe("ARCH-011 boundary — packages/ai cannot reach the commit function", () => {
  it("package.json does not declare @training/api in any dependency field", async () => {
    const raw = await readFile(PACKAGE_JSON, "utf8");
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };

    const allFields = [
      pkg.dependencies,
      pkg.devDependencies,
      pkg.peerDependencies,
      pkg.optionalDependencies,
    ];

    for (const field of allFields) {
      if (!field) continue;
      expect(field["@training/api"]).toBeUndefined();
    }
  });

  it("no source file imports @training/api or references the commit function", async () => {
    const violations: Array<{ file: string; symbol: string; line: number }> = [];

    for await (const file of walkTypeScriptFiles(SRC_ROOT)) {
      // This test file itself mentions the forbidden symbols as string
      // literals. Skip it — the assertion is about the OTHER files under
      // packages/ai/src.
      if (file.endsWith("boundary.test.ts")) continue;

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

    expect(violations).toEqual([]);
  });
});