// Converts the Everkinetic drawings named in mapping.ts into the web app's own files.
//
//   pnpm --filter web exec tsx scripts/illustrations/build.ts --source /path/to/checkout-of-everkinetic-data
//
// Reads the checkout (at the pinned commit, or it stops), and writes
//   public/exercises/<slug>-1.webp, <slug>-2.webp   the start and end frame, 480x480
//   src/lib/exerciseIllustrations.json              the manifest the session screen reads
//
// Frame source, per exercise: the vector pair in src/exercises/<id>/ (relaxation = start, tension = end) when it
// exists, otherwise the two raster frames of src/images-web/. The images-ai and images-png-unknown folders are
// never read: their provenance is not stated.
//
// The only changes made to a drawing are the ones CC BY-SA asks us to say on /credits: rasterised if it was a
// vector, scaled to fit a 480 px square on white, and saved as WebP.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { EVERKINETIC_SOURCE, ILLUSTRATION_SOURCES } from "./mapping";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "../..");
const OUT_DIR = join(WEB, "public/exercises");
const MANIFEST = join(WEB, "src/lib/exerciseIllustrations.json");
const SIZE = 480;

interface RasterRow {
  id_num: string;
  img?: string[];
}

export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sourceArg(): string {
  const i = process.argv.indexOf("--source");
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value) throw new Error("Usage: build.ts --source <checkout of everkinetic/data>");
  return resolve(value);
}

async function render(file: string): Promise<Buffer> {
  const isSvg = file.endsWith(".svg");
  // A vector is rasterised large and scaled down, so the lines stay crisp.
  const input = sharp(file, isSvg ? { density: 300 } : {});
  return input
    .resize(SIZE, SIZE, { fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .webp({ quality: 80, effort: 6 })
    .toBuffer();
}

async function main(): Promise<void> {
  const source = sourceArg();
  const head = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (head !== EVERKINETIC_SOURCE.commit) {
    throw new Error(
      `Checkout is at ${head}; mapping.ts is pinned to ${EVERKINETIC_SOURCE.commit}.`,
    );
  }

  const rows = JSON.parse(readFileSync(join(source, "exercises.json"), "utf8")) as RasterRow[];
  const rowById = new Map(rows.map((r) => [r.id_num, r]));

  mkdirSync(OUT_DIR, { recursive: true });
  const written = new Set<string>();
  const exercises: Record<string, unknown> = {};

  for (const [name, entry] of Object.entries(ILLUSTRATION_SOURCES)) {
    const dir = join(source, "src/exercises", entry.id);
    const meta = JSON.parse(readFileSync(join(dir, `${entry.id}.json`), "utf8")) as {
      title: string;
    };

    let frames: [string, string];
    const startSvg = join(dir, `${entry.id}-relaxation.svg`);
    const endSvg = join(dir, `${entry.id}-tension.svg`);
    if (existsSync(startSvg) && existsSync(endSvg)) {
      frames = [startSvg, endSvg];
    } else {
      const img = rowById.get(entry.id)?.img ?? [];
      const files = img.map((p) => join(source, "src/images-web", p.split("/").pop()!));
      if (files.length !== 2 || !files.every(existsSync)) {
        throw new Error(`${name} (${entry.id}): no vector pair and no two raster frames.`);
      }
      frames = [files[0]!, files[1]!];
    }

    const slug = slugOf(name);
    for (const [n, frame] of frames.entries()) {
      const out = `${slug}-${n + 1}.webp`;
      writeFileSync(join(OUT_DIR, out), await render(frame));
      written.add(out);
    }
    exercises[name] = {
      slug,
      everkineticId: entry.id,
      everkineticTitle: meta.title,
      tier: entry.tier,
      ...(entry.note ? { note: entry.note } : {}),
    };
  }

  for (const f of readdirSync(OUT_DIR))
    if (f.endsWith(".webp") && !written.has(f)) rmSync(join(OUT_DIR, f));

  const manifest = { source: EVERKINETIC_SOURCE, size: SIZE, exercises };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${Object.keys(exercises).length} exercises, ${written.size} images -> ${OUT_DIR}`);
}

// Importing slugOf (tests) must not run the build.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
