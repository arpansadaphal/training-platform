// Set 2: common programs as a stranger would enter them (Builder default effort RPE 8 unless stated).
import { run, type Program, type Day } from "./lib";
const D = (name: string, rows: Day["rows"]): Day => ({ name, rows });

// 1. Reddit-style PPL 6-day (Pull A/Push A/Legs/Pull B/Push B/Legs)
const pullA = D("Pull A", [["Conventional Deadlift", 1, 5, 5, 9], ["Lat Pulldown", 3, 8, 12], ["Seated Cable Row", 3, 8, 12], ["Face Pull", 5, 15, 20], ["Hammer Curl", 4, 8, 12], ["Dumbbell Curl", 4, 8, 12]]);
const pullB = D("Pull B", [["Barbell Row", 5, 5, 5, 9], ["Pull-Up", 3, 8, 12], ["Seated Cable Row", 3, 8, 12], ["Face Pull", 5, 15, 20], ["Hammer Curl", 4, 8, 12], ["Dumbbell Curl", 4, 8, 12]]);
const pushA = D("Push A", [["Barbell Bench Press", 5, 5, 5, 9], ["Overhead Press", 3, 8, 12], ["Incline Dumbbell Press", 3, 8, 12], ["Tricep Pushdown", 3, 8, 12], ["Lateral Raise", 3, 15, 20], ["Overhead Tricep Extension", 3, 8, 12], ["Lateral Raise", 3, 15, 20]]);
const pushB = D("Push B", [["Overhead Press", 5, 5, 5, 9], ["Barbell Bench Press", 3, 8, 12], ["Incline Dumbbell Press", 3, 8, 12], ["Tricep Pushdown", 3, 8, 12], ["Lateral Raise", 3, 15, 20], ["Overhead Tricep Extension", 3, 8, 12], ["Lateral Raise", 3, 15, 20]]);
const legs = D("Legs", [["Back Squat", 3, 5, 5, 9], ["Romanian Deadlift", 3, 8, 12], ["Leg Press", 3, 8, 12], ["Leg Curl", 3, 8, 12], ["Standing Calf Raise", 5, 8, 12]]);

// 2. Upper/Lower 4-day (generic, as commonly posted)
const UA = D("Upper A", [["Barbell Bench Press", 4, 6, 8], ["Barbell Row", 4, 6, 8], ["Overhead Press", 3, 8, 10], ["Lat Pulldown", 3, 8, 10], ["Tricep Pushdown", 3, 10, 12], ["Barbell Curl", 3, 10, 12]]);
const LA = D("Lower A", [["Back Squat", 4, 6, 8], ["Romanian Deadlift", 3, 8, 10], ["Leg Press", 3, 10, 12], ["Leg Curl", 3, 10, 12], ["Standing Calf Raise", 4, 10, 15]]);
const UB = D("Upper B", [["Incline Dumbbell Press", 3, 8, 12], ["Seated Cable Row", 3, 8, 12], ["Dumbbell Shoulder Press", 3, 8, 12], ["Pull-Up", 3, 6, 10], ["Lateral Raise", 3, 12, 15], ["Skull Crusher", 3, 10, 12], ["Hammer Curl", 3, 10, 12]]);
const LB = D("Lower B", [["Conventional Deadlift", 3, 5, 5], ["Bulgarian Split Squat", 3, 8, 10], ["Leg Extension", 3, 10, 15], ["Seated Leg Curl", 3, 10, 15], ["Seated Calf Raise", 4, 10, 15]]);

// 3. Full Body 3-day (typical beginner/intermediate template; no calves)
const FB1 = D("Day 1", [["Back Squat", 3, 8, 10], ["Barbell Bench Press", 3, 8, 10], ["Lat Pulldown", 3, 8, 12], ["Lateral Raise", 2, 12, 15], ["Barbell Curl", 2, 10, 12]]);
const FB2 = D("Day 2", [["Romanian Deadlift", 3, 8, 10], ["Overhead Press", 3, 8, 10], ["Seated Cable Row", 3, 8, 12], ["Leg Press", 2, 10, 12], ["Tricep Pushdown", 2, 10, 12]]);
const FB3 = D("Day 3", [["Leg Press", 3, 10, 12], ["Incline Dumbbell Press", 3, 8, 12], ["Pull-Up", 3, 6, 10], ["Leg Curl", 3, 10, 12], ["Face Pull", 2, 15, 20]]);

// 4. Bro split 5-day (Chest/Back/Shoulders/Arms/Legs)
const BC = D("Chest", [["Barbell Bench Press", 4, 8, 10], ["Incline Dumbbell Press", 4, 8, 10], ["Pec Deck", 3, 10, 12], ["Cable Chest Fly", 3, 12, 15], ["Chest Dip", 3, 8, 12]]);
const BB = D("Back", [["Conventional Deadlift", 3, 5, 5], ["Pull-Up", 4, 6, 10], ["Barbell Row", 4, 8, 10], ["Seated Cable Row", 3, 10, 12], ["Straight-Arm Pulldown", 3, 12, 15]]);
const BS = D("Shoulders", [["Overhead Press", 4, 6, 8], ["Lateral Raise", 4, 12, 15], ["Rear Delt Fly", 4, 12, 15], ["Upright Row", 3, 10, 12], ["Barbell Shrug", 4, 10, 12]]);
const BA = D("Arms", [["Barbell Curl", 4, 8, 10], ["Skull Crusher", 4, 8, 10], ["Hammer Curl", 3, 10, 12], ["Tricep Pushdown", 3, 10, 12], ["Preacher Curl", 3, 10, 12]]);
const BL = D("Legs", [["Back Squat", 4, 6, 8], ["Leg Press", 4, 10, 12], ["Leg Extension", 3, 12, 15], ["Leg Curl", 4, 10, 12], ["Standing Calf Raise", 4, 12, 15]]);

