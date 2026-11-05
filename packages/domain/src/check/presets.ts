// packages/domain/src/check/presets.ts
//
// The six common splits offered on /check. Rows are copied from the coach-parity
// harness programs named in `harnessId` (packages/domain/scripts/coach-parity/
// programs.ts); scripts/coach-parity/checkPresets.test.ts fails if they drift.

import type { CompactProgram } from "./types";

export interface CheckPreset {
  readonly slug: string;
  readonly title: string;
  readonly blurb: string;
  readonly harnessId: string;
  readonly program: CompactProgram;
}

export const CHECK_PRESETS: readonly CheckPreset[] = [
  {
    slug: "full-body-3",
    title: "3-day full body",
    blurb: "Squat, bench, row and press patterns three times a week.",
    harnessId: "S3",
    program: {
      days: [
    {
      name: "Day 1",
      rows: [
      ["Back Squat", 3, 8, 10],
      ["Barbell Bench Press", 3, 8, 10],
      ["Lat Pulldown", 3, 8, 12],
      ["Lateral Raise", 2, 12, 15],
      ["Barbell Curl", 2, 10, 12],
      ],
    },
    {
      name: "Day 2",
      rows: [
      ["Romanian Deadlift", 3, 8, 10],
      ["Overhead Press", 3, 8, 10],
      ["Seated Cable Row", 3, 8, 12],
      ["Leg Press", 2, 10, 12],
      ["Tricep Pushdown", 2, 10, 12],
      ],
    },
    {
      name: "Day 3",
      rows: [
      ["Leg Press", 3, 10, 12],
      ["Incline Dumbbell Press", 3, 8, 12],
      ["Pull-Up", 3, 6, 10],
      ["Leg Curl", 3, 10, 12],
      ["Face Pull", 2, 15, 20],
      ],
    },
      ],
    },
  },
  {
    slug: "upper-lower-4",
    title: "Upper/Lower 4-day",
    blurb: "Two upper days and two lower days.",
    harnessId: "S2",
    program: {
      days: [
    {
      name: "Upper A",
      rows: [
      ["Barbell Bench Press", 4, 6, 8],
      ["Barbell Row", 4, 6, 8],
      ["Overhead Press", 3, 8, 10],
      ["Lat Pulldown", 3, 8, 10],
      ["Tricep Pushdown", 3, 10, 12],
      ["Barbell Curl", 3, 10, 12],
      ],
    },
    {
      name: "Lower A",
      rows: [
      ["Back Squat", 4, 6, 8],
      ["Romanian Deadlift", 3, 8, 10],
      ["Leg Press", 3, 10, 12],
      ["Leg Curl", 3, 10, 12],
      ["Standing Calf Raise", 4, 10, 15],
      ],
    },
    {
      name: "Upper B",
      rows: [
      ["Incline Dumbbell Press", 3, 8, 12],
      ["Seated Cable Row", 3, 8, 12],
      ["Dumbbell Shoulder Press", 3, 8, 12],
      ["Pull-Up", 3, 6, 10],
      ["Lateral Raise", 3, 12, 15],
      ["Skull Crusher", 3, 10, 12],
      ["Hammer Curl", 3, 10, 12],
      ],
    },
    {
      name: "Lower B",
      rows: [
      ["Conventional Deadlift", 3, 5, 5],
      ["Bulgarian Split Squat", 3, 8, 10],
      ["Leg Extension", 3, 10, 15],
      ["Seated Leg Curl", 3, 10, 15],
      ["Seated Calf Raise", 4, 10, 15],
      ],
    },
      ],
    },
  },
  {
    slug: "ppl-6",
    title: "PPL 6-day",
    blurb: "Push, pull and legs, each twice a week.",
    harnessId: "PPLx6",
    program: {
      days: [
    {
      name: "Push",
      rows: [
      ["Barbell Bench Press", 4, 6, 8],
      ["Overhead Press", 3, 8, 10],
      ["Incline Dumbbell Press", 3, 8, 12],
      ["Lateral Raise", 4, 12, 15],
      ["Tricep Pushdown", 3, 10, 12],
      ],
    },
    {
      name: "Pull",
      rows: [
      ["Pull-Up", 4, 6, 10],
      ["Barbell Row", 3, 6, 8],
      ["Face Pull", 3, 15, 20],
      ["Barbell Curl", 3, 8, 12],
      ["Hammer Curl", 2, 10, 12],
      ],
    },
    {
      name: "Legs",
      rows: [
      ["Back Squat", 4, 6, 8],
      ["Romanian Deadlift", 3, 8, 10],
      ["Leg Press", 3, 10, 12],
      ["Leg Curl", 3, 10, 12],
      ["Standing Calf Raise", 4, 10, 15],
      ],
    },
    {
      name: "Push",
      rows: [
      ["Barbell Bench Press", 4, 6, 8],
      ["Overhead Press", 3, 8, 10],
      ["Incline Dumbbell Press", 3, 8, 12],
      ["Lateral Raise", 4, 12, 15],
      ["Tricep Pushdown", 3, 10, 12],
      ],
    },
    {
      name: "Pull",
      rows: [
      ["Pull-Up", 4, 6, 10],
      ["Barbell Row", 3, 6, 8],
      ["Face Pull", 3, 15, 20],
      ["Barbell Curl", 3, 8, 12],
      ["Hammer Curl", 2, 10, 12],
      ],
    },
    {
      name: "Legs",
      rows: [
      ["Back Squat", 4, 6, 8],
      ["Romanian Deadlift", 3, 8, 10],
      ["Leg Press", 3, 10, 12],
      ["Leg Curl", 3, 10, 12],
      ["Standing Calf Raise", 4, 10, 15],
      ],
    },
      ],
    },
  },
  {
    slug: "bro-split-5",
    title: "Bro split 5-day",
    blurb: "One body part per day across five days.",
    harnessId: "S4",
    program: {
      days: [
    {
      name: "Chest",
      rows: [
      ["Barbell Bench Press", 4, 8, 10],
      ["Incline Dumbbell Press", 4, 8, 10],
      ["Pec Deck", 3, 10, 12],
      ["Cable Chest Fly", 3, 12, 15],
      ["Chest Dip", 3, 8, 12],
      ],
    },
    {
      name: "Back",
      rows: [
      ["Conventional Deadlift", 3, 5, 5],
      ["Pull-Up", 4, 6, 10],
      ["Barbell Row", 4, 8, 10],
      ["Seated Cable Row", 3, 10, 12],
      ["Straight-Arm Pulldown", 3, 12, 15],
      ],
    },
    {
      name: "Shoulders",
      rows: [
      ["Overhead Press", 4, 6, 8],
      ["Lateral Raise", 4, 12, 15],
      ["Rear Delt Fly", 4, 12, 15],
      ["Upright Row", 3, 10, 12],
      ["Barbell Shrug", 4, 10, 12],
      ],
    },
    {
      name: "Arms",
      rows: [
      ["Barbell Curl", 4, 8, 10],
      ["Skull Crusher", 4, 8, 10],
      ["Hammer Curl", 3, 10, 12],
      ["Tricep Pushdown", 3, 10, 12],
      ["Preacher Curl", 3, 10, 12],
      ],
    },
    {
      name: "Legs",
      rows: [
      ["Back Squat", 4, 6, 8],
      ["Leg Press", 4, 10, 12],
      ["Leg Extension", 3, 12, 15],
      ["Leg Curl", 4, 10, 12],
      ["Standing Calf Raise", 4, 12, 15],
      ],
    },
      ],
    },
  },
  {
    slug: "beginner-2",
    title: "Beginner 2-day",
    blurb: "Two short full-body days.",
    harnessId: "S7",
    program: {
      days: [
    {
      name: "Day A",
      rows: [
      ["Goblet Squat", 3, 10, 10],
      ["Dumbbell Bench Press", 3, 10, 10],
      ["Lat Pulldown", 3, 10, 10],
      ["Plank", 3, 1, 1],
      ],
    },
    {
      name: "Day B",
      rows: [
      ["Leg Press", 3, 10, 10],
      ["Dumbbell Shoulder Press", 3, 10, 10],
      ["Seated Cable Row", 3, 10, 10],
      ["Glute Bridge", 3, 12, 12],
      ],
    },
      ],
    },
  },
  {
    slug: "home-dumbbells-3",
    title: "Home dumbbells 3-day",
    blurb: "Dumbbells and a bench, three days.",
    harnessId: "S8",
    program: {
      days: [
    {
      name: "Day 1",
      rows: [
      ["Goblet Squat", 3, 10, 15],
      ["Dumbbell Bench Press", 3, 8, 12],
      ["Dumbbell Row", 3, 8, 12],
      ["Dumbbell Shoulder Press", 3, 8, 12],
      ["Dumbbell Curl", 2, 10, 12],
      ],
    },
    {
      name: "Day 2",
      rows: [
      ["Romanian Deadlift", 3, 10, 12],
      ["Bulgarian Split Squat", 3, 8, 12],
      ["Push-Up", 3, 10, 20],
      ["Dumbbell Fly", 3, 10, 15],
      ["Tricep Kickback", 2, 12, 15],
      ],
    },
    {
      name: "Day 3",
      rows: [
      ["Reverse Lunge", 3, 10, 12],
      ["Incline Dumbbell Press", 3, 8, 12],
      ["Dumbbell Row", 3, 8, 12],
      ["Lateral Raise", 3, 12, 20],
      ["Hammer Curl", 2, 10, 12],
      ["Glute Bridge", 3, 12, 15],
      ],
    },
      ],
    },
  },
];

export function findPreset(slug: string): CheckPreset | undefined {
  return CHECK_PRESETS.find((p) => p.slug === slug);
}
