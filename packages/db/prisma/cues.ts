// Exercise cues, shown behind a "Cues" toggle on the session screen.
//
// Source of truth. `prisma/seed.ts` writes these onto the Exercise rows by name (it never renames a row), so
// editing a line or flipping `draft(` to `written(` here and reseeding is how a cue changes.
//
// Two shapes (see exerciseCues.test.ts in the domain package, which fails on the first broken rule):
//   - written(setup, action, feel): the Setup / Action / Feel structure (ARCH-074). Read by the founder, so it
//     ships reviewed (no "(beta)").
//   - draft(...lines): the earlier 2-3 lines, each stored as an "action" step, still "(beta)" until rewritten.
//
// Rules:
//   - Second person. Setup is a position you can check alone; action is verb-first and names what starts the
//     movement; feel names the muscle and the sensation.
//   - Movement directives and negatives both fine ("keep your chest proud", "no shrug"). Mind-muscle and pump
//     language fine ("squeeze", "feel the stretch").
//   - No safety, medical or outcome language: no claim of what a cue protects, prevents or builds. Describe the
//     sensation, not the consequence. The app cannot see you, so it never judges your technique.
//   - Length limits per kind in CUE_MAX_CHARS.
//   - Effort is taught once per session in the effort picker, so no cue repeats it.

export type CueKind = "setup" | "action" | "feel";

export interface CueStep {
  readonly kind: CueKind;
  readonly text: string;
}

/** Longest allowed line, by kind. Draft (action-only) lines were written to 90 and stay inside it. */
export const CUE_MAX_CHARS: Readonly<Record<CueKind, number>> = {
  setup: 110,
  action: 110,
  feel: 120,
};

export interface ExerciseCueEntry {
  readonly cues: readonly CueStep[];
  /** false = drafted, not yet read by the founder; the session screen shows "(beta)". */
  readonly reviewed: boolean;
}

const draft = (...lines: string[]): ExerciseCueEntry => ({
  cues: lines.map((text) => ({ kind: "action" as const, text })),
  reviewed: false,
});

/** Setup / Action / Feel, founder-approved 2026-11-15. */
const written = (setup: string, action: string, feel: string): ExerciseCueEntry => ({
  cues: [
    { kind: "setup", text: setup },
    { kind: "action", text: action },
    { kind: "feel", text: feel },
  ],
  reviewed: true,
});

