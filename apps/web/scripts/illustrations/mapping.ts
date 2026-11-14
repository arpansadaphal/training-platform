// Which Everkinetic drawing stands in for which exercise in our library.
//
// Source of truth for the illustrations. `build.ts` reads this and the Everkinetic repository and writes
// public/exercises/*.webp and src/lib/exerciseIllustrations.json; a test checks the three agree.
//
//   exact: the same movement with the same equipment.
//   near:  the same movement, and the drawing differs in the way `note` says. These are listed in the PR for review.
//
// An exercise with no entry has no picture (a gap, accepted): a wrong picture is worse than none, so a
// movement Everkinetic does not draw (carries, landmine and pike presses, hip thrust, ...) is left out, not approximated.
// Donkey Calf Raise was matched and then dropped: Everkinetic's drawing has a second person riding the lifter's back.

export const EVERKINETIC_SOURCE = {
  repository: "https://github.com/everkinetic/data",
  /** The commit the images were taken from. build.ts refuses a checkout at any other commit. */
  commit: "446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6",
  license: "CC-BY-SA-4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
} as const;

export interface IllustrationSource {
  /** Everkinetic's four-digit id (src/exercises/<id>/). */
  readonly id: string;
  readonly tier: "exact" | "near";
  readonly note?: string;
}

export const ILLUSTRATION_SOURCES: Readonly<Record<string, IllustrationSource>> = {
  "Back Squat": { id: "0122", tier: "exact" },
  "Front Squat": { id: "0138", tier: "exact" },
  "Hack Squat": { id: "0123", tier: "exact" },
  "Leg Press": { id: "0127", tier: "exact" },
  "Reverse Lunge": { id: "0129", tier: "exact" },
  "Walking Lunge": { id: "0121", tier: "exact" },
  "Step-Up": { id: "0137", tier: "exact" },
  "Goblet Squat": {
    id: "0130",
    tier: "near",
    note: "Everkinetic shows two dumbbells held at the sides, not one held at the chest.",
  },
  "Smith Machine Squat": { id: "0124", tier: "exact" },
  "Zercher Squat": { id: "0161", tier: "exact" },
  "Sissy Squat": {
    id: "0158",
    tier: "near",
    note: "Everkinetic's version holds a weight plate; ours is bodyweight.",
  },
  "Conventional Deadlift": { id: "0099", tier: "exact" },
  "Romanian Deadlift": { id: "0118", tier: "exact" },
  "Good Morning": { id: "0101", tier: "exact" },
  "Glute Bridge": { id: "0109", tier: "exact" },
  "45-Degree Back Extension": { id: "0103", tier: "exact" },
  "Barbell Bench Press": { id: "0042", tier: "exact" },
  "Dumbbell Bench Press": { id: "0055", tier: "exact" },
  "Incline Barbell Bench Press": { id: "0043", tier: "exact" },
  "Push-Up": { id: "0077", tier: "exact" },
  "Incline Dumbbell Press": { id: "0080", tier: "exact" },
  "Decline Bench Press": { id: "0051", tier: "exact" },
  "Machine Chest Press": { id: "0066", tier: "exact" },
  "Smith Machine Bench Press": { id: "0078", tier: "exact" },
  "Close-Grip Bench Press": { id: "0049", tier: "exact" },
  "Chest Dip": { id: "0054", tier: "exact" },
  "Tricep Dip": { id: "0172", tier: "exact" },
  "Cable Chest Fly": {
    id: "0048",
    tier: "near",
    note: "Everkinetic's is the standing cable crossover, shown from a different angle.",
  },
  "Pec Deck": { id: "0047", tier: "exact" },
  "Dumbbell Fly": { id: "0056", tier: "exact" },
  "Overhead Press": {
    id: "0004",
    tier: "near",
    note: "Everkinetic's barbell press is seated; ours is standing.",
  },
  "Dumbbell Shoulder Press": { id: "0012", tier: "exact" },
  "Arnold Press": { id: "0006", tier: "exact" },
  "Machine Shoulder Press": { id: "0003", tier: "exact" },
  "Barbell Row": {
    id: "0026",
    tier: "near",
    note: "Everkinetic's is the reverse-grip (underhand) barbell row; no overhand version has two frames in the set.",
  },
  "Seated Cable Row": { id: "0025", tier: "exact" },
  "T-Bar Row": { id: "0029", tier: "exact" },
  "Inverted Row": { id: "0086", tier: "exact" },
  "Pull-Up": { id: "0087", tier: "exact" },
  "Chin-Up": { id: "0089", tier: "exact" },
  "Lat Pulldown": { id: "0097", tier: "exact" },
  "Neutral-Grip Pull-Up": {
    id: "0090",
    tier: "near",
    note: "Everkinetic's is the narrow parallel-grip chin-up.",
  },
  "Straight-Arm Pulldown": { id: "0092", tier: "exact" },
  "JM Press": { id: "0175", tier: "exact" },
  "Barbell Curl": { id: "0211", tier: "exact" },
  "Hammer Curl": { id: "0227", tier: "exact" },
  "Dumbbell Curl": { id: "0224", tier: "exact" },
  "Incline Curl": {
    id: "0214",
    tier: "near",
    note: "Everkinetic's is the alternating incline dumbbell curl.",
  },
  "Preacher Curl": { id: "0239", tier: "exact" },
  "Concentration Curl": { id: "0220", tier: "exact" },
  "Cable Curl": { id: "0212", tier: "exact" },
  "Spider Curl": {
    id: "0245",
    tier: "near",
    note: "Everkinetic's uses a barbell; ours uses dumbbells.",
  },
  "Tricep Pushdown": { id: "0205", tier: "exact" },
  "Skull Crusher": { id: "0183", tier: "exact" },
  "Tricep Kickback": { id: "0204", tier: "exact" },
  "Lateral Raise": { id: "0018", tier: "exact" },
  "Rear Delt Fly": {
    id: "0032",
    tier: "near",
    note: "Everkinetic's is a bent-over raise with the head supported on a bench.",
  },
  "Cable Rear Delt Fly": { id: "0017", tier: "exact" },
  "Leg Curl": { id: "0117", tier: "exact" },
  "Seated Leg Curl": { id: "0119", tier: "exact" },
  "Leg Extension": { id: "0142", tier: "exact" },
  "Hip Abduction": { id: "0156", tier: "exact" },
  "Hip Adduction": { id: "0157", tier: "exact" },
  "Standing Calf Raise": { id: "0282", tier: "exact" },
  "Seated Calf Raise": { id: "0279", tier: "exact" },
  "Cable Crunch": {
    id: "0288",
    tier: "near",
    note: "Everkinetic's is the seated cable crunch; ours is kneeling.",
  },
  "Ab Wheel Rollout": {
    id: "0286",
    tier: "near",
    note: "Everkinetic's rollout is on the knees with a barbell; ours uses the wheel.",
  },
  "Side Plank": { id: "0113", tier: "exact" },
  "Upright Row": { id: "0014", tier: "exact" },
  Shrug: { id: "0005", tier: "exact" },
  "Barbell Shrug": { id: "0030", tier: "exact" },
  "Cable Shrug": { id: "0009", tier: "exact" },
};
