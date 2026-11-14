// Exercise cues: 2-3 short lines per exercise, shown behind a "Cues" toggle on the session screen.
//
// Source of truth. `prisma/seed.ts` writes these onto the Exercise rows by name (it never renames a row), so
// editing a line or flipping `draft(...)` to `reviewed(...)` here and reseeding is how a cue changes.
//
// Rules (see cues.test.ts, which fails on the first broken one):
//   - Second person. Setup you can check alone, range you can check alone, or what to feel.
//   - No safety, medical or outcome language, and no form correction. The app cannot see you.
//   - At most CUE_MAX_CHARS characters a line; 2-3 lines an exercise.
//   - A cue ships as `draft` (the screen labels it "(beta)") until the founder has read it and moved it to `reviewed`.
//   - Effort is taught once per session in the effort picker, so no cue repeats it.

export const CUE_MAX_CHARS = 90;

export interface ExerciseCueEntry {
  readonly cues: readonly string[];
  /** false = drafted, not yet read by the founder; the session screen shows "(beta)". */
  readonly reviewed: boolean;
}

const draft = (...cues: string[]): ExerciseCueEntry => ({ cues, reviewed: false });
// Founder review (2026-11): change `draft(` to `reviewed(` for an exercise once its cues have been read.
// Kept as a function so the change is one word per exercise.
export const reviewed = (...cues: string[]): ExerciseCueEntry => ({ cues, reviewed: true });

