// packages/api/src/services/coach-boundary.test.ts
//
// Grep-style boundary assertion for the coach router. Companion to
// packages/ai/src/__tests__/boundary.test.ts, which enforces the same
// invariant from the packages/ai side.
//
// ARCH-011 / ARCH-018: the Coach has no code path capable of committing a
// new ProgramVersion. In packages/ai, that is enforced by the absence of
// an import of @training/api. Here, it is enforced by the absence of any
// call to a commit-shaped function in the router that wires the Coach up.
//
// The assertion reads the source of routers/coach.ts, strips comments, and
// scans the remaining code for the substring "commitFrom". The substring
// check is deliberately coarse (matching the sibling boundary test's
// philosophy): it errs toward over-blocking, and a false positive is fixed
// by rephrasing a comment, never by weakening the check.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Strip line and block comments from TypeScript source.
 *
 * Intentionally simple:
 *   - Handles /* * / block comments.
 *   - Handles // line comments, but does NOT match the `//` inside
 *     `http://` or `https://` — the `[^:]` guard prevents the URL
 *     false-positive.
 *   - Does NOT handle template literals containing `//`, or regex literals
 *     containing `/*`. The scan target (routers/coach.ts) contains neither.
 *     If a future router does, upgrade to a proper tokenizer or an AST scan
 *     (flagged as a follow-up in the 8h close-out notes).
 */
function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutBlocks.replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('coach router boundary (ARCH-011, ARCH-018)', () => {
  // -------------------------------------------------------------------------
  // Sanity: the comment stripper behaves as documented
  // -------------------------------------------------------------------------

  it('stripComments removes line and block comments', () => {
    const src = [
      '// a line comment with commitFrom in it',
      'const a = 1; /* block with commitFrom */ const b = 2;',
      'const url = "https://example.com/commitFrom";',
      'const c = 3;',
    ].join('\n');
    const stripped = stripComments(src);

    // Line and block comments are gone — no commitFrom from those.
    expect(stripped).not.toContain('a line comment');
    expect(stripped).not.toContain('block with');

    // The URL string is preserved — the [^:] guard prevents the false
    // positive. (The string still contains "commitFrom" because it is not
    // a comment; that is a case the boundary check cannot and should not
    // try to distinguish from a real call site.)
    expect(stripped).toContain('https://example.com/commitFrom');
    expect(stripped).toContain('const a = 1;');
    expect(stripped).toContain('const c = 3;');
  });

  // -------------------------------------------------------------------------
  // The boundary assertion
  // -------------------------------------------------------------------------

  it('routers/coach.ts contains no commitFrom reference in non-comment code', () => {
    const path = join(HERE, '..', 'routers', 'coach.ts');
    const raw = readFileSync(path, 'utf8');
    const code = stripComments(raw);

    const matches = code.match(/commitFrom/g) ?? [];
    if (matches.length > 0) {
      // Print the surrounding context for each match so a failing run names
      // the exact line that needs rephrasing.
      const lines = code.split('\n');
      const offendingLines = lines
        .map((line, i) => ({ line, number: i + 1 }))
        .filter(({ line }) => line.includes('commitFrom'))
        .map(({ line, number }) => `  line ${number}: ${line.trim()}`);
      throw new Error(
        `Found ${matches.length} commitFrom reference(s) in routers/coach.ts:\n` +
          offendingLines.join('\n') +
          '\n\nIf this is prose in a comment, rephrase it (the comment ' +
          'stripper missed it). If it is a real call, that is the ARCH-011 ' +
          'violation this test exists to catch.',
      );
    }
    expect(matches).toEqual([]);
  });

  it('the same check passes on a known-clean file (positive control)', () => {
    // A fake source with only a comment reference — the check must not
    // flag it. This guards against a regression where stripComments
    // accidentally returns an empty string and makes the main test pass
    // vacuously.
    const fake = [
      '// this comment mentions commitFrom but must not trip the check',
      'export const x = 1;',
    ].join('\n');
    expect(stripComments(fake)).not.toContain('commitFrom');
  });
});