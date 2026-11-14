// The lint for exercise cues (packages/db/prisma/cues.ts). Cues are copy the app shows a lifter mid-set, so they
// pass the shared forbidden-copy lint plus the words that turn a cue into a safety or medical claim.
//
// This lives in the domain package because the shared lint does. The cues file is in another package's prisma/
// folder, outside this package's tsc rootDir, so it is loaded by path rather than by a static import.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_COPY_PATTERNS } from "./forbiddenCopy";

interface CuesModule {
  CUE_MAX_CHARS: number;
  EXERCISE_CUES: Readonly<Record<string, { cues: readonly string[]; reviewed: boolean }>>;
}
const { CUE_MAX_CHARS, EXERCISE_CUES } = (await import(
  /* @vite-ignore */ resolve(__dirname, "../../../../db/prisma/cues")
)) as CuesModule;

/** On top of the shared list: no safety, protection or pain language, and no spine cues. */
export const CUE_EXTRA_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "injury", re: /\binjur\w*/i },
  { name: "prevention", re: /\bprevent\w*/i },
  { name: "safety", re: /\bsaf(e|ely|er|ety)\b/i },
  { name: "protection", re: /\bprotect\w*/i },
  { name: "pain", re: /\bpain\w*/i },
  { name: "hurt", re: /\bhurt\w*/i },
  { name: "spine", re: /\bspin(e|al)\b/i },
];

const ALL_PATTERNS = [...FORBIDDEN_COPY_PATTERNS, ...CUE_EXTRA_PATTERNS];

const SEED = readFileSync(resolve(__dirname, "../../../../db/prisma/seed.ts"), "utf8");
const SEED_NAMES = [...SEED.matchAll(/\{ name: "([^"]+)", movementPattern:/g)].map((m) => m[1]!);

/** Every violation, as "Exercise: rule: line", so a failure lists all of them at once. */
function violations(): string[] {
  const out: string[] = [];
  for (const [name, entry] of Object.entries(EXERCISE_CUES)) {
    for (const line of entry.cues) {
      for (const { name: rule, re } of ALL_PATTERNS) {
        if (re.test(line)) out.push(`${name}: ${rule}: "${line}"`);
      }
    }
  }
  return out;
}

describe("the cue lint patterns", () => {
  it.each([
    "Prevent injury",
    "Keeps your spine safe",
    "Protect your lower back",
    "Stop if it hurts",
    "No pain, no gain",
    "A neutral spinal position",
    "Do it safely",
  ])("catches %s", (line) => {
    expect(ALL_PATTERNS.some(({ re }) => re.test(line))).toBe(true);
  });

  it("lets an ordinary cue through", () => {
    const line = "Push the floor away and feel your quads working.";
    expect(ALL_PATTERNS.some(({ re }) => re.test(line))).toBe(false);
  });
});

describe("exercise cues", () => {
  it("cover exactly the seeded exercises", () => {
    expect(SEED_NAMES).toHaveLength(110);
    expect(Object.keys(EXERCISE_CUES).sort()).toEqual([...SEED_NAMES].sort());
  });

  it("have 2-3 lines each, at most CUE_MAX_CHARS characters, and no empty or repeated line", () => {
    for (const [name, { cues }] of Object.entries(EXERCISE_CUES)) {
      expect(cues.length, `${name}: ${cues.length} cues`).toBeGreaterThanOrEqual(2);
      expect(cues.length, `${name}: ${cues.length} cues`).toBeLessThanOrEqual(3);
      expect(new Set(cues).size, `${name}: repeated cue`).toBe(cues.length);
      for (const line of cues) {
        expect(line.trim(), `${name}: blank cue`).not.toBe("");
        expect(line, `${name}: untrimmed cue`).toBe(line.trim());
        expect(line.length, `${name}: ${line.length} chars: "${line}"`).toBeLessThanOrEqual(
          CUE_MAX_CHARS,
        );
      }
    }
  });

  it("pass the shared forbidden-copy lint and the cue patterns", () => {
    expect(violations()).toEqual([]);
  });

  it("are written to the lifter (no first person, no commands to 'the user')", () => {
    for (const [name, { cues }] of Object.entries(EXERCISE_CUES)) {
      for (const line of cues) {
        expect(line, `${name}: "${line}"`).not.toMatch(/\b(I|we|my|users?|lifters?)\b/);
      }
    }
  });
});
