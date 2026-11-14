// Which exercises have a drawing, read from the manifest scripts/illustrations/build.ts writes.

import manifest from "./exerciseIllustrations.json";

export interface ExerciseIllustration {
  /** Files are /exercises/<slug>-1.webp and /exercises/<slug>-2.webp: the two ends of the movement. */
  slug: string;
  size: number;
}

const byName = manifest.exercises as Record<string, { slug: string }>;

/** The drawing for an exercise by its library name, or null when it has none (about a third do not). */
export function illustrationFor(exerciseName: string): ExerciseIllustration | null {
  const entry = byName[exerciseName];
  return entry ? { slug: entry.slug, size: manifest.size } : null;
}

export const ILLUSTRATION_CREDIT = {
  name: "Everkinetic",
  url: manifest.source.repository,
  license: "CC BY-SA 4.0",
  licenseUrl: manifest.source.licenseUrl,
} as const;