// 5. Starting Strength phase 1: A = squat 3x5, bench 3x5, deadlift 1x5; B = squat 3x5, press 3x5, deadlift 1x5.
//    Run A/B alternating 3x per week. A user pastes "Workout A, Workout B".
const SSA = D("Workout A", [["Back Squat", 3, 5, 5], ["Barbell Bench Press", 3, 5, 5], ["Conventional Deadlift", 1, 5, 5]]);
const SSB = D("Workout B", [["Back Squat", 3, 5, 5], ["Overhead Press", 3, 5, 5], ["Conventional Deadlift", 1, 5, 5]]);

// 6. 5/3/1 Boring But Big, week 1 as pasted with %1RM (no RPE). Main: 3 sets of 5 (~75% avg of TM), BBB 5x10 @ 50%.
const W = (ex: string, sets: number, lo: number, hi: number) => [ex, sets, lo, hi, null] as Day["rows"][number];
const P1 = D("Press", [W("Overhead Press", 3, 5, 5), W("Overhead Press", 5, 10, 10), W("Chin-Up", 5, 10, 10)]);
const P2 = D("Deadlift", [W("Conventional Deadlift", 3, 5, 5), W("Conventional Deadlift", 5, 10, 10), W("Hanging Leg Raise", 5, 10, 10)]);
const P3 = D("Bench", [W("Barbell Bench Press", 3, 5, 5), W("Barbell Bench Press", 5, 10, 10), W("Dumbbell Row", 5, 10, 10)]);
const P4 = D("Squat", [W("Back Squat", 3, 5, 5), W("Back Squat", 5, 10, 10), W("Leg Curl", 5, 10, 10)]);

// 7. Beginner 2-day full body
const N1 = D("Day A", [["Goblet Squat", 3, 10, 10], ["Dumbbell Bench Press", 3, 10, 10], ["Lat Pulldown", 3, 10, 10], ["Plank", 3, 1, 1]]);
const N2 = D("Day B", [["Leg Press", 3, 10, 10], ["Dumbbell Shoulder Press", 3, 10, 10], ["Seated Cable Row", 3, 10, 10], ["Glute Bridge", 3, 12, 12]]);

// 8. Home dumbbell 3-day (DBs + bench, no bar for pull-ups)
const H1 = D("Day 1", [["Goblet Squat", 3, 10, 15], ["Dumbbell Bench Press", 3, 8, 12], ["Dumbbell Row", 3, 8, 12], ["Dumbbell Shoulder Press", 3, 8, 12], ["Dumbbell Curl", 2, 10, 12]]);
const H2 = D("Day 2", [["Romanian Deadlift", 3, 10, 12], ["Bulgarian Split Squat", 3, 8, 12], ["Push-Up", 3, 10, 20], ["Dumbbell Fly", 3, 10, 15], ["Tricep Kickback", 2, 12, 15]]);
const H3 = D("Day 3", [["Reverse Lunge", 3, 10, 12], ["Incline Dumbbell Press", 3, 8, 12], ["Dumbbell Row", 3, 8, 12], ["Lateral Raise", 3, 12, 20], ["Hammer Curl", 2, 10, 12], ["Glute Bridge", 3, 12, 15]]);

const progs: Program[] = [
  { id: "S1", title: "PPL 6-day (Reddit-style)", days: [pullA, pushA, legs, pullB, pushB, legs] },
  { id: "S2", title: "Upper/Lower 4-day", days: [UA, LA, UB, LB] },
  { id: "S3", title: "Full Body 3-day", days: [FB1, FB2, FB3] },
  { id: "S4", title: "Bro split 5-day", days: [BC, BB, BS, BA, BL] },
  { id: "S5a", title: "Starting Strength as pasted (A, B)", days: [SSA, SSB], note: "user lists two workouts; real week is A/B/A then B/A/B" },
  { id: "S5b", title: "Starting Strength as one real week (A, B, A)", days: [SSA, SSB, SSA] },
  { id: "S6", title: "5/3/1 BBB week 1, %-based, no RPE (as pasted)", days: [P1, P2, P3, P4] },
  { id: "S7", title: "Beginner 2-day full body", days: [N1, N2] },
  { id: "S8", title: "Home dumbbell 3-day", days: [H1, H2, H3] },
];
for (const p of progs) run(p);
// Variant: 5/3/1 entered with the BBB sets at RPE 6 (closer to reality for 5x10 @ 50% TM)
run({ id: "S6b", title: "5/3/1 BBB, main RPE 8, BBB sets RPE 6", days: [
  D("Press", [["Overhead Press", 3, 5, 5, 8], ["Overhead Press", 5, 10, 10, 6], ["Chin-Up", 5, 10, 10, 8]]),
  D("Deadlift", [["Conventional Deadlift", 3, 5, 5, 8], ["Conventional Deadlift", 5, 10, 10, 6], ["Hanging Leg Raise", 5, 10, 10, 8]]),
  D("Bench", [["Barbell Bench Press", 3, 5, 5, 8], ["Barbell Bench Press", 5, 10, 10, 6], ["Dumbbell Row", 5, 10, 10, 8]]),
  D("Squat", [["Back Squat", 3, 5, 5, 8], ["Back Squat", 5, 10, 10, 6], ["Leg Curl", 5, 10, 10, 8]]),
] });
