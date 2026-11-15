// The lint for exercise cues (packages/db/prisma/cues.ts). Cues are copy the app shows a lifter mid-set, so they
// pass the shared forbidden-copy lint plus the words that turn a cue into a safety or medical claim.
//
// This lives in the domain package because the shared lint does. The cues file is in another package's prisma/
// folder, outside this package's tsc rootDir, so it is loaded by path rather than by a static import.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_COPY_PATTERNS } from "./forbiddenCopy";

type CueKind = "setup" | "action" | "feel";
interface CueStep {
  kind: CueKind;
  text: string;
}
interface CuesModule {
  CUE_MAX_CHARS: Record<CueKind, number>;
  EXERCISE_CUES: Readonly<Record<string, { cues: readonly CueStep[]; reviewed: boolean }>>;
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
  // Outcome claims about what the exercise does to the body. Movement verbs (drive, press, squeeze) stay allowed.
  { name: "outcome (build)", re: /\bbuild\w*/i },
  { name: "outcome (maximize)", re: /\bmaxim\w*/i },
  { name: "outcome (targets)", re: /\btarget(s|ing|ed)?\b/i },
  { name: "outcome (growth)", re: /\bgrow\w*|\bgains?\b/i },
];

const ALL_PATTERNS = [...FORBIDDEN_COPY_PATTERNS, ...CUE_EXTRA_PATTERNS];

const SEED = readFileSync(resolve(__dirname, "../../../../db/prisma/seed.ts"), "utf8");
const SEED_NAMES = [...SEED.matchAll(/\{ name: "([^"]+)", movementPattern:/g)].map((m) => m[1]!);

/** Every violation, as "Exercise: rule: line", so a failure lists all of them at once. */
function violations(): string[] {
  const out: string[] = [];
  for (const [name, entry] of Object.entries(EXERCISE_CUES)) {
    for (const { text: line } of entry.cues) {
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
    "This builds your upper chest",
    "Maximizes growth in the lats",
    "Targets the inner chest",
    "Guarantee a bigger squat",
    "Ensure your shoulders stay healthy",
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

  it("are either a draft (2-3 action lines, beta) or written (setup, action, feel, reviewed)", () => {
    for (const [name, { cues, reviewed }] of Object.entries(EXERCISE_CUES)) {
      const kinds = cues.map((c) => c.kind);
      if (reviewed) {
        expect(kinds, `${name}: a reviewed cue is setup, action, feel`).toEqual([
          "setup",
          "action",
          "feel",
        ]);
      } else {
        expect(cues.length, `${name}: ${cues.length} cues`).toBeGreaterThanOrEqual(2);
        expect(cues.length, `${name}: ${cues.length} cues`).toBeLessThanOrEqual(3);
        expect(
          kinds.every((k) => k === "action"),
          `${name}: a draft is action lines only`,
        ).toBe(true);
      }
    }
  });

  it("have the 30 written exercises and 80 drafts", () => {
    const written = Object.values(EXERCISE_CUES).filter((e) => e.reviewed).length;
    expect(written).toBe(30);
    expect(Object.keys(EXERCISE_CUES).length - written).toBe(80);
  });

  it("keep every line inside its kind's length limit, with no empty, untrimmed or repeated line", () => {
    for (const [name, { cues }] of Object.entries(EXERCISE_CUES)) {
      expect(new Set(cues.map((c) => c.text)).size, `${name}: repeated cue`).toBe(cues.length);
      for (const { kind, text } of cues) {
        expect(text.trim(), `${name}: blank cue`).not.toBe("");
        expect(text, `${name}: untrimmed cue`).toBe(text.trim());
        expect(
          text.length,
          `${name}: ${kind} is ${text.length} chars: "${text}"`,
        ).toBeLessThanOrEqual(CUE_MAX_CHARS[kind]);
      }
    }
  });

  // Scannable between sets: ~20 words of setup, ~20 of action, ~12 of feel. Two feel lines are the founder's own
  // wording and run longer; they are named here rather than the budget loosened.
  const FOUNDER_FEEL_OVER_BUDGET = new Set(["Lateral Raise", "Romanian Deadlift"]);
  it("keep written cues inside the word budget (setup 20, action 20, feel 12)", () => {
    const budget: Record<CueKind, number> = { setup: 20, action: 20, feel: 12 };
    for (const [name, { cues, reviewed }] of Object.entries(EXERCISE_CUES)) {
      if (!reviewed) continue;
      for (const { kind, text } of cues) {
        if (kind === "feel" && FOUNDER_FEEL_OVER_BUDGET.has(name)) continue;
        const words = text.split(/\s+/).length;
        expect(words, `${name}: ${kind} is ${words} words: "${text}"`).toBeLessThanOrEqual(
          budget[kind],
        );
      }
    }
  });

  it("name a muscle or a sensation in every written feel line", () => {
    const sensation = /\b(feel|squeeze|stretch|tension)\b/i;
    for (const [name, { cues, reviewed }] of Object.entries(EXERCISE_CUES)) {
      if (!reviewed) continue;
      const feel = cues.find((c) => c.kind === "feel")!;
      expect(feel.text, `${name}: "${feel.text}"`).toMatch(sensation);
    }
  });

  it("pass the shared forbidden-copy lint and the cue patterns", () => {
    expect(violations()).toEqual([]);
  });

  it("are written to the lifter (no first person, no commands to 'the user')", () => {
    for (const [name, { cues }] of Object.entries(EXERCISE_CUES)) {
      for (const { text: line } of cues) {
        expect(line, `${name}: "${line}"`).not.toMatch(/\b(I|we|my|users?|lifters?)\b/);
      }
    }
  });
});
