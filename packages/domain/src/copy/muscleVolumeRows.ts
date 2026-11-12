// packages/domain/src/copy/muscleVolumeRows.ts
//
// The "Weekly sets per muscle" view on /check (ARCH-070): every muscle the engine counted, with its weekly hard sets,
// on one line each. Display only. It reads the VOLUME axes the assessment already holds (`allAssessedAxes`), so a number
// here is the number the finding cards, the strengths and the Fit band were built from (invariant 8). Nothing is
// re-counted, graded or stored.
//
// Why it exists: the result showed only the muscles a finding or an "earned" strength (10+ sets) mentioned, so a muscle
// that was fine at 6-9 sets appeared nowhere, and readers asked whether it had been counted at all.

import type { GoalProfileConfig } from "../analysis/types";
import type { AssessedAxis } from "../assessment/types";

export interface MuscleVolumeRow {
  readonly muscle: string;
  /** "Upper back". */
  readonly label: string;
  /** Weekly hard sets, the engine's VOLUME metric (a set also counts toward the muscles it helps). */
  readonly sets: number;
  /** The profile's own band name for that number: Low, Adequate, High or Excessive. */
  readonly band: string;
}

export interface MuscleVolumeView {
  readonly rows: readonly MuscleVolumeRow[];
  /** The Adequate range, from the profile's VOLUME bands. */
  readonly lowerBound: number;
  readonly upperBound: number;
  /** How many muscles sit in the Adequate band, of how many are listed. */
  readonly inRange: number;
  readonly total: number;
}

/** Top to bottom of the body, chest to calves. A muscle the list does not know follows, alphabetically. */
export const MUSCLE_DISPLAY_ORDER: readonly string[] = [
  "chest",
  "lats",
  "upper back",
  "side delts",
  "rear delts",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
];

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function muscleVolumeView(
  axes: readonly AssessedAxis[],
  config: GoalProfileConfig,
): MuscleVolumeView | null {
  const adequate = config.statusBands.VOLUME.find((b) => b.status === "Adequate");
  if (adequate === undefined || adequate.lowerBound === null || adequate.upperBound === null) return null;

  const rank = (muscle: string): number => {
    const at = MUSCLE_DISPLAY_ORDER.indexOf(muscle);
    return at < 0 ? MUSCLE_DISPLAY_ORDER.length : at;
  };
  const rows = axes
    .flatMap((a): MuscleVolumeRow[] =>
      a.axisType === "VOLUME" && a.scopeKey !== null && typeof a.metricValue === "number"
        ? [{ muscle: a.scopeKey, label: capitalise(a.scopeKey), sets: a.metricValue, band: a.status.band }]
        : [],
    )
    .sort((x, y) => rank(x.muscle) - rank(y.muscle) || x.muscle.localeCompare(y.muscle));
  if (rows.length === 0) return null;

  return {
    rows,
    lowerBound: adequate.lowerBound,
    upperBound: adequate.upperBound,
    inRange: rows.filter((r) => r.band === "Adequate").length,
    total: rows.length,
  };
}

const num = (n: number): string => String(Math.round(n * 10) / 10);

export const MUSCLE_VOLUME_COPY = {
  heading: "Weekly sets per muscle",
  summary: (inRange: number, total: number, lo: number, hi: number): string =>
    `${inRange} of ${total} muscles are in the ${num(lo)}–${num(hi)} range.`,
  columnMuscle: "Muscle",
  columnSets: "Hard sets a week",
  columnRange: "Against the range",
  footnote:
    "A set also counts toward the muscles it helps (a bench press counts for triceps at half), the same way the findings count it.",
  rowLabel: (label: string, sets: number, band: string): string => `${label}: ${num(sets)} hard sets a week, ${band}`,
} as const;

/** Every static sentence, for the copy lint. */
export function allMuscleVolumeCopy(): string[] {
  return [
    MUSCLE_VOLUME_COPY.heading,
    MUSCLE_VOLUME_COPY.summary(9, 11, 6, 20),
    MUSCLE_VOLUME_COPY.columnMuscle,
    MUSCLE_VOLUME_COPY.columnSets,
    MUSCLE_VOLUME_COPY.columnRange,
    MUSCLE_VOLUME_COPY.footnote,
    MUSCLE_VOLUME_COPY.rowLabel("Upper back", 5.5, "Low"),
  ];
}
