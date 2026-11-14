// The exercise drawings (apps/web): the mapping, the manifest the screen reads, the files on disk, the seed's
// exercise names and the /credits copy have to agree. This lives in the domain package for the shared copy lint;
// the web app's files are read by path (they are outside this package's tsc rootDir).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_COPY_PATTERNS } from "./forbiddenCopy";

const WEB = resolve(__dirname, "../../../../../apps/web");
const SEED = readFileSync(resolve(__dirname, "../../../../db/prisma/seed.ts"), "utf8");
const SEED_NAMES = [...SEED.matchAll(/\{ name: "([^"]+)", movementPattern:/g)].map((m) => m[1]!);

interface MappingModule {
  EVERKINETIC_SOURCE: { commit: string; license: string };
  ILLUSTRATION_SOURCES: Record<string, { id: string; tier: "exact" | "near"; note?: string }>;
}
interface CreditsModule {
  CREDITS_COPY: Record<string, string>;
}
const { EVERKINETIC_SOURCE, ILLUSTRATION_SOURCES } = (await import(
  /* @vite-ignore */ resolve(WEB, "scripts/illustrations/mapping")
)) as MappingModule;
const { CREDITS_COPY } = (await import(
  /* @vite-ignore */ resolve(WEB, "src/lib/creditsCopy")
)) as CreditsModule;

const manifest = JSON.parse(
  readFileSync(resolve(WEB, "src/lib/exerciseIllustrations.json"), "utf8"),
) as {
  source: { commit: string; license: string };
  size: number;
  exercises: Record<string, { slug: string; everkineticId: string; tier: string; note?: string }>;
};
const IMAGE_DIR = resolve(WEB, "public/exercises");

describe("exercise drawings", () => {
  it("map only exercises in the library, and each Everkinetic id at most once", () => {
    for (const name of Object.keys(ILLUSTRATION_SOURCES)) expect(SEED_NAMES, name).toContain(name);
    const ids = Object.values(ILLUSTRATION_SOURCES).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every near match says how its drawing differs, and no exact match needs to", () => {
    for (const [name, s] of Object.entries(ILLUSTRATION_SOURCES)) {
      if (s.tier === "near")
        expect(s.note?.trim().length ?? 0, `${name} needs a note`).toBeGreaterThan(10);
      else expect(s.note, name).toBeUndefined();
    }
  });

  it("the manifest is exactly what the mapping says, from the pinned CC BY-SA commit", () => {
    expect(manifest.source.commit).toBe(EVERKINETIC_SOURCE.commit);
    expect(manifest.source.license).toBe("CC-BY-SA-4.0");
    expect(Object.keys(manifest.exercises).sort()).toEqual(
      Object.keys(ILLUSTRATION_SOURCES).sort(),
    );
    for (const [name, m] of Object.entries(manifest.exercises)) {
      const s = ILLUSTRATION_SOURCES[name]!;
      expect([m.everkineticId, m.tier, m.note], name).toEqual([s.id, s.tier, s.note]);
    }
  });

  it("have exactly two small WebP frames per mapped exercise, and no stray image", () => {
    const expected = Object.values(manifest.exercises).flatMap((m) => [
      `${m.slug}-1.webp`,
      `${m.slug}-2.webp`,
    ]);
    const onDisk = readdirSync(IMAGE_DIR).filter((f) => f.endsWith(".webp"));
    expect(onDisk.sort()).toEqual(expected.sort());
    for (const f of onDisk) {
      expect(statSync(resolve(IMAGE_DIR, f)).size, f).toBeLessThan(30_000);
      // WebP: "RIFF" .... "WEBP"
      const head = readFileSync(resolve(IMAGE_DIR, f)).subarray(0, 12);
      expect(head.subarray(0, 4).toString(), f).toBe("RIFF");
      expect(head.subarray(8, 12).toString(), f).toBe("WEBP");
    }
  });

  it("ship their attribution next to the images", () => {
    const text = readFileSync(resolve(IMAGE_DIR, "ATTRIBUTION.md"), "utf8");
    expect(text).toContain("Everkinetic");
    expect(text).toContain("CC BY-SA 4.0");
    expect(existsSync(resolve(IMAGE_DIR, "ATTRIBUTION.md"))).toBe(true);
  });
});

describe("/credits copy", () => {
  it("names the source and the license, says what was changed, and passes the forbidden-copy lint", () => {
    const all = Object.values(CREDITS_COPY);
    const text = all.join(" ");
    expect(text).toContain("Everkinetic");
    expect(text).toContain("Greg Priday");
    expect(text).toContain("CC BY-SA 4.0");
    expect(text).toMatch(/did not redraw/);
    // The product name is not decided (D4).
    expect(text).toContain("the training app");
    const hits: string[] = [];
    for (const line of all) {
      for (const { name, re } of FORBIDDEN_COPY_PATTERNS)
        if (re.test(line)) hits.push(`${name}: "${line}"`);
    }
    expect(hits).toEqual([]);
  });
});
