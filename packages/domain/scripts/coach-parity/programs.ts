// The 26 harness programs, defined once. set1.ts / set2.ts / set3.ts / probes.ts run them and print; expected.ts
// and parity.ts score them against a coach-written headline. Definitions moved verbatim from the four scripts so
// `pnpm coach-parity` prints exactly what it printed before.
//
// Each group is built inside a function so the original local names (A, B, D, E, P1...) stay as they were.
import type { Day, Program, Row } from "./lib";

/** `defaultRpe` follows lib.run: undefined means the Builder default (RPE 8); null means "effort not stated". */
export interface HarnessEntry {
  readonly program: Program;
  readonly defaultRpe?: number | null;
}

// ---- Set 1: calibration programs A-J (rows carry their own effort; no default) ----
function set1(): HarnessEntry[] {
  const MAP: Record<string, string> = {
    bench_press: "Barbell Bench Press", incline_db_press: "Incline Barbell Bench Press", machine_chest_press: "Dumbbell Bench Press",
    push_up: "Push-Up", cable_fly: "Cable Chest Fly", overhead_press: "Overhead Press", lateral_raise: "Lateral Raise",
    reverse_pec_deck: "Rear Delt Fly", face_pull: "Face Pull", lat_pulldown: "Lat Pulldown", pull_up: "Pull-Up",
    seated_row: "Seated Cable Row", chest_supported_row: "Chest-Supported Row", barbell_row: "Barbell Row",
    triceps_pushdown: "Tricep Pushdown", overhead_triceps_ext: "Overhead Tricep Extension", biceps_curl: "Barbell Curl",
    hammer_curl: "Hammer Curl", incline_curl: "Hammer Curl", preacher_curl: "Barbell Curl", back_squat: "Back Squat",
    leg_press: "Leg Press", leg_extension: "Leg Extension", walking_lunge: "Hack Squat", rdl: "Romanian Deadlift",
    leg_curl: "Leg Curl", seated_leg_curl: "Leg Curl", hip_thrust: "Hip Thrust", standing_calf_raise: "Standing Calf Raise",
    seated_calf_raise: "Standing Calf Raise",
  };
  // r(ex, sets, reps=[8,12], rir=2); rir null = effort undefined
  const r = (ex: string, sets: number, reps: [number, number] = [8, 12], rir: number | null = 2): Row =>
    [MAP[ex]!, sets, reps[0], reps[1], rir === null ? null : 10 - rir];
  const D = (name: string, rows: Row[]) => ({ name, rows });

  const A = [D("Mon", [r("bench_press", 2, [6, 10]), r("lat_pulldown", 2), r("back_squat", 2, [6, 10])]),
    D("Thu", [r("overhead_press", 2), r("seated_row", 2), r("rdl", 2, [8, 10])])];
  const B = [
    D("Mon", [r("bench_press", 3, [6, 10]), r("incline_db_press", 3), r("lat_pulldown", 3), r("seated_row", 3), r("lateral_raise", 3, [12, 20], 1), r("face_pull", 3, [12, 20], 1), r("triceps_pushdown", 3, [10, 15], 1)]),
    D("Tue", [r("back_squat", 3, [6, 10]), r("rdl", 3, [8, 10]), r("leg_extension", 3, [10, 15], 1), r("leg_curl", 3, [10, 15], 1), r("standing_calf_raise", 5, [8, 15], 1)]),
    D("Thu", [r("machine_chest_press", 3), r("cable_fly", 3, [10, 15], 1), r("pull_up", 3, [6, 10]), r("chest_supported_row", 3), r("overhead_press", 3, [6, 10]), r("reverse_pec_deck", 3, [12, 20], 1), r("lateral_raise", 3, [12, 20], 1)]),
    D("Fri", [r("leg_press", 3), r("hip_thrust", 3), r("seated_leg_curl", 3, [10, 15], 1), r("walking_lunge", 3, [10, 12]), r("seated_calf_raise", 4, [10, 15], 1)]),
    D("Sat", [r("overhead_triceps_ext", 3, [10, 15], 1), r("incline_curl", 3, [10, 15], 1), r("biceps_curl", 3, [10, 15], 1)]),
  ];
  const CP = [r("bench_press", 5, [6, 10], 1), r("incline_db_press", 4, [8, 12], 1), r("overhead_press", 4, [6, 10], 1), r("cable_fly", 4, [10, 15], 0), r("lateral_raise", 6, [12, 20], 0), r("triceps_pushdown", 5, [10, 15], 0), r("overhead_triceps_ext", 4, [10, 15], 0)];
  const CL = [r("pull_up", 5, [6, 10], 1), r("barbell_row", 5, [6, 10], 1), r("seated_row", 4, [8, 12], 1), r("lat_pulldown", 4, [8, 12], 1), r("reverse_pec_deck", 5, [12, 20], 0), r("biceps_curl", 5, [10, 15], 0), r("hammer_curl", 4, [10, 15], 0)];
  const CG = [r("back_squat", 5, [6, 10], 1), r("rdl", 4, [8, 10], 1), r("leg_press", 4, [10, 15], 1), r("leg_curl", 4, [10, 15], 0), r("leg_extension", 4, [10, 15], 0), r("standing_calf_raise", 6, [8, 15], 0)];
  const C = [D("Push", CP), D("Pull", CL), D("Legs", CG), D("Push", CP), D("Pull", CL), D("Legs", CG)];
  const DD = [
    D("Chest", [r("bench_press", 4, [6, 10]), r("incline_db_press", 3), r("cable_fly", 3, [10, 15], 1), r("machine_chest_press", 3), r("triceps_pushdown", 3, [10, 15], 1), r("overhead_triceps_ext", 3, [10, 15], 1)]),
    D("Back", [r("lat_pulldown", 4), r("barbell_row", 4, [6, 10]), r("seated_row", 3), r("pull_up", 3, [6, 10])]),
    D("Legs", [r("back_squat", 4, [6, 10]), r("leg_press", 4), r("leg_extension", 4, [10, 15], 1), r("rdl", 4, [8, 10]), r("leg_curl", 3, [10, 15], 1), r("seated_leg_curl", 3, [10, 15], 1), r("standing_calf_raise", 5, [8, 15], 1), r("seated_calf_raise", 4, [10, 15], 1)]),
    D("Shoulders", [r("overhead_press", 3, [6, 10]), r("lateral_raise", 8, [12, 20], 1), r("reverse_pec_deck", 3, [12, 20], 1)]),
    D("Arms", [r("biceps_curl", 4, [10, 15], 1), r("incline_curl", 3, [10, 15], 1), r("hammer_curl", 3, [10, 15], 1), r("hip_thrust", 3)]),
  ];
  const EA = [r("bench_press", 2, [6, 10]), r("seated_row", 2), r("back_squat", 2, [6, 10]), r("lateral_raise", 2, [12, 20], 1), r("biceps_curl", 2, [10, 15], 1), r("triceps_pushdown", 2, [10, 15], 1), r("leg_curl", 2, [10, 15], 1), r("standing_calf_raise", 2, [8, 15], 1), r("face_pull", 2, [12, 20], 1)];
  const EB = [r("overhead_press", 2, [6, 10]), r("lat_pulldown", 2), r("leg_press", 2), r("rdl", 2, [8, 10]), r("cable_fly", 2, [10, 15], 1), r("reverse_pec_deck", 2, [12, 20], 1), r("overhead_triceps_ext", 2, [10, 15], 1), r("incline_curl", 2, [10, 15], 1), r("lateral_raise", 2, [12, 20], 1), r("seated_calf_raise", 2, [10, 15], 1), r("hip_thrust", 2)];
  const E = [D("A", EA), D("B", EB), D("A", EA), D("B", EB), D("A", EA)];
  const F1U = [r("bench_press", 2, [6, 10]), r("incline_db_press", 2), r("machine_chest_press", 2), r("push_up", 2, [10, 20]), r("seated_row", 2), r("chest_supported_row", 2), r("barbell_row", 2, [6, 10]), r("lateral_raise", 3, [12, 20], 1), r("triceps_pushdown", 3, [10, 15], 1), r("biceps_curl", 2, [10, 15], 1), r("hammer_curl", 2, [10, 15], 1), r("preacher_curl", 2, [10, 15], 1), r("reverse_pec_deck", 3, [12, 20], 1)];
  const F1L = [r("back_squat", 4, [6, 10]), r("rdl", 3, [8, 10]), r("leg_extension", 3, [10, 15], 1), r("leg_curl", 3, [10, 15], 1), r("standing_calf_raise", 4, [8, 15], 1), r("seated_calf_raise", 3, [10, 15], 1)];
  const F1 = [D("Upper", F1U), D("Lower", F1L), D("Upper", F1U), D("Lower", F1L)];
  const F2A = [r("bench_press", 3, [6, 10]), r("incline_db_press", 3), r("machine_chest_press", 3), r("cable_fly", 3, [10, 15], 1), r("biceps_curl", 3, [10, 15], 1), r("hammer_curl", 3, [10, 15], 1), r("preacher_curl", 3, [10, 15], 1), r("triceps_pushdown", 3, [10, 15], 1)];
  const F2B = [r("lat_pulldown", 3), r("seated_row", 3), r("lateral_raise", 3, [12, 20], 1), r("reverse_pec_deck", 3, [12, 20], 1)];
  const F2 = [D("Up1", F2A), D("Up2", F2B), D("Up1", F2A), D("Up2", F2B)];
  const G = B.map((d) => ({ name: d.name, rows: d.rows.map((row, i): Row => [row[0], row[1], 10, 10, i % 2 === 0 ? null : 8]) }));
  const JD = [r("bench_press", 3, [6, 10], 0), r("seated_row", 3, [8, 12], 0), r("back_squat", 3, [6, 10], 0), r("rdl", 3, [8, 10], 0), r("lateral_raise", 3, [12, 20], 0), r("biceps_curl", 3, [10, 15], 0), r("triceps_pushdown", 3, [10, 15], 0), r("leg_curl", 3, [10, 15], 0), r("standing_calf_raise", 3, [8, 15], 0), r("face_pull", 3, [12, 20], 0)];
  const J = [D("Mon", JD), D("Tue", JD), D("Wed", JD), D("Thu", JD)];

  const progs: Program[] = [
    { id: "A", title: "Clearly under-dosed", days: A }, { id: "B", title: "Balanced hypertrophy", days: B },
    { id: "C", title: "Excessive volume", days: C }, { id: "D", title: "Low frequency, reasonable volume (bro split)", days: DD },
    { id: "E", title: "High frequency, controlled volume", days: E }, { id: "F1", title: "Redundant selection, coverage intact", days: F1 },
    { id: "F2", title: "Redundant selection + coverage gap (no legs)", days: F2 }, { id: "G", title: "Poor progression structure", days: G },
    { id: "J", title: "Consecutive-day, every set to failure", days: J },
  ];
  return progs.map((program) => ({ program, defaultRpe: null }));
}