export const EXERCISE_CUES: Readonly<Record<string, ExerciseCueEntry>> = {
  // SQUAT
  "Back Squat": draft(
    "Set the bar across your upper back with your hands just outside your shoulders.",
    "Sit down between your hips, then push the floor away to stand.",
    "Go to the same depth every rep so your numbers compare week to week.",
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
  "Leg Press": draft(
    "Place your feet shoulder-width, mid-platform, with your hips flat on the seat.",
    "Lower your knees toward your chest until your hips are about to lift off the seat.",
    "Push the platform away through your whole foot.",
  ),
  "Bulgarian Split Squat": draft(
    "Rest your back foot on a bench and step far enough to sit straight down.",
    "Lower until your front thigh is about parallel, then push through your front foot.",
    "Feel your front leg doing the work, not your back foot.",
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
  "Goblet Squat": draft(
    "Hold one dumbbell against your chest with both hands.",
    "Sit down between your knees with your elbows inside them, then stand up.",
  ),
  "Pendulum Squat": draft(
    "Set your feet on the platform with your shoulders under the pads.",
    "Lower to the depth you chose, then drive back up through your whole foot.",
    "Feel the front of your thighs working.",
  ),
  "Belt Squat": draft(
    "Clip the belt on and stand on the platforms with your feet shoulder-width apart.",
    "Sit down between your feet, then stand tall by pushing the platforms away.",
  ),
  "Smith Machine Squat": draft(
    "Place your feet slightly in front of the bar and set it across your upper back.",
    "Sit down to your usual depth, then push the floor away to stand.",
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
  "Conventional Deadlift": draft(
    "Stand with the bar over your mid-foot and grip it just outside your legs.",
    "Push the floor away, keeping the bar close to your legs as you stand.",
    "Lower the bar back along your legs to the floor under control.",
  ),
  "Romanian Deadlift": draft(
    "Start standing with the bar at your hips and a soft bend in your knees.",
    "Push your hips back and slide the bar down your thighs.",
    "Feel your hamstrings stretch, then drive your hips forward to stand.",
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
  "Glute Bridge": draft(
    "Lie on your back with your feet flat and your knees bent.",
    "Push through your heels to lift your hips.",
    "Feel your glutes squeeze at the top for a moment.",
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
  "Barbell Bench Press": draft(
    "Lie so your eyes are under the bar and plant your feet on the floor.",
    "Lower the bar to the same spot on your chest every rep.",
    "Press the bar up and slightly back until it is over your shoulders.",
  ),
  "Dumbbell Bench Press": draft(
    "Sit with the dumbbells on your thighs, lie back and bring them to your chest.",
    "Lower them until you feel your chest stretch, then press them up over your shoulders.",
  ),
  "Incline Barbell Bench Press": draft(
    "Set the bench at a low incline and lie with your eyes under the bar.",
    "Lower the bar to your upper chest, then press it back up.",
  ),
  "Push-Up": draft(
    "Place your hands just outside your shoulders and your feet together.",
    "Lower your chest to about a fist from the floor, then push the floor away.",
  ),
  "Incline Dumbbell Press": draft(
    "Set the bench at a low incline and bring the dumbbells to your shoulders.",
    "Press them up until your arms are straight, then lower until you feel your chest stretch.",
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
  "Cable Chest Fly": draft(
    "Stand between the cables with a soft bend in your elbows.",
    "Sweep your hands together in front of your chest in a wide arc.",
    "Feel your chest stretch as your arms open.",
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
  "Overhead Press": draft(
    "Hold the bar at your collarbone with your hands just outside your shoulders.",
    "Press the bar straight up, moving your head through once it passes your face.",
    "Finish with the bar over your shoulders and your arms straight.",
  ),
  "Dumbbell Shoulder Press": draft(
    "Sit with the dumbbells at your shoulders and your palms facing forward.",
    "Press them up until your arms are straight, then lower to shoulder height.",
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
  "Barbell Row": draft(
    "Hold the bar with your hands just outside your knees and lean forward from your hips.",
    "Pull the bar toward your lower ribs, then lower it until your arms are straight.",
    "Feel your upper back squeeze as the bar reaches you.",
  ),
  "Dumbbell Row": draft(
    "Rest one hand and knee on a bench and let the dumbbell hang under your shoulder.",
    "Pull your elbow back toward your hip, then lower until your arm is straight.",
    "Feel your upper back doing the pulling.",
  ),
  "Seated Cable Row": draft(
    "Sit with your feet on the platform and your knees slightly bent.",
    "Pull the handle to your stomach, then let your arms straighten slowly.",
    "Feel your shoulder blades squeeze together.",
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
  "Pull-Up": draft(
    "Hang from the bar with your hands just outside your shoulders.",
    "Pull your chest up toward the bar, then lower until your arms are straight.",
    "Think of pulling your elbows down to your pockets.",
  ),
  "Chin-Up": draft(
    "Hang from the bar with your palms facing you and your hands shoulder-width apart.",
    "Pull your chin over the bar, then lower until your arms are straight.",
  ),
  "Lat Pulldown": draft(
    "Adjust the pad so it rests snugly on your thighs and grip just outside your shoulders.",
    "Pull the bar to your upper chest, driving your elbows down.",
    "Feel your lats pulling your elbows to your sides.",
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
  "Barbell Curl": draft(
    "Stand tall with the bar at your thighs and your palms facing forward.",
    "Curl the bar toward your shoulders without swinging, keeping your elbows at your sides.",
    "Feel your biceps working, then lower the bar slowly.",
  ),
  "Hammer Curl": draft(
    "Hold the dumbbells at your sides with your palms facing each other.",
    "Curl them up without turning your wrists, then lower slowly.",
    "Feel your arms working the whole way up.",
  ),
  "Dumbbell Curl": draft(
    "Stand tall with the dumbbells at your sides and your palms forward.",
    "Curl them to your shoulders while your elbows stay by your sides.",
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
  "Tricep Pushdown": draft(
    "Stand close to the cable with your elbows pinned at your sides.",
    "Push the handle down until your arms are straight, then let it rise slowly.",
    "Feel your triceps squeeze at the bottom.",
  ),
  "Overhead Tricep Extension": draft(
    "Hold the cable behind your head with your elbows pointing forward.",
    "Straighten your arms out in front of you, then return slowly.",
    "Feel your triceps stretch as you bend your elbows.",
  ),
  "Skull Crusher": draft(
    "Lie back and hold the bar over your chest with your arms straight.",
    "Lower the bar toward your forehead by bending only your elbows, then press back up.",
    "Feel your triceps stretch at the bottom.",
  ),
  "Tricep Kickback": draft(
    "Lean forward with your upper arm held against your side.",
    "Straighten your elbow until your arm is in line with your body, then lower.",
    "Feel your triceps squeeze at the top.",
  ),
  "Lateral Raise": draft(
    "Stand tall with the dumbbells at your sides and a slight bend in your elbows.",
    "Raise your arms out to the sides until your hands reach shoulder height.",
    "Lower slowly and feel your shoulders doing the lifting.",
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
  "Leg Curl": draft(
    "Lie face down with the pad just above your heels.",
    "Curl your heels toward your glutes, then lower slowly.",
    "Feel your hamstrings squeeze at the top.",
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
  "Leg Extension": draft(
    "Adjust the seat so your knees line up with the machine's pivot.",
    "Straighten your legs until your knees are fully extended, then lower slowly.",
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
  "Standing Calf Raise": draft(
    "Stand with the balls of your feet on the edge and your shoulders under the pads.",
    "Rise as high as you can onto your toes, then lower until your heels drop below the edge.",
    "Feel a stretch in your calves at the bottom.",
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
  Plank: draft(
    "Rest on your forearms and toes with your elbows under your shoulders.",
    "Hold a straight line from your head to your heels.",
    "Squeeze your abs and glutes for the whole hold.",
  ),
  "Hanging Leg Raise": draft(
    "Hang from the bar with your arms straight.",
    "Raise your legs in front of you, then lower them without swinging.",
    "Feel your abs pulling your legs up.",
  ),
  "Ab Wheel Rollout": draft(
    "Kneel with the wheel under your shoulders.",
    "Roll forward as far as you can control, then pull back to the start.",
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
  "Face Pull": draft(
    "Set the cable at face height and pull the rope toward your face.",
    "Pull the ends apart as the rope reaches you, with your elbows high.",
    "Feel the backs of your shoulders squeeze.",
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
