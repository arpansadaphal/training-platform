// Set 3: personas. Programs written from common patterns for each type.
import { run, type Day } from "./lib";
const D = (name: string, rows: Day["rows"]): Day => ({ name, rows });

// P1 Returning lifter: trained 3-4 years, 2 years off, 6 months back. Went back to the heavy 4-day
// powerbuilding split they used before; chases old numbers; heavy days at RPE 9, few accessories.
run({ id: "P1", title: "Returning lifter: 4-day heavy/volume upper-lower", days: [
  D("Upper Heavy", [["Barbell Bench Press", 5, 3, 5, 9], ["Barbell Row", 5, 5, 5, 9], ["Overhead Press", 3, 5, 5, 9], ["Pull-Up", 3, 5, 6, 9]]),
  D("Lower Heavy", [["Back Squat", 5, 3, 5, 9], ["Conventional Deadlift", 3, 3, 5, 9], ["Leg Press", 3, 8, 10, 8]]),
  D("Upper Volume", [["Incline Dumbbell Press", 4, 8, 10], ["Seated Cable Row", 4, 8, 10], ["Lateral Raise", 3, 12, 15], ["Barbell Curl", 3, 10, 12], ["Tricep Pushdown", 3, 10, 12]]),
  D("Lower Volume", [["Front Squat", 3, 6, 8], ["Romanian Deadlift", 3, 8, 10], ["Leg Curl", 3, 10, 12], ["Standing Calf Raise", 3, 10, 15]]),
] });

// P2 Busy professional: 2 sessions a week when it goes well (often 1), 45 minutes each, commercial gym.
run({ id: "P2", title: "Busy professional: 2 x 45 min full body", days: [
  D("Day A", [["Back Squat", 3, 6, 8], ["Barbell Bench Press", 3, 6, 8], ["Lat Pulldown", 3, 8, 12], ["Dumbbell Curl", 2, 10, 12]]),
  D("Day B", [["Conventional Deadlift", 3, 5, 5], ["Overhead Press", 3, 6, 8], ["Seated Cable Row", 3, 8, 12], ["Tricep Pushdown", 2, 10, 12]]),
] });
// ...and the week they only make it once (Day A only)
run({ id: "P2-1x", title: "Busy professional, a one-session week (Day A only)", days: [
  D("Day A", [["Back Squat", 3, 6, 8], ["Barbell Bench Press", 3, 6, 8], ["Lat Pulldown", 3, 8, 12], ["Dumbbell Curl", 2, 10, 12]]),
] });

// P3 Home-gym beginner: adjustable dumbbells + bench, 3 months in, same YouTube full-body 3x a week,
// fixed 12 reps, lots of arm work, no hinge.
const P3day = D("Full Body", [["Goblet Squat", 3, 12, 12], ["Push-Up", 3, 10, 15], ["Dumbbell Row", 3, 12, 12], ["Dumbbell Shoulder Press", 3, 12, 12], ["Dumbbell Curl", 3, 12, 12], ["Tricep Kickback", 3, 12, 12], ["Russian Twist", 3, 20, 20]]);
run({ id: "P3", title: "Home-gym beginner: same DB full body 3x/week", days: [P3day, P3day, P3day] });

// Sensitivity: P2 with no effort stated (what a raw paste looks like if the parser does not default RPE)
run({ id: "P2-noRPE", title: "Busy professional, pasted with no effort", days: [
  D("Day A", [["Back Squat", 3, 6, 8], ["Barbell Bench Press", 3, 6, 8], ["Lat Pulldown", 3, 8, 12], ["Dumbbell Curl", 2, 10, 12]]),
  D("Day B", [["Conventional Deadlift", 3, 5, 5], ["Overhead Press", 3, 6, 8], ["Seated Cable Row", 3, 8, 12], ["Tricep Pushdown", 2, 10, 12]]),
] }, { defaultRpe: null });
