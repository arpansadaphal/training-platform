// Phase 1 seed script — canonical reference data.
//
// IMPORTANT: Every numeric value in this file is CONTENT DATA, not a
// scientific threshold. Involvement factors are provisional, unvalidated,
// and open to review. No [SCIENTIFIC INPUT REQUIRED] value is invented here.
// The one GoalProfileDefinition seeded (HYPERTROPHY) is deliberately
// validated: false, configVersion: "0.0.1-unvalidated", thresholds: {}.

import { PrismaClient, type MovementPattern } from "@prisma/client";

const prisma = new PrismaClient();

// ───────────────────── Muscle groups ─────────────────────

const MUSCLE_GROUPS = [
  "chest",
  "lats",
  "upper back",
  "front delts",
  "side delts",
  "rear delts",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
  "obliques",
  "lower back",
  "traps",
  "adductors",
] as const;

// ───────────────────── Exercises ─────────────────────
//
// Each entry: { name, movementPattern, equipment?, involvements: { muscle: factor } }
// Involvement factors: 1.0 (primary mover), 0.5 (synergist), omitted = 0.
// Content data, provisional, not validated — do not treat as scientific thresholds.

interface SeedExercise {
  name: string;
  movementPattern: MovementPattern;
  equipment?: string;
  involvements: Record<string, number>;
}