export const EXERCISE_CUES: Readonly<Record<string, ExerciseCueEntry>> = {
  // SQUAT
  "Back Squat": written(
    "Bar across your upper back, feet shoulder-width, toes turned slightly out, chest up.",
    "Sit straight down between your hips, then push the floor away and stand up through your mid-foot.",
    "Feel your quads and glutes drive you up out of the bottom.",
  ),
  "Front Squat": draft(
    "Rest the bar on your front shoulders with your elbows pointing forward.",
    "Lower straight down, then drive up through your whole foot.",
  ),
  "Hack Squat": draft(
    "Set your feet shoulder-width on the platform with your shoulders under the pads.",
    "Lower until your thighs are parallel to the platform, then press back up.",
    "Feel the front of your thighs working.",
  ),
  "Leg Press": written(
    "Feet shoulder-width on the middle of the platform, hips flat on the seat, lower back against the pad.",
    "Lower until your knees travel toward your chest, then drive the platform away through your whole foot.",
    "Feel your quads and glutes pushing, not your toes.",
  ),
  "Bulgarian Split Squat": written(
    "Back foot on a bench behind you, front foot a long step forward, torso tall.",
    "Lower straight down until your front thigh is about parallel, then push through your front foot.",
    "Feel your front quad and glute working, not your back foot.",
  ),
  "Reverse Lunge": draft(
    "Step back far enough that your front shin stays close to vertical.",
    "Lower your back knee toward the floor, then push through your front foot to return.",
  ),
  "Walking Lunge": draft(
    "Take a long step and lower your back knee toward the floor.",
    "Push through your front foot to step into the next stride.",
    "Keep every stride the same length.",
  ),
  "Step-Up": draft(
    "Pick a box that puts your thigh about parallel when your foot is on it.",
    "Push through the whole foot on the box to stand, without pushing off your back foot.",
    "Lower slowly back to the floor.",
  ),
  "Goblet Squat": written(
    "Hold one dumbbell against your chest with both hands, elbows pointing down, feet just wider than hips.",
    "Sit down between your knees with your elbows inside them, then stand up through your mid-foot.",
    "Feel your quads and glutes working as you stand.",
  ),
  "Pendulum Squat": draft(
    "Set your feet on the platform with your shoulders under the pads.",
    "Lower until your thighs are about parallel, then drive up through your whole foot.",
    "Feel the front of your thighs working.",
  ),
  "Belt Squat": draft(
    "Clip the belt on and stand on the platforms with your feet shoulder-width apart.",
    "Sit down between your feet, then stand tall by pushing the platforms away.",
  ),
  "Smith Machine Squat": draft(
    "Place your feet slightly in front of the bar and set it across your upper back.",
    "Sit down until your thighs are about parallel, then push the floor away to stand.",
  ),
  "Zercher Squat": draft(
    "Hold the bar in the crooks of your elbows against your stomach.",
    "Lower between your knees with your elbows near your thighs, then stand up.",
  ),
  "Sissy Squat": draft(
    "Hold a support and rise onto the balls of your feet.",
    "Let your knees slide forward as you lean back and lower under control, then return.",
    "Feel the front of your thighs stretch.",
  ),

  // HINGE
  "Conventional Deadlift": written(
    "Bar over your mid-foot, hands just outside your legs, shoulders slightly in front of the bar.",
    "Push the floor away and keep the bar dragging up your legs until you stand tall.",
    "Feel your glutes and hamstrings drive your hips forward at the top.",
  ),
  "Romanian Deadlift": written(
    "Feet hip-width, knees soft, bar against your shins.",
    "Push your hips back like you're closing a car door with your butt, bar drags up your legs.",
    "Feel the stretch along the back of your thighs. Stop when the hamstrings are taut, not when the bar hits the floor.",
  ),
  "Sumo Deadlift": draft(
    "Take a wide stance with your toes turned out and grip the bar inside your knees.",
    "Push your knees out and the floor away as you stand.",
  ),
  "Hip Thrust": draft(
    "Rest your upper back on a bench with the bar across your hips.",
    "Drive your hips up until your shoulders, hips and knees line up.",
    "Feel your glutes squeeze at the top.",
  ),
  "Good Morning": draft(
    "Rest the bar across your upper back with a soft bend in your knees.",
    "Push your hips back until you feel your hamstrings stretch, then stand tall.",
  ),
  "Stiff-Leg Deadlift": draft(
    "Start standing with the bar at your hips and your knees only slightly bent.",
    "Lower the bar along your legs as your hips travel back.",
    "Feel the stretch in your hamstrings, then stand up.",
  ),
  "Trap Bar Deadlift": draft(
    "Stand in the middle of the bar and grip the handles at your sides.",
    "Push the floor away until you stand tall, then lower with control.",
  ),
  "Rack Pull": draft(
    "Set the bar on the pins at about knee height and grip just outside your legs.",
    "Stand up by pushing your hips forward and the floor away.",
  ),
  "Cable Pull-Through": draft(
    "Face away from the cable, holding the rope between your legs.",
    "Push your hips back until you feel your hamstrings stretch.",
    "Drive your hips forward and squeeze your glutes at the top.",
  ),
  "Glute Bridge": written(
    "Lie on your back, feet flat and hip-width, knees bent, arms by your sides.",
    "Push through your heels and drive your hips up until your shoulders, hips and knees line up.",
    "Squeeze your glutes hard at the top.",
  ),
  "45-Degree Back Extension": draft(
    "Set the pad just below your hips so you can bend freely at the waist.",
    "Lower your torso until you feel your hamstrings stretch, then rise until you are in line.",
  ),
  "Reverse Hyperextension": draft(
    "Lie on the pad with your hips at the edge and hold the handles.",
    "Swing your legs up behind you until they are in line with your body.",
    "Feel your glutes squeeze at the top.",
  ),

  // HORIZONTAL_PUSH
  "Barbell Bench Press": written(
    "Eyes under the bar, shoulder blades pinned back into the bench, feet planted flat on the floor.",
    "Lower the bar to the same spot on your chest, then press it up and slightly back.",
    "Feel your chest and triceps pushing the bar away from you.",
  ),
  "Dumbbell Bench Press": written(
    "Lie back with the dumbbells at your chest, feet planted, shoulder blades pinned into the bench.",
    "Press the dumbbells up over your shoulders, then lower until you feel your chest stretch.",
    "Feel your chest squeeze as the dumbbells come together over you.",
  ),
  "Incline Barbell Bench Press": draft(
    "Set the bench at about 30° and lie with your eyes under the bar.",
    "Lower the bar to your upper chest, then press it back up.",
  ),
  "Push-Up": written(
    "Hands just outside your shoulders, feet together, body in one line from head to heels.",
    "Lower your chest to a fist from the floor, then push the floor away.",
    "Feel your chest and triceps pushing you up.",
  ),
  "Incline Dumbbell Press": written(
    "Bench at 30°, dumbbells at your shoulders, shoulder blades pinned back into the pad.",
    "Press the dumbbells up and slightly together over your upper chest, then lower under control.",
    "Feel your upper chest stretch at the bottom, squeeze at the top.",
  ),
  "Decline Bench Press": draft(
    "Hook your feet under the pads and lie with your eyes under the bar.",
    "Lower the bar to your lower chest, then press it up.",
  ),
  "Machine Chest Press": draft(
    "Adjust the seat so the handles line up with the middle of your chest.",
    "Press the handles forward until your arms are straight, then return slowly.",
    "Feel your chest doing the pushing.",
  ),
  "Smith Machine Bench Press": draft(
    "Place the bench so the bar comes down to your mid-chest.",
    "Unrack, lower the bar to your chest, then press it up.",
  ),
  "Close-Grip Bench Press": draft(
    "Grip the bar about shoulder-width apart and lie with your eyes under it.",
    "Lower it to your lower chest, keeping your elbows close to your sides.",
    "Press up and feel your triceps working.",
  ),
  "Chest Dip": draft(
    "Hold the bars with straight arms and lean your torso slightly forward.",
    "Lower until your upper arms are about parallel to the floor, then press up.",
    "Feel a stretch across your chest at the bottom.",
  ),
  "Tricep Dip": draft(
    "Hold the bars with straight arms and keep your torso upright.",
    "Lower until your upper arms are about parallel to the floor, then press up.",
    "Feel your triceps working as you straighten your arms.",
  ),
  "Cable Chest Fly": written(
    "Stand between the cables, one foot forward, soft bend in your elbows, handles at chest height.",
    "Sweep your hands together in a wide arc in front of your chest, then open slowly.",
    "Feel your chest stretch as you open, squeeze as you meet.",
  ),
  "Pec Deck": draft(
    "Set the seat so the handles sit at chest height.",
    "Bring the handles together in front of you, then open slowly.",
    "Feel your chest squeeze in the middle.",
  ),
  "Dumbbell Fly": draft(
    "Lie back with the dumbbells above your chest and a soft bend in your elbows.",
    "Open your arms in a wide arc until your chest stretches, then bring them back together.",
    "Keep the same bend in your elbows the whole way.",
  ),

  // VERTICAL_PUSH
  "Overhead Press": written(
    "Bar at your collarbone, hands just outside your shoulders, glutes squeezed, ribs down.",
    "Press the bar straight up and push your head through once it clears your face.",
    "Feel your shoulders and triceps drive the bar to lockout.",
  ),
  "Dumbbell Shoulder Press": written(
    "Seat upright, dumbbells at shoulder height, palms facing forward, ribs down.",
    "Press the dumbbells straight up until your arms are extended, then lower to shoulder height.",
    "Feel the front and sides of your shoulders pushing.",
  ),
  "Arnold Press": draft(
    "Start with the dumbbells at your chest and your palms facing you.",
    "Turn your palms forward as you press up, then reverse the turn on the way down.",
  ),
  "Machine Shoulder Press": draft(
    "Adjust the seat so the handles start at shoulder height.",
    "Press up until your arms are straight, then lower slowly.",
    "Feel your shoulders doing the work.",
  ),
  "Push Press": draft(
    "Hold the bar at your collarbone and dip a short way through your knees.",
    "Drive up through your legs and keep pressing the bar to arms' length.",
  ),
  "Landmine Press": draft(
    "Hold the end of the bar at your shoulder and stand close to it.",
    "Press the bar up and forward until your arm is straight, then lower it back.",
  ),
  "Pike Push-Up": draft(
    "Start with your hips high and your hands on the floor, like an upside-down V.",
    "Lower the top of your head toward the floor between your hands, then press back up.",
    "Feel your shoulders doing the pressing.",
  ),

  // HORIZONTAL_PULL
  "Barbell Row": written(
    "Hinge forward from your hips, bar hanging below your chest, hands just outside your knees.",
    "Pull the bar toward your lower ribs, leading with your elbows, then lower it under control.",
    "Feel your lats and upper back squeeze as the bar reaches you.",
  ),
  "Dumbbell Row": written(
    "One hand and knee on a bench, dumbbell hanging under your shoulder, back parallel to the floor.",
    "Pull your elbow back toward your hip, then lower until your arm is straight.",
    "Feel your lats squeeze at the top and stretch at the bottom.",
  ),
  "Seated Cable Row": written(
    "Feet on the platform, knees slightly bent, chest tall, handle at arm's length.",
    "Pull the handle to your stomach, leading with your elbows, then reach forward slowly.",
    "Feel your shoulder blades squeeze together and your mid-back working.",
  ),
  "Chest-Supported Row": draft(
    "Lie with your chest on the pad and let the handles hang at arm's length.",
    "Pull your elbows back until your upper back squeezes, then lower slowly.",
  ),
  "T-Bar Row": draft(
    "Stand over the bar and lean forward from your hips with a soft bend in your knees.",
    "Pull the handle to your chest, then lower until your arms are straight.",
  ),
  "Single-Arm Cable Row": draft(
    "Sit or stand facing the cable with your feet set.",
    "Pull your elbow back past your ribs, then let your arm reach forward.",
    "Feel your upper back squeeze at the end.",
  ),
  "Inverted Row": draft(
    "Lie under the bar and hold it just outside your shoulders.",
    "Pull your chest to the bar, then lower until your arms are straight.",
  ),
  "Meadows Row": draft(
    "Stand sideways to the landmine and hold the end of the bar with one hand.",
    "Pull your elbow up and back toward your hip, then lower slowly.",
    "Feel your upper back squeeze.",
  ),
  "Seal Row": draft(
    "Lie face down on a high bench with the bar hanging below you.",
    "Pull the bar up to the bench, then lower it until your arms are straight.",
  ),

  // VERTICAL_PULL
  "Pull-Up": written(
    "Hang from the bar, hands just outside your shoulders, shoulder blades pulled down away from your ears.",
    "Drive your elbows down toward your hips and pull your chest up to meet the bar.",
    "Feel your lats squeeze under your armpits at the top.",
  ),
  "Chin-Up": draft(
    "Hang from the bar with your palms facing you and your hands shoulder-width apart.",
    "Pull your chin over the bar, then lower until your arms are straight.",
  ),
  "Lat Pulldown": written(
    "Snug the thigh pad. Grip just outside shoulders, shoulder blades pulled down away from your ears.",
    "Drive your elbows down toward your hips, chest lifted to meet the bar.",
    "Squeeze your armpits tight at the bottom — no shoulder roll.",
  ),
  "Neutral-Grip Pull-Up": draft(
    "Hang from the handles with your palms facing each other.",
    "Pull your chest up toward the handles, then lower until your arms are straight.",
  ),
  "Assisted Pull-Up": draft(
    "Kneel or stand on the pad and grip the bar just outside your shoulders.",
    "Pull your chest toward the bar, then lower until your arms are straight.",
  ),
  "Machine Pulldown": draft(
    "Adjust the seat so the pad rests on your thighs, then grip the handles.",
    "Pull the handles down toward your shoulders, then reach up slowly.",
    "Feel your lats pulling your elbows down.",
  ),
  "Straight-Arm Pulldown": draft(
    "Stand facing the cable with a slight bend in your elbows.",
    "Sweep the bar down in an arc to your thighs, keeping your arms straight.",
    "Feel your lats pulling the bar down.",
  ),

  // CARRY
  "Farmer's Carry": draft(
    "Pick up a dumbbell in each hand and stand tall.",
    "Walk in short, steady steps with the weights at your sides.",
    "Keep your grip firm from the first step to the last.",
  ),
  "Suitcase Carry": draft(
    "Hold one dumbbell at your side and stand tall.",
    "Walk in short, steady steps without leaning toward either side.",
  ),
  "Overhead Carry": draft(
    "Hold the dumbbell overhead with your arm straight and your biceps by your ear.",
    "Walk in short, steady steps, keeping the weight over your shoulder.",
  ),
  "Front Rack Carry": draft(
    "Hold the weights at your shoulders with your elbows tucked in front.",
    "Walk in short, steady steps and keep your ribs down.",
  ),
  "Waiter Carry": draft(
    "Hold one dumbbell overhead with your arm straight and your palm facing the ceiling.",
    "Walk in short, steady steps, keeping the weight stacked over your shoulder.",
  ),

  // ISOLATION
  "JM Press": draft(
    "Lie as for a close-grip bench press, with your hands shoulder-width apart.",
    "Lower the bar toward your upper chest with your elbows pointing forward.",
    "Press up by straightening your elbows and feel your triceps.",
  ),
  "Barbell Curl": written(
    "Stand tall, bar at your thighs, palms forward, elbows tucked against your sides.",
    "Curl the bar toward your shoulders with your elbows pinned in place, then lower slowly.",
    "Feel your biceps squeeze at the top and stretch at the bottom.",
  ),
  "Hammer Curl": written(
    "Stand tall with the dumbbells at your sides, palms facing each other, elbows tucked in.",
    "Curl the dumbbells up like you're lifting hammers, wrists still, then lower slowly.",
    "Feel the outside of your upper arm and your forearms working.",
  ),
  "Dumbbell Curl": written(
    "Stand tall, dumbbells at your sides, palms forward, elbows tucked against your ribs.",
    "Curl the dumbbells up to your shoulders while your elbows stay in place.",
    "Feel your biceps squeeze at the top.",
  ),
  "Incline Curl": draft(
    "Lie back on an incline bench and let your arms hang straight down.",
    "Curl the dumbbells up without moving your elbows forward.",
    "Feel your biceps stretch at the bottom.",
  ),
  "Preacher Curl": draft(
    "Rest your upper arms on the pad and hold the bar with your palms up.",
    "Curl the bar up, then lower until your arms are nearly straight.",
    "Feel your biceps working the whole way down.",
  ),
  "Concentration Curl": draft(
    "Sit with your elbow against your inner thigh and the dumbbell hanging.",
    "Curl the dumbbell to your shoulder, then lower slowly.",
    "Feel your biceps squeeze at the top.",
  ),
  "Cable Curl": draft(
    "Stand facing the cable with your elbows at your sides.",
    "Curl the handle up to your shoulders without moving your elbows.",
    "Feel your biceps working against the cable the whole way.",
  ),
  "Spider Curl": draft(
    "Lie chest-down on an incline bench with the dumbbells hanging below you.",
    "Curl up without swinging, then lower until your arms are straight.",
    "Feel your biceps squeeze at the top.",
  ),
  "Bayesian Cable Curl": draft(
    "Face away from the cable and hold the handle behind you with your arm back.",
    "Curl the handle forward to your shoulder, keeping your elbow behind your body.",
    "Feel your biceps stretch at the start.",
  ),
  "Tricep Pushdown": written(
    "Stand close to the cable, elbows pinned at your sides, hands on the handle.",
    "Push the handle down until your arms are straight, elbows staying put, then let it rise slowly.",
    "Feel your triceps squeeze at the bottom.",
  ),
  "Overhead Tricep Extension": draft(
    "Hold the cable behind your head with your elbows pointing forward.",
    "Straighten your arms out in front of you, then return slowly.",
    "Feel your triceps stretch as you bend your elbows.",
  ),
  "Skull Crusher": written(
    "Lie back, bar over your chest on straight arms, upper arms vertical.",
    "Bend only your elbows to lower the bar toward your forehead, then press it back up.",
    "Feel your triceps stretch at the bottom and squeeze as you press.",
  ),
  "Tricep Kickback": draft(
    "Lean forward with your upper arm held against your side.",
    "Straighten your elbow until your arm is in line with your body, then lower.",
    "Feel your triceps squeeze at the top.",
  ),
  "Lateral Raise": written(
    "Stand tall, slight forward lean, arms angled 30° in front of your body.",
    "Lead with your elbows, push the dumbbells out toward the walls.",
    "Tension strictly on the side of your shoulders. Traps stay relaxed — no shrug.",
  ),
  "Cable Lateral Raise": draft(
    "Stand sideways to the cable and hold the handle with your far hand.",
    "Raise your arm out to the side to shoulder height, then lower slowly.",
    "Feel the side of your shoulder working.",
  ),
  "Machine Lateral Raise": draft(
    "Adjust the seat so the pads sit at your elbows.",
    "Raise your arms out to the sides until they reach shoulder height.",
    "Feel the sides of your shoulders working.",
  ),
  "Rear Delt Fly": draft(
    "Lean forward with the dumbbells hanging below your chest.",
    "Open your arms out to the sides until your hands reach shoulder height.",
    "Feel the backs of your shoulders working.",
  ),
  "Cable Rear Delt Fly": draft(
    "Stand between the cables and cross the handles in front of you.",
    "Pull your arms out and back until your hands are level with your shoulders.",
    "Feel the backs of your shoulders working.",
  ),
  "Machine Rear Delt Fly": draft(
    "Sit facing the pad with your chest on it and your arms out in front.",
    "Swing your arms back until they are level with your shoulders.",
    "Feel the backs of your shoulders working.",
  ),
  "Leg Curl": written(
    "Lie face down, pad just above your heels, hips pressed flat into the bench.",
    "Curl your heels toward your glutes, then lower slowly until your legs are nearly straight.",
    "Feel your hamstrings squeeze at the top, stretch on the way down.",
  ),
  "Seated Leg Curl": draft(
    "Sit with the pad just above your heels and the lap pad snug on your thighs.",
    "Pull your heels back and down, then return slowly.",
    "Feel your hamstrings squeeze at the bottom.",
  ),
  "Nordic Hamstring Curl": draft(
    "Kneel with your feet anchored and your body in a straight line from knees to head.",
    "Lower your torso forward as slowly as you can, then push off the floor to come back up.",
    "Feel your hamstrings working to slow you down.",
  ),
  "Leg Extension": written(
    "Seat set so your knees line up with the machine's pivot, pad just above your ankles.",
    "Press your legs out until your knees are straight, then lower slowly.",
    "Feel your quads squeeze at the top.",
  ),
  "Hip Abduction": draft(
    "Sit with the pads against the outside of your knees.",
    "Push your knees out against the pads, then return slowly.",
    "Feel the outsides of your hips working.",
  ),
  "Hip Adduction": draft(
    "Sit with the pads against the inside of your knees.",
    "Squeeze your knees together, then return slowly.",
    "Feel the insides of your thighs working.",
  ),
  "Standing Calf Raise": written(
    "Balls of your feet on the edge, shoulders under the pads, knees soft.",
    "Rise onto your toes as high as you can, pause, then lower your heels below the edge.",
    "Feel a deep stretch in your calves at the bottom.",
  ),
  "Seated Calf Raise": draft(
    "Sit with the balls of your feet on the platform and the pad over your knees.",
    "Rise onto your toes as high as you can, then lower your heels below the platform.",
    "Feel your calves stretch at the bottom.",
  ),
  "Donkey Calf Raise": draft(
    "Hinge forward with the balls of your feet on the edge and your hips under the pad.",
    "Rise as high as you can onto your toes, then lower below the edge.",
    "Feel your calves stretch at the bottom.",
  ),
  "Cable Crunch": draft(
    "Kneel facing the cable and hold the rope beside your head.",
    "Curl your ribs toward your hips, then return slowly.",
    "Feel your abs squeezing.",
  ),
  Plank: written(
    "Forearms on the floor, elbows under your shoulders, toes down, body in one line.",
    "Squeeze your glutes and brace your abs as if a light punch is coming, then hold.",
    "Feel your abs tight and your hips level.",
  ),
  "Hanging Leg Raise": draft(
    "Hang from the bar with your arms straight.",
    "Raise your legs in front of you, then lower them without swinging.",
    "Feel your abs pulling your legs up.",
  ),
  "Ab Wheel Rollout": draft(
    "Kneel with the wheel under your shoulders.",
    "Roll forward until your arms are in line with your ears, then pull back to the start.",
    "Feel your abs working to hold you steady.",
  ),
  "Machine Crunch": draft(
    "Adjust the seat so the pads rest on your upper chest.",
    "Curl your ribs toward your hips, then return slowly.",
    "Feel your abs squeeze.",
  ),
  "Pallof Press": draft(
    "Stand sideways to the cable and hold the handle at your chest.",
    "Press the handle straight out and hold it for a moment, then bring it back.",
    "Feel your abs resisting the pull.",
  ),
  "Side Plank": draft(
    "Lie on your side and rest on your forearm with your elbow under your shoulder.",
    "Lift your hips and hold a straight line from your head to your feet.",
    "Feel the side of your waist working.",
  ),
  "Russian Twist": draft(
    "Sit and lean back slightly with your feet on the floor.",
    "Turn your chest from side to side, moving the weight with you.",
    "Feel your abs working as you turn.",
  ),

  // OTHER
  "Upright Row": draft(
    "Hold the bar in front of your thighs with your hands about shoulder-width apart.",
    "Pull it up along your body to about chest height, leading with your elbows.",
    "Lower it slowly.",
  ),
  "Face Pull": written(
    "Cable at face height, rope in both hands, step back until the weight hangs off the stack.",
    "Pull the rope toward your face and pull the ends apart, elbows high.",
    "Feel the backs of your shoulders squeeze, with your traps relaxed.",
  ),
  Shrug: draft(
    "Stand tall with the dumbbells hanging at your sides.",
    "Lift your shoulders straight up toward your ears, then lower slowly.",
    "Feel your upper traps working.",
  ),
  "Barbell Shrug": draft(
    "Stand tall holding the bar in front of your thighs.",
    "Lift your shoulders straight up toward your ears, pause, then lower slowly.",
  ),
  "Cable Shrug": draft(
    "Stand tall holding the cable handles at your sides.",
    "Lift your shoulders straight up toward your ears, then lower slowly.",
    "Feel your upper traps working.",
  ),
};