// ---- Set 2: common programs as a stranger would enter them (Builder default effort RPE 8 unless stated) ----
function set2(): HarnessEntry[] {
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
  // Variant: 5/3/1 entered with the BBB sets at RPE 6 (closer to reality for 5x10 @ 50% TM)
  progs.push({ id: "S6b", title: "5/3/1 BBB, main RPE 8, BBB sets RPE 6", days: [
    D("Press", [["Overhead Press", 3, 5, 5, 8], ["Overhead Press", 5, 10, 10, 6], ["Chin-Up", 5, 10, 10, 8]]),
    D("Deadlift", [["Conventional Deadlift", 3, 5, 5, 8], ["Conventional Deadlift", 5, 10, 10, 6], ["Hanging Leg Raise", 5, 10, 10, 8]]),
    D("Bench", [["Barbell Bench Press", 3, 5, 5, 8], ["Barbell Bench Press", 5, 10, 10, 6], ["Dumbbell Row", 5, 10, 10, 8]]),
    D("Squat", [["Back Squat", 3, 5, 5, 8], ["Back Squat", 5, 10, 10, 6], ["Leg Curl", 5, 10, 10, 8]]),
  ] });
  return progs.map((program) => ({ program }));
}

// ---- Set 3: personas ----
function set3(): HarnessEntry[] {
  const D = (name: string, rows: Day["rows"]): Day => ({ name, rows });

  // P1 Returning lifter: trained 3-4 years, 2 years off, 6 months back. Went back to the heavy 4-day
  // powerbuilding split they used before; chases old numbers; heavy days at RPE 9, few accessories.
  const p1: Program = { id: "P1", title: "Returning lifter: 4-day heavy/volume upper-lower", days: [
    D("Upper Heavy", [["Barbell Bench Press", 5, 3, 5, 9], ["Barbell Row", 5, 5, 5, 9], ["Overhead Press", 3, 5, 5, 9], ["Pull-Up", 3, 5, 6, 9]]),
    D("Lower Heavy", [["Back Squat", 5, 3, 5, 9], ["Conventional Deadlift", 3, 3, 5, 9], ["Leg Press", 3, 8, 10, 8]]),
    D("Upper Volume", [["Incline Dumbbell Press", 4, 8, 10], ["Seated Cable Row", 4, 8, 10], ["Lateral Raise", 3, 12, 15], ["Barbell Curl", 3, 10, 12], ["Tricep Pushdown", 3, 10, 12]]),
    D("Lower Volume", [["Front Squat", 3, 6, 8], ["Romanian Deadlift", 3, 8, 10], ["Leg Curl", 3, 10, 12], ["Standing Calf Raise", 3, 10, 15]]),
  ] };

  // P2 Busy professional: 2 sessions a week when it goes well (often 1), 45 minutes each, commercial gym.
  const p2: Program = { id: "P2", title: "Busy professional: 2 x 45 min full body", days: [
    D("Day A", [["Back Squat", 3, 6, 8], ["Barbell Bench Press", 3, 6, 8], ["Lat Pulldown", 3, 8, 12], ["Dumbbell Curl", 2, 10, 12]]),
    D("Day B", [["Conventional Deadlift", 3, 5, 5], ["Overhead Press", 3, 6, 8], ["Seated Cable Row", 3, 8, 12], ["Tricep Pushdown", 2, 10, 12]]),
  ] };
  // ...and the week they only make it once (Day A only)
  const p2once: Program = { id: "P2-1x", title: "Busy professional, a one-session week (Day A only)", days: [
    D("Day A", [["Back Squat", 3, 6, 8], ["Barbell Bench Press", 3, 6, 8], ["Lat Pulldown", 3, 8, 12], ["Dumbbell Curl", 2, 10, 12]]),
  ] };

  // P3 Home-gym beginner: adjustable dumbbells + bench, 3 months in, same YouTube full-body 3x a week,
  // fixed 12 reps, lots of arm work, no hinge.
  const P3day = D("Full Body", [["Goblet Squat", 3, 12, 12], ["Push-Up", 3, 10, 15], ["Dumbbell Row", 3, 12, 12], ["Dumbbell Shoulder Press", 3, 12, 12], ["Dumbbell Curl", 3, 12, 12], ["Tricep Kickback", 3, 12, 12], ["Russian Twist", 3, 20, 20]]);
  const p3: Program = { id: "P3", title: "Home-gym beginner: same DB full body 3x/week", days: [P3day, P3day, P3day] };

  // Sensitivity: P2 with no effort stated (what a raw paste looks like if the parser does not default RPE)
  const p2noRpe: Program = { id: "P2-noRPE", title: "Busy professional, pasted with no effort", days: [
    D("Day A", [["Back Squat", 3, 6, 8], ["Barbell Bench Press", 3, 6, 8], ["Lat Pulldown", 3, 8, 12], ["Dumbbell Curl", 2, 10, 12]]),
    D("Day B", [["Conventional Deadlift", 3, 5, 5], ["Overhead Press", 3, 6, 8], ["Seated Cable Row", 3, 8, 12], ["Tricep Pushdown", 2, 10, 12]]),
  ] };

  return [{ program: p1 }, { program: p2 }, { program: p2once }, { program: p3 }, { program: p2noRpe, defaultRpe: null }];
}

