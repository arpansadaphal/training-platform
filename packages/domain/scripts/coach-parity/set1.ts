// Set 1: re-run the calibration programs A-L through the in-memory harness to confirm parity with
// calibration-before.txt, then print what the UI would say.
import { run, type Program, type Row } from "./lib";

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
for (const p of progs) run(p, { defaultRpe: null });