const EXERCISES: SeedExercise[] = [
  // Conventions for every entry below (existing and new):
  //   - 1.0 = primary force generator, 0.5 = dynamic synergist, omitted = stabilizer. Isometric holds are
  //     credited only where the hold IS the exercise (carries, planks).
  //   - Lunge and step-up variants are tagged SQUAT (the calibration harness maps "walking_lunge" to
  //     Hack Squat on the same rule).
  //   - movementPattern drives EXERCISE_SELECTION_BALANCE coverage, so it describes the MOVEMENT, not the
  //     muscle: a knee-flexion curl is ISOLATION (as Leg Curl is), never HINGE.
  //   - A TODO comment on an entry marks a reasoned guess, not a settled call.
  //   - Within each pattern: compounds first, then isolations. Existing entries are unchanged; new ones
  //     are interleaved so that ordering holds.

  // SQUAT
  { name: "Back Squat", movementPattern: "SQUAT", equipment: "barbell",
    involvements: { quads: 1.0, glutes: 0.5 } },
  { name: "Front Squat", movementPattern: "SQUAT", equipment: "barbell",
    involvements: { quads: 1.0, glutes: 0.5 } },
  { name: "Hack Squat", movementPattern: "SQUAT", equipment: "machine",
    involvements: { quads: 1.0, glutes: 0.5 } },
  { name: "Leg Press", movementPattern: "SQUAT", equipment: "machine",
    involvements: { quads: 1.0, glutes: 0.5 } },
  // Bulgarian Split Squat: quads 1.0 (primary), glutes 0.5 (synergist), the same as every other squat and
  // lunge entry. Adductors are a stabilizer here, so omitted.
  // TODO: verify: glute share rises with stride length; 1.0 is defensible for long-stride variants.
  { name: "Bulgarian Split Squat", movementPattern: "SQUAT", equipment: "dumbbell",
    involvements: { quads: 1.0, glutes: 0.5 } },
  { name: "Reverse Lunge", movementPattern: "SQUAT", equipment: "dumbbell",
    involvements: { quads: 1.0, glutes: 0.5 } },
  { name: "Walking Lunge", movementPattern: "SQUAT", equipment: "dumbbell",
    involvements: { quads: 1.0, glutes: 0.5 } },
  { name: "Step-Up", movementPattern: "SQUAT", equipment: "dumbbell",
    involvements: { quads: 1.0, glutes: 0.5 } },
  { name: "Goblet Squat", movementPattern: "SQUAT", equipment: "dumbbell",
    involvements: { quads: 1.0, glutes: 0.5 } },
  // Pendulum Squat, Belt Squat, Smith Machine Squat: Hack Squat / Leg Press mapping. Machine squats probably
  // overstate glute work slightly, but diverging from the existing machine entries would be inconsistent.
  { name: "Pendulum Squat", movementPattern: "SQUAT", equipment: "machine",
    involvements: { quads: 1.0, glutes: 0.5 } },
  { name: "Belt Squat", movementPattern: "SQUAT", equipment: "machine",
    involvements: { quads: 1.0, glutes: 0.5 } },
  { name: "Smith Machine Squat", movementPattern: "SQUAT", equipment: "machine",
    involvements: { quads: 1.0, glutes: 0.5 } },
  { name: "Zercher Squat", movementPattern: "SQUAT", equipment: "barbell",
    involvements: { quads: 1.0, glutes: 0.5 } },
  // Sissy Squat: quads only (knee-dominant, hips stay extended). The one SQUAT entry that is an isolation,
  // so it goes last in the group.
  { name: "Sissy Squat", movementPattern: "SQUAT", equipment: "bodyweight",
    involvements: { quads: 1.0 } },

  // HINGE
  { name: "Conventional Deadlift", movementPattern: "HINGE", equipment: "barbell",
    involvements: { glutes: 1.0, hamstrings: 0.5 } },
  { name: "Romanian Deadlift", movementPattern: "HINGE", equipment: "barbell",
    involvements: { hamstrings: 1.0, glutes: 0.5 } },
  { name: "Sumo Deadlift", movementPattern: "HINGE", equipment: "barbell",
    involvements: { glutes: 1.0, hamstrings: 0.5, quads: 0.5 } },
  { name: "Hip Thrust", movementPattern: "HINGE", equipment: "barbell",
    involvements: { glutes: 1.0, hamstrings: 0.5 } },
  { name: "Good Morning", movementPattern: "HINGE", equipment: "barbell",
    involvements: { hamstrings: 1.0, glutes: 0.5 } },
  // Stiff-Leg Deadlift: Romanian Deadlift mapping.
  { name: "Stiff-Leg Deadlift", movementPattern: "HINGE", equipment: "barbell",
    involvements: { hamstrings: 1.0, glutes: 0.5 } },
  // Trap Bar Deadlift: Sumo Deadlift mapping. A trap bar moves more work onto the quads than a conventional
  // pull. Equipment is "barbell" (closest value in the existing vocabulary).
  { name: "Trap Bar Deadlift", movementPattern: "HINGE", equipment: "barbell",
    involvements: { glutes: 1.0, hamstrings: 0.5, quads: 0.5 } },
  // Rack Pull: Conventional Deadlift mapping. Upper back and traps hold the bar isometrically, so omitted.
  { name: "Rack Pull", movementPattern: "HINGE", equipment: "barbell",
    involvements: { glutes: 1.0, hamstrings: 0.5 } },
  // Cable Pull-Through: glutes 1.0, hamstrings 0.5 (Hip Thrust / Deadlift convention). Adductor magnus
  // assists hip extension, but no other hinge credits adductors (Sumo Deadlift included), so none here.
  { name: "Cable Pull-Through", movementPattern: "HINGE", equipment: "cable",
    involvements: { glutes: 1.0, hamstrings: 0.5 } },
  // Glute Bridge: Hip Thrust mapping.
  { name: "Glute Bridge", movementPattern: "HINGE", equipment: "bodyweight",
    involvements: { glutes: 1.0, hamstrings: 0.5 } },
  // 45-Degree Back Extension: lower back 1.0, glutes 0.5, hamstrings 0.5 (spinal-extension technique).
  // Lower back becomes reachable for the first time (no other entry credits it).
  // TODO: verify: with a hips-hinge technique the primary shifts to glutes; the mapping is technique-dependent.
  { name: "45-Degree Back Extension", movementPattern: "HINGE", equipment: "bodyweight",
    involvements: { "lower back": 1.0, glutes: 0.5, hamstrings: 0.5 } },
  // Reverse Hyperextension: glutes 1.0, hamstrings 0.5, lower back 0.5.
  // TODO: verify: lower back share is an estimate.
  { name: "Reverse Hyperextension", movementPattern: "HINGE", equipment: "machine",
    involvements: { glutes: 1.0, hamstrings: 0.5, "lower back": 0.5 } },

  // HORIZONTAL_PUSH
  { name: "Barbell Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "barbell",
    involvements: { chest: 1.0, "front delts": 0.5, triceps: 0.5 } },
  { name: "Dumbbell Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "dumbbell",
    involvements: { chest: 1.0, "front delts": 0.5, triceps: 0.5 } },
  { name: "Incline Barbell Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "barbell",
    involvements: { chest: 1.0, "front delts": 0.5, triceps: 0.5 } },
  { name: "Push-Up", movementPattern: "HORIZONTAL_PUSH", equipment: "bodyweight",
    involvements: { chest: 1.0, "front delts": 0.5, triceps: 0.5 } },
  { name: "Incline Dumbbell Press", movementPattern: "HORIZONTAL_PUSH", equipment: "dumbbell",
    involvements: { chest: 1.0, "front delts": 0.5, triceps: 0.5 } },
  { name: "Decline Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "barbell",
    involvements: { chest: 1.0, "front delts": 0.5, triceps: 0.5 } },
  { name: "Machine Chest Press", movementPattern: "HORIZONTAL_PUSH", equipment: "machine",
    involvements: { chest: 1.0, "front delts": 0.5, triceps: 0.5 } },
  { name: "Smith Machine Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "machine",
    involvements: { chest: 1.0, "front delts": 0.5, triceps: 0.5 } },
  // Close-Grip Bench Press: triceps 1.0, chest 0.5, front delts 0.5. Triceps lead, but it is tagged
  // HORIZONTAL_PUSH (it IS a bench press) so it counts toward press coverage in EXERCISE_SELECTION_BALANCE.
  { name: "Close-Grip Bench Press", movementPattern: "HORIZONTAL_PUSH", equipment: "barbell",
    involvements: { triceps: 1.0, chest: 0.5, "front delts": 0.5 } },
  // Chest Dip (the brief's "Dip (Chest)"): chest 1.0, triceps 0.5, front delts 0.5 (bench press mapping).
  { name: "Chest Dip", movementPattern: "HORIZONTAL_PUSH", equipment: "bodyweight",
    involvements: { chest: 1.0, triceps: 0.5, "front delts": 0.5 } },
  // Tricep Dip (the brief's "Dip (Tricep)"): upright-torso dip, triceps lead. Tagged HORIZONTAL_PUSH like
  // Chest Dip: it is a press, so it should not read as a coverage gap.
  { name: "Tricep Dip", movementPattern: "HORIZONTAL_PUSH", equipment: "bodyweight",
    involvements: { triceps: 1.0, chest: 0.5, "front delts": 0.5 } },
  { name: "Cable Chest Fly", movementPattern: "HORIZONTAL_PUSH", equipment: "cable",
    involvements: { chest: 1.0 } },
  // Pec Deck, Dumbbell Fly: single-joint chest flies, tagged HORIZONTAL_PUSH to match Cable Chest Fly's
  // existing precedent. (Side effect: a fly alone satisfies the horizontal-push coverage check.)
  { name: "Pec Deck", movementPattern: "HORIZONTAL_PUSH", equipment: "machine",
    involvements: { chest: 1.0 } },
  { name: "Dumbbell Fly", movementPattern: "HORIZONTAL_PUSH", equipment: "dumbbell",
    involvements: { chest: 1.0 } },

  // VERTICAL_PUSH
  { name: "Overhead Press", movementPattern: "VERTICAL_PUSH", equipment: "barbell",
    involvements: { "front delts": 1.0, "side delts": 0.5, triceps: 0.5 } },
  { name: "Dumbbell Shoulder Press", movementPattern: "VERTICAL_PUSH", equipment: "dumbbell",
    involvements: { "front delts": 1.0, "side delts": 0.5, triceps: 0.5 } },
  { name: "Arnold Press", movementPattern: "VERTICAL_PUSH", equipment: "dumbbell",
    involvements: { "front delts": 1.0, "side delts": 0.5, triceps: 0.5 } },
  { name: "Machine Shoulder Press", movementPattern: "VERTICAL_PUSH", equipment: "machine",
    involvements: { "front delts": 1.0, "side delts": 0.5, triceps: 0.5 } },
  // Push Press: Overhead Press mapping (leg drive is not credited).
  { name: "Push Press", movementPattern: "VERTICAL_PUSH", equipment: "barbell",
    involvements: { "front delts": 1.0, "side delts": 0.5, triceps: 0.5 } },
  // Landmine Press: front delts 1.0, chest 0.5, triceps 0.5. The arc sits between a strict press and an
  // incline press: front delts lead, upper chest assists.
  // TODO: verify: the chest share depends on setup (half-kneeling single-arm vs standing two-arm).
  { name: "Landmine Press", movementPattern: "VERTICAL_PUSH", equipment: "barbell",
    involvements: { "front delts": 1.0, chest: 0.5, triceps: 0.5 } },
  { name: "Pike Push-Up", movementPattern: "VERTICAL_PUSH", equipment: "bodyweight",
    involvements: { "front delts": 1.0, "side delts": 0.5, triceps: 0.5 } },

  // HORIZONTAL_PULL
  { name: "Barbell Row", movementPattern: "HORIZONTAL_PULL", equipment: "barbell",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 } },
  { name: "Dumbbell Row", movementPattern: "HORIZONTAL_PULL", equipment: "dumbbell",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 } },
  { name: "Seated Cable Row", movementPattern: "HORIZONTAL_PULL", equipment: "cable",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 } },
  { name: "Chest-Supported Row", movementPattern: "HORIZONTAL_PULL", equipment: "machine",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 } },
  { name: "T-Bar Row", movementPattern: "HORIZONTAL_PULL", equipment: "barbell",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 } },
  // Single-Arm Cable Row, Inverted Row, Meadows Row, Seal Row: row mapping, as every existing row.
  { name: "Single-Arm Cable Row", movementPattern: "HORIZONTAL_PULL", equipment: "cable",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 } },
  { name: "Inverted Row", movementPattern: "HORIZONTAL_PULL", equipment: "bodyweight",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 } },
  { name: "Meadows Row", movementPattern: "HORIZONTAL_PULL", equipment: "barbell",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 } },
  { name: "Seal Row", movementPattern: "HORIZONTAL_PULL", equipment: "barbell",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5, "rear delts": 0.5 } },

  // VERTICAL_PULL
  { name: "Pull-Up", movementPattern: "VERTICAL_PULL", equipment: "bodyweight",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5 } },
  { name: "Chin-Up", movementPattern: "VERTICAL_PULL", equipment: "bodyweight",
    involvements: { lats: 1.0, biceps: 0.5, "upper back": 0.5 } },
  { name: "Lat Pulldown", movementPattern: "VERTICAL_PULL", equipment: "cable",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5 } },
  // Neutral-Grip Pull-Up, Assisted Pull-Up, Machine Pulldown: pull-up / pulldown mapping.
  { name: "Neutral-Grip Pull-Up", movementPattern: "VERTICAL_PULL", equipment: "bodyweight",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5 } },
  { name: "Assisted Pull-Up", movementPattern: "VERTICAL_PULL", equipment: "machine",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5 } },
  { name: "Machine Pulldown", movementPattern: "VERTICAL_PULL", equipment: "machine",
    involvements: { lats: 1.0, "upper back": 0.5, biceps: 0.5 } },
  { name: "Straight-Arm Pulldown", movementPattern: "VERTICAL_PULL", equipment: "cable",
    involvements: { lats: 1.0 } },

  // CARRY
  { name: "Farmer's Carry", movementPattern: "CARRY", equipment: "dumbbell",
    involvements: { forearms: 1.0, traps: 0.5 } },
  { name: "Suitcase Carry", movementPattern: "CARRY", equipment: "dumbbell",
    involvements: { forearms: 1.0, obliques: 1.0 } },
  { name: "Overhead Carry", movementPattern: "CARRY", equipment: "dumbbell",
    involvements: {} },
  // Front Rack Carry: abs 1.0 only. The front-loaded hold is anti-extension work for the anterior core.
  // No delts credited: holding the rack is isometric shoulder stabilization, which Overhead Carry already
  // treats as uncredited (it credits nothing).
  // TODO: verify: the isometric-hold convention is loose (Suitcase Carry credits obliques 1.0, Overhead
  // Carry credits nothing).
  { name: "Front Rack Carry", movementPattern: "CARRY", equipment: "dumbbell",
    involvements: { abs: 1.0 } },
  // Waiter Carry: obliques 1.0 only. One arm locked out overhead is a unilateral anti-lateral-flexion
  // load, like Suitcase Carry. Shoulder stabilization is uncredited, as in Overhead Carry.
  // TODO: verify: same isometric-hold caveat as Front Rack Carry.
  { name: "Waiter Carry", movementPattern: "CARRY", equipment: "dumbbell",
    involvements: { obliques: 1.0 } },

  // ISOLATION
  // JM Press: triceps 1.0, chest 0.5, front delts 0.5. A close-grip-press / skull-crusher hybrid. Tagged
  // ISOLATION (elbow extension leads; it is not a full pressing pattern), so it does NOT count toward
  // horizontal-push coverage. Listed first: it is the one multi-joint entry in this group.
  // TODO: verify: the chest and front-delt shares are estimates for a hybrid lift.
  { name: "JM Press", movementPattern: "ISOLATION", equipment: "barbell",
    involvements: { triceps: 1.0, chest: 0.5, "front delts": 0.5 } },
  { name: "Barbell Curl", movementPattern: "ISOLATION", equipment: "barbell",
    involvements: { biceps: 1.0 } },
  { name: "Hammer Curl", movementPattern: "ISOLATION", equipment: "dumbbell",
    involvements: { biceps: 1.0, forearms: 0.5 } },
  { name: "Dumbbell Curl", movementPattern: "ISOLATION", equipment: "dumbbell",
    involvements: { biceps: 1.0 } },
  { name: "Incline Curl", movementPattern: "ISOLATION", equipment: "dumbbell",
    involvements: { biceps: 1.0 } },
  { name: "Preacher Curl", movementPattern: "ISOLATION", equipment: "barbell",
    involvements: { biceps: 1.0 } },
  { name: "Concentration Curl", movementPattern: "ISOLATION", equipment: "dumbbell",
    involvements: { biceps: 1.0 } },
  { name: "Cable Curl", movementPattern: "ISOLATION", equipment: "cable",
    involvements: { biceps: 1.0 } },
  { name: "Spider Curl", movementPattern: "ISOLATION", equipment: "dumbbell",
    involvements: { biceps: 1.0 } },
  { name: "Bayesian Cable Curl", movementPattern: "ISOLATION", equipment: "cable",
    involvements: { biceps: 1.0 } },
  { name: "Tricep Pushdown", movementPattern: "ISOLATION", equipment: "cable",
    involvements: { triceps: 1.0 } },
  { name: "Overhead Tricep Extension", movementPattern: "ISOLATION", equipment: "cable",
    involvements: { triceps: 1.0 } },
  { name: "Skull Crusher", movementPattern: "ISOLATION", equipment: "barbell",
    involvements: { triceps: 1.0 } },
  { name: "Tricep Kickback", movementPattern: "ISOLATION", equipment: "dumbbell",
    involvements: { triceps: 1.0 } },
  { name: "Lateral Raise", movementPattern: "ISOLATION", equipment: "dumbbell",
    involvements: { "side delts": 1.0 } },
  { name: "Cable Lateral Raise", movementPattern: "ISOLATION", equipment: "cable",
    involvements: { "side delts": 1.0 } },
  { name: "Machine Lateral Raise", movementPattern: "ISOLATION", equipment: "machine",
    involvements: { "side delts": 1.0 } },
  { name: "Rear Delt Fly", movementPattern: "ISOLATION", equipment: "dumbbell",
    involvements: { "rear delts": 1.0, "upper back": 0.5 } },
  // Cable Rear Delt Fly, Machine Rear Delt Fly: Rear Delt Fly mapping.
  { name: "Cable Rear Delt Fly", movementPattern: "ISOLATION", equipment: "cable",
    involvements: { "rear delts": 1.0, "upper back": 0.5 } },
  { name: "Machine Rear Delt Fly", movementPattern: "ISOLATION", equipment: "machine",
    involvements: { "rear delts": 1.0, "upper back": 0.5 } },
  { name: "Leg Curl", movementPattern: "ISOLATION", equipment: "machine",
    involvements: { hamstrings: 1.0 } },
  { name: "Seated Leg Curl", movementPattern: "ISOLATION", equipment: "machine",
    involvements: { hamstrings: 1.0 } },
  // Nordic Hamstring Curl: hamstrings 1.0 only. Tagged ISOLATION, not HINGE: it is knee flexion (like Leg
  // Curl), and a HINGE tag would let it satisfy EXERCISE_SELECTION_BALANCE's hinge requirement. Calves
  // (gastrocnemius) assist knee flexion, but Leg Curl credits no calves, so none here.
  // TODO: verify: the calves credit (0.5?) and the pattern tag; each is a one-line change.
  { name: "Nordic Hamstring Curl", movementPattern: "ISOLATION", equipment: "bodyweight",
    involvements: { hamstrings: 1.0 } },
  { name: "Leg Extension", movementPattern: "ISOLATION", equipment: "machine",
    involvements: { quads: 1.0 } },
  // Hip Abduction: glutes 1.0. There is no abductor group; gluteus medius/minimus (the prime movers)
  // belong to the glutes group.
  // TODO: verify: the glutes group also covers gluteus maximus, so this credits glute volume it does not
  // train. Consider 0.5, or a separate group, if glute assessments look flattered.
  { name: "Hip Abduction", movementPattern: "ISOLATION", equipment: "machine",
    involvements: { glutes: 1.0 } },
  { name: "Hip Adduction", movementPattern: "ISOLATION", equipment: "machine",
    involvements: { adductors: 1.0 } },
  { name: "Standing Calf Raise", movementPattern: "ISOLATION", equipment: "machine",
    involvements: { calves: 1.0 } },
  { name: "Seated Calf Raise", movementPattern: "ISOLATION", equipment: "machine",
    involvements: { calves: 1.0 } },
  { name: "Donkey Calf Raise", movementPattern: "ISOLATION", equipment: "machine",
    involvements: { calves: 1.0 } },
  { name: "Cable Crunch", movementPattern: "ISOLATION", equipment: "cable",
    involvements: { abs: 1.0 } },
  { name: "Plank", movementPattern: "ISOLATION", equipment: "bodyweight",
    involvements: { abs: 1.0, obliques: 0.5 } },
  // Hanging Leg Raise: abs 1.0. Hip flexors do the rest, but there is no hip-flexor group.
  { name: "Hanging Leg Raise", movementPattern: "ISOLATION", equipment: "bodyweight",
    involvements: { abs: 1.0 } },
  // Ab Wheel Rollout: abs 1.0, obliques 0.5 (Plank mapping). Lats are deliberately omitted: they brace
  // against shoulder flexion isometrically/eccentrically, and the convention credits stabilizers 0.
  // TODO: verify: lats 0.5 is arguable; crediting it would add lat volume for core work.
  { name: "Ab Wheel Rollout", movementPattern: "ISOLATION", equipment: "bodyweight",
    involvements: { abs: 1.0, obliques: 0.5 } },
  { name: "Machine Crunch", movementPattern: "ISOLATION", equipment: "machine",
    involvements: { abs: 1.0 } },
  // Pallof Press: obliques 1.0, abs 0.5. Anti-rotation makes the obliques the primary resistor (as in
  // Suitcase Carry); the rectus assists. This flips the abs-primary mapping suggested in the brief.
  // TODO: verify: isometric work; crediting anti-rotation at all is a convention call.
  { name: "Pallof Press", movementPattern: "ISOLATION", equipment: "cable",
    involvements: { obliques: 1.0, abs: 0.5 } },
  // Side Plank, Russian Twist: obliques lead, abs assists.
  { name: "Side Plank", movementPattern: "ISOLATION", equipment: "bodyweight",
    involvements: { obliques: 1.0, abs: 0.5 } },
  { name: "Russian Twist", movementPattern: "ISOLATION", equipment: "bodyweight",
    involvements: { obliques: 1.0, abs: 0.5 } },

  // OTHER
  // Upright Row: side delts 1.0, traps 0.5, front delts 0.5. Delts and upper traps are co-primary; traps get
  // 0.5 as in Farmer's Carry, and the anterior delt assists in the scapular plane.
  // TODO: verify: grip width moves the balance between side delts and traps.
  { name: "Upright Row", movementPattern: "OTHER", equipment: "barbell",
    involvements: { "side delts": 1.0, traps: 0.5, "front delts": 0.5 } },
  { name: "Face Pull", movementPattern: "OTHER", equipment: "cable",
    involvements: { "rear delts": 1.0, "upper back": 0.5 } },
  { name: "Shrug", movementPattern: "OTHER", equipment: "dumbbell",
    involvements: { traps: 1.0 } },
  // "Dumbbell Shrug" is not added: the existing "Shrug" already is the dumbbell shrug (equipment dumbbell)
  // and existing names must not change.
  { name: "Barbell Shrug", movementPattern: "OTHER", equipment: "barbell",
    involvements: { traps: 1.0 } },
  { name: "Cable Shrug", movementPattern: "OTHER", equipment: "cable",
    involvements: { traps: 1.0 } },
];