// ---- Probes: the same PPL entered as 3 days and as 6 days ----
function probes(): HarnessEntry[] {
  const D = (name: string, rows: Day["rows"]): Day => ({ name, rows });
  const push = D("Push", [["Barbell Bench Press", 4, 6, 8], ["Overhead Press", 3, 8, 10], ["Incline Dumbbell Press", 3, 8, 12], ["Lateral Raise", 4, 12, 15], ["Tricep Pushdown", 3, 10, 12]]);
  const pull = D("Pull", [["Pull-Up", 4, 6, 10], ["Barbell Row", 3, 6, 8], ["Face Pull", 3, 15, 20], ["Barbell Curl", 3, 8, 12], ["Hammer Curl", 2, 10, 12]]);
  const legs = D("Legs", [["Back Squat", 4, 6, 8], ["Romanian Deadlift", 3, 8, 10], ["Leg Press", 3, 10, 12], ["Leg Curl", 3, 10, 12], ["Standing Calf Raise", 4, 10, 15]]);
  return [
    { program: { id: "PPLx3", title: "PPL pasted as 3 days (user runs it twice a week)", days: [push, pull, legs] } },
    { program: { id: "PPLx6", title: "Same PPL entered as 6 days", days: [push, pull, legs, push, pull, legs] } },
  ];
}

export const SET1_PROGRAMS: readonly HarnessEntry[] = set1();
export const SET2_PROGRAMS: readonly HarnessEntry[] = set2();
export const SET3_PROGRAMS: readonly HarnessEntry[] = set3();
export const PROBE_PROGRAMS: readonly HarnessEntry[] = probes();

/** All 26 harness runs, in the order the scripts print them. */
export const ALL_PROGRAMS: readonly HarnessEntry[] = [
  ...SET1_PROGRAMS,
  ...SET2_PROGRAMS,
  ...SET3_PROGRAMS,
  ...PROBE_PROGRAMS,
];

export const PROGRAMS_BY_ID: ReadonlyMap<string, HarnessEntry> = new Map(ALL_PROGRAMS.map((e) => [e.program.id, e]));
