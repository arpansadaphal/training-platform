// apps/web/src/lib/loadLabels.ts
//
// Phase A: one place that says what a weight number means for an exercise, so the Builder, the session
// logger and the logged-set lines agree. Display only; nothing is stored differently.
//
// Dumbbell exercises are entered per dumbbell (the weight printed on one bell), which is how lifters
// read and talk about them. Every other implement is the total load.

export function isPerDumbbell(equipment: string | null | undefined): boolean {
  return equipment === "dumbbell";
}

/** "kg per dumbbell", or just "kg". */
export function loadUnitLabel(unit: string, equipment: string | null | undefined): string {
  return isPerDumbbell(equipment) ? `${unit} per dumbbell` : unit;
}

/** RIR options for the Builder's effort select: value is the target RPE (10 - RIR). */
export const EFFORT_OPTIONS: ReadonlyArray<{ rpe: number; label: string }> = [
  { rpe: 10, label: "0 RIR (to failure)" },
  { rpe: 9, label: "1 RIR" },
  // The Builder's default (DEFAULT_TARGET_RPE). Labelled so it does not read as a prescription.
  { rpe: 8, label: "2 RIR (default — edit if different)" },
  { rpe: 7, label: "3 RIR" },
  { rpe: 6, label: "4 RIR" },
  { rpe: 5, label: "5+ RIR (easy)" },
];

/** Default effort for a newly added exercise: 2 reps in reserve (RPE 8). Visible and editable. */
export const DEFAULT_TARGET_RPE = 8;