// ───────────────────── Main ─────────────────────

async function main() {
  console.log("Seeding canonical reference data (idempotent)...");

  // Muscle groups — upsert by unique name
  for (const name of MUSCLE_GROUPS) {
    await prisma.muscleGroup.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`  ✓ ${MUSCLE_GROUPS.length} muscle groups`);

  // Load muscle groups into a lookup by name
  const muscleRows = await prisma.muscleGroup.findMany();
  const muscleByName = new Map(muscleRows.map((m) => [m.name, m.id]));

  // Exercises — upsert by name (name is not unique in schema; guard by findFirst)
  let exerciseCount = 0;
  for (const ex of EXERCISES) {
    let existing = await prisma.exercise.findFirst({ where: { name: ex.name } });
    if (!existing) {
      existing = await prisma.exercise.create({
        data: {
          name: ex.name,
          movementPattern: ex.movementPattern,
          equipment: ex.equipment ?? null,
        },
      });
      exerciseCount += 1;
    }

    // Involvements — upsert by composite id
       // Involvements — upsert the new list, then delete anything no longer listed.
    //
    // The deleteMany pass is load-bearing. Without it, an exercise whose
    // involvement list shrinks (e.g. Back Squat losing its hamstrings/lower
    // back/abs/adductors credits) keeps the old rows forever — upsert cannot
    // remove them, only update or insert.
    const newMuscleIds: string[] = [];
    for (const [muscleName, factor] of Object.entries(ex.involvements)) {
      const muscleId = muscleByName.get(muscleName);
      if (!muscleId) {
        // Unknown muscle in the involvements map — fail loudly rather than skip silently.
        throw new Error(
          `Seed exercise "${ex.name}" references unknown muscle group "${muscleName}"`,
        );
      }
      newMuscleIds.push(muscleId);

      await prisma.exerciseMuscleInvolvement.upsert({
        where: {
          exerciseId_muscleGroupId: {
            exerciseId: existing.id,
            muscleGroupId: muscleId,
          },
        },
        update: { involvementFactor: factor },
        create: {
          exerciseId: existing.id,
          muscleGroupId: muscleId,
          involvementFactor: factor,
        },
      });
    }

    // Delete involvements no longer in the new mapping. For Overhead Carry
    // (empty involvements), notIn: [] deletes every prior row — intended.
    await prisma.exerciseMuscleInvolvement.deleteMany({
      where: {
        exerciseId: existing.id,
        muscleGroupId: { notIn: newMuscleIds },
      },
    });
  }
  console.log(`  ✓ ${EXERCISES.length} exercises (${exerciseCount} newly created)`);

  // GoalProfileDefinition — HYPERTROPHY only
  //
  // thresholds is deliberately an empty object. Bounds, weights, and band
  // edges are [SCIENTIFIC INPUT REQUIRED] and must not be invented here.
  await prisma.goalProfileDefinition.upsert({
    where: { key: "HYPERTROPHY" },
    update: {},
    create: {
      key: "HYPERTROPHY",
      displayName: "Hypertrophy",
      configVersion: "0.0.1-unvalidated",
      thresholds: {},
      validated: false,
      sourceNote: "UNRESOLVED — SCIENTIFIC INPUT REQUIRED",
    },
  });
  console.log("  ✓ GoalProfileDefinition HYPERTROPHY (validated: false, thresholds: {})");

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  // Re-throw so tsx exits non-zero and prisma migrate dev fails loudly
  // rather than leaving the database half-populated.
  throw err;
});