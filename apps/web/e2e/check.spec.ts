import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Session E: the public Program Checker (/check). No account for the checking itself; sign-up is the
 * optional last step. Rate-limit tests live in rate-limit.spec.ts because they need their own server env.
 */

const THREE_DAY_PASTE = [
  "Push",
  "Barbell Bench Press 3x8-10",
  "Overhead Press 3x8-10",
  "",
  "Pull",
  "Barbell Row 3x8-10",
  "Pull-Up 3x6-10",
  "",
  "Legs",
  "Back Squat 3x8-10",
  "Romanian Deadlift 3x8-10",
].join("\n");

async function paste(page: Page, text: string): Promise<void> {
  await page.goto("/check");
  await page.getByLabel("Your routine").fill(text);
}

async function checkPastedProgram(page: Page): Promise<void> {
  // One gate (ARCH-066): there is no "Looks right"; "Check my program" is enabled once every question is answered.
  await page.getByRole("button", { name: "Check my program" }).click();
  await expect(page).toHaveURL(/\/check\/[A-Za-z0-9_-]+$/);
}

test("paste a routine -> confirm the reading -> assessment renders", async ({ page }) => {
  await paste(page, THREE_DAY_PASTE);

  await expect(page.getByRole("heading", { name: "Parsed as 3 days" })).toBeVisible();
  await expect(page.getByText("Day 1 (Push)")).toBeVisible();
  await expect(page.getByText("Day 3 (Legs)")).toBeVisible();
  // Nothing to answer, so checking is on straight away: there is no separate confirmation click.
  await expect(page.getByRole("button", { name: "Looks right" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check my program" })).toBeEnabled();

  await checkPastedProgram(page);
  await expect(page.getByRole("heading", { name: "Assessment" })).toBeVisible();
  await expect(page.getByText("6 exercises", { exact: false })).toBeVisible();
  await expect(page.getByText(/Fit: /).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /See evidence/ }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create account and save this program" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create account and save this program" })).toBeVisible();
});

test("the Day 1 - Push / Rest paste reads as three days, not five", async ({ page }) => {
  await paste(
    page,
    ["Day 1 - Push", "Bench 3x8", "", "Rest", "", "Day 2 - Pull", "Row 3x8", "", "Rest", "", "Day 3 - Legs", "Squat 3x8"].join("\n"),
  );
  await expect(page.getByRole("heading", { name: "Parsed as 3 days" })).toBeVisible();
  await expect(page.getByText("2 rest lines skipped.")).toBeVisible();
});

// ARCH-066. A stranger pasted a ChatGPT-formatted 5-day program and all of it was rejected. A RECONSTRUCTION of that
// paste (the literal text was not saved): bullets, "sets × reps", en-dashes, "or", parentheses, a time-based line and a
// rest day with a walking line under it. Same fixture as routineParser.test.ts.
const CHATGPT_PASTE = [
  "Day 1: Upper Body A",
  "• Barbell Bench Press: 4 sets × 6–8 reps (2 mins rest)",
  "• Lat Pulldown or Pull-Ups: 4 sets × 8–10 reps",
  "• Dumbbell Shoulder Press: 3 sets × 8–10 reps",
  "• Seated Cable Row: 3 sets × 10–12 reps",
  "• Lateral Raise: 3 sets × 12–15 reps",
  "• Tricep Pushdown: 3 sets × 10–12 reps",
  "• Dumbbell Curl: 3 sets × 10–12 reps",
  "",
  "Day 2: Lower Body A",
  "• Back Squat: 4 sets × 6–8 reps (2 mins rest)",
  "• Romanian Deadlift: 3 sets × 8–10 reps",
  "• Bulgarian Split Squats: 3 sets × 8–10 reps per leg",
  "• Leg Curl: 3 sets × 10–12 reps",
  "• Standing Calf Raise: 4 sets × 12–15 reps",
  "• Plank or Cable Crunches (Core): 3 sets × 30–45s / 12–15 reps",
  "",
  "Day 3: Rest / Active Recovery",
  "• 20–30 minutes of light walking or mobility/stretching work.",
  "",
  "Day 4: Upper Body B",
  "• Overhead Press: 4 sets × 6–8 reps",
  "• Barbell Row: 4 sets × 6–8 reps",
  "• Incline Dumbbell Press: 3 sets × 8–10 reps",
  "• Chest-Supported Row: 3 sets × 8–10 reps",
  "• Face Pull: 3 sets × 12–15 reps",
  "• Overhead Tricep Extension: 3 sets × 10–12 reps",
  "• Hammer Curl: 3 sets × 10–12 reps",
  "",
  "Day 5: Lower Body B",
  "• Deadlift (Conventional or Sumo): 3 sets × 5 reps",
  "• Leg Press: 3 sets × 10–12 reps",
  "• Hip Thrust: 3 sets × 8–10 reps",
  "• Seated Leg Curl: 3 sets × 10–12 reps",
  "• Seated Calf Raise: 4 sets × 12–15 reps",
  "• Hanging Leg Raise: 3 sets × 12–15 reps",
].join("\n");

test("a ChatGPT-formatted 5-day paste reads as 4 training days and a rest day, then checks", async ({ page }) => {
  await paste(page, CHATGPT_PASTE);

  await expect(page.getByRole("heading", { name: "Parsed 5 days (4 training, 1 rest)" })).toBeVisible();
  await expect(page.getByText("Day 1 (Upper Body A)")).toBeVisible();
  await expect(page.getByText("Day 3: Rest", { exact: true })).toBeVisible();
  await expect(page.getByText("Day 4 (Upper Body B)")).toBeVisible();
  await expect(page.getByText("Total: 26 exercises across 4 training days")).toBeVisible();
  await expect(page.getByText("1 non-exercise line skipped", { exact: false })).toBeVisible();
  // Nothing unreadable and nothing to answer: the paste is understood as typed.
  await expect(page.getByRole("heading", { name: "Could not parse" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Confirm these exercises" })).toHaveCount(0);

  // What it chose where the paste offered a choice, and the time-based line.
  await expect(page.getByText("Lat Pulldown or Pull-Ups → Lat Pulldown (confirm if you meant Pull-Up)")).toBeVisible();
  await expect(page.getByText("Deadlift (Conventional or Sumo) → Conventional Deadlift (confirm if you meant Sumo Deadlift)")).toBeVisible();
  await expect(page.getByText("Plank (time-based) → using 12–15 reps for analysis")).toBeVisible();

  // The lifter can take the other option.
  await page.getByRole("button", { name: "Use Pull-Up" }).click();
  await expect(page.getByText("Lat Pulldown or Pull-Ups → Pull-Up (confirm if you meant Lat Pulldown)")).toBeVisible();

  await checkPastedProgram(page);
  await expect(page.getByRole("heading", { name: "Assessment" })).toBeVisible();
});

// ARCH-066, second pass. The founder's real paste asked 9 questions, eight of them a library exercise with a word added.
// A RECONSTRUCTION (the literal text was not saved) carrying all 9 names; same fixture as routineParser.test.ts.
const REAL_PASTE = CHATGPT_PASTE.replace("• Dumbbell Shoulder Press:", "• Seated Dumbbell Shoulder Press:")
  .replace("• Lateral Raise:", "• Dumbbell Lateral Raises:")
  .replace("• Tricep Pushdown:", "• Tricep Rope Pushdowns:")
  .replace("• Dumbbell Curl: 3 sets × 10–12 reps", "• Barbell Bicep Curls: 3 sets × 10–12 reps")
  .replace("• Back Squat:", "• Barbell Back Squat:")
  .replace("• Leg Curl:", "• Lying Leg Curls:")
  .replace("• Overhead Press:", "• Overhead Barbell Press (OHP):")
  .replace("• Chest-Supported Row:", "• Chest-Supported T-Bar Row:")
  .replace("• Overhead Tricep Extension:", "• Dumbbell Overhead Tricep Extension:");

test("qualified names are accepted without a question; the one real choice is asked, and answering it unlocks the check", async ({ page }) => {
  await paste(page, REAL_PASTE);

  await expect(page.getByRole("heading", { name: "Parsed 5 days (4 training, 1 rest)" })).toBeVisible();
  await expect(page.getByText("Total: 26 exercises across 4 training days")).toBeVisible();
  await expect(page.getByRole("button", { name: "Looks right" })).toHaveCount(0);

  // The accepted names are shown, with what was typed beside them.
  for (const [accepted, typed] of [
    ["Dumbbell Shoulder Press 3×8-10", "Seated Dumbbell Shoulder Press"],
    ["Lateral Raise 3×12-15", "Dumbbell Lateral Raises"],
    ["Barbell Curl 3×10-12", "Barbell Bicep Curls"],
    ["Tricep Pushdown 3×10-12", "Tricep Rope Pushdowns"],
    ["Back Squat 4×6-8", "Barbell Back Squat"],
    ["Overhead Press 4×6-8", "Overhead Barbell Press (OHP)"],
    ["Overhead Tricep Extension 3×10-12", "Dumbbell Overhead Tricep Extension"],
    ["Leg Curl 3×10-12", "Lying Leg Curls"],
  ] as const) {
    // .last(): the day's own list item contains the exercise's, so take the innermost.
    await expect(page.getByRole("listitem").filter({ hasText: accepted }).filter({ hasText: `from "${typed}"` }).last()).toBeVisible();
  }

  // Exactly one question: Chest-Supported Row or T-Bar Row. No Cable Lateral Raise, no Bench Press.
  await expect(page.getByRole("heading", { name: "Confirm these exercises" })).toBeVisible();
  await expect(page.getByText(/Did you mean/)).toHaveCount(1);
  await expect(page.getByText('Did you mean "Chest-Supported Row"?', { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use T-Bar Row" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Use .*Bench/ })).toHaveCount(0);
  await expect(page.getByText(/Cable Lateral Raise/)).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Check my program" })).toBeDisabled();
  await expect(page.getByText("Answer 1 question to continue.")).toBeVisible();
  await page.getByRole("button", { name: "Use T-Bar Row" }).click();
  await expect(page.getByRole("button", { name: "Check my program" })).toBeEnabled();

  // Merge all and Edit manually are still there.
  await expect(page.getByRole("button", { name: "Merge all into one day" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit manually" })).toBeVisible();

  await checkPastedProgram(page);
  await expect(page.getByRole("heading", { name: "Assessment" })).toBeVisible();
});

test("nothing recognised says so, instead of 'Add 3 more'", async ({ page }) => {
  await paste(page, "Some notes about my week\nI train when I can");
  await expect(page.getByText("0 exercises recognized.", { exact: false })).toBeVisible();
  await expect(page.getByText("Add 3 more", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Could not parse" })).toBeVisible();
  await expect(page.getByText("no sets×reps found", { exact: false }).first()).toBeVisible();
});

test("pick PPL 6-day -> assessment renders", async ({ page }) => {
  await page.goto("/check");
  await page.getByRole("tab", { name: "Pick a common split" }).click();
  await expect(page.getByRole("link", { name: /3-day full body/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Upper\/Lower 4-day/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Bro split 5-day/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Beginner 2-day/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Home dumbbells 3-day/ })).toBeVisible();
  await page.getByRole("link", { name: /PPL 6-day/ }).click();

  await expect(page).toHaveURL(/\/check\/[A-Za-z0-9_-]+$/);
  await expect(page.getByText("6 days, 30 exercises")).toBeVisible();
  await expect(page.getByText(/Fit: /).first()).toBeVisible();
  // ARCH-071: the table is the one count per muscle, so no balance lines on /check.
  await expect(page.locator("[data-muscle-volume]")).toBeVisible();
  await expect(page.getByText("Cross-muscle balance")).toHaveCount(0);
});

// ARCH-068. When most muscles are trained once a week, a note says so, tied to the program's volume. It is a note, not
// a finding: the sections below it are the assessment's own.
test.describe("program observation (ARCH-068)", () => {
  const BRO_SPLIT = ["Chest", "Bench 4x8", "Incline Dumbbell Press 3x8", "", "Back", "Row 4x8", "", "Legs", "Squat 4x8"].join("\n");

  test("a bro split shows the once-a-week note under the Fit line, before the assessment's sections", async ({ page }) => {
    await paste(page, BRO_SPLIT);
    await checkPastedProgram(page);
    await expect(page.getByText(/Fit: /).first()).toBeVisible();

    const note = page.getByRole("complementary", { name: "Program observation" });
    await expect(note).toBeVisible();
    await expect(note).toHaveAttribute("data-program-observation", "UNDER_FLOOR");
    await expect(note).toContainText(
      "Every muscle you train is trained once a week. Your total is 15 sets, under the general floor — for volume specifically, the fix is to add a second training day rather than cram more sets into your current days.",
    );

    // Between the Fit line and the first section of the assessment.
    const y = async (loc: ReturnType<Page["locator"]>) => (await loc.first().boundingBox())!.y;
    const noteY = await y(note);
    expect(noteY).toBeGreaterThan(await y(page.getByText(/Fit: /)));
    expect(noteY).toBeLessThan(await y(page.getByRole("heading", { name: /Attention areas|Biggest Opportunity/ })));
    const strengths = page.getByRole("heading", { name: "Strengths" });
    if ((await strengths.count()) > 0) expect(noteY).toBeLessThan(await y(strengths));
  });

  // ARCH-071: the headline is the whole week being under the floor, not whichever muscle ties it.
  test("the bro split's summary line and Biggest Opportunity say whole-program volume, not hinge", async ({ page }) => {
    await paste(page, BRO_SPLIT);
    await checkPastedProgram(page);
    await expect(page.getByText(/Biggest opportunity: Whole-program volume\./)).toBeVisible();
    const headline = page.locator("section", { has: page.getByRole("heading", { name: "Biggest Opportunity" }) });
    await expect(headline).toContainText("Whole-program volume");
    await expect(headline).not.toContainText("Hinge");
    // Hinge is still reported, as an attention area.
    const attention = page.locator("section", { has: page.getByRole("heading", { name: "Attention areas" }) });
    await expect(attention).toContainText("Hinge");
  });

  test("the Actions agree with the note: a training day, not sets on the days listed", async ({ page }) => {
    await paste(page, BRO_SPLIT);
    await checkPastedProgram(page);
    await expect(page.getByRole("complementary", { name: "Program observation" })).toContainText("add a second training day");
    const actions = page.locator("section", { has: page.getByRole("heading", { name: "Actions" }) });
    await expect(actions).toContainText(/Add a training day: 3 sets of .* That brings the week to \d+(\.\d+)? hard sets, a start toward the general floor of 40\. A second day like it brings the week to \d+/);
    // The old whole-program sentences are gone: no "Or, on N days a week", no sets added to Chest/Back/Legs for volume.
    await expect(actions).not.toContainText("Or, on");
  });

  test("it is not a finding: it is not counted among the things to look at, and not in Actions", async ({ page }) => {
    await paste(page, BRO_SPLIT);
    await checkPastedProgram(page);
    const note = page.getByRole("complementary", { name: "Program observation" });
    await expect(note).toBeVisible();
    await expect(page.locator("section", { hasText: /^Actions/ }).getByText(/trained once a week/)).toHaveCount(0);
    await expect(page.locator("[data-program-observation]")).toHaveCount(1);
  });

  test("a balanced program (the ChatGPT 5-day) and a 3-day PPL run on 6 days show no note", async ({ page }) => {
    await paste(page, CHATGPT_PASTE);
    await checkPastedProgram(page);
    await expect(page.getByText(/Fit: /).first()).toBeVisible();
    await expect(page.locator("[data-program-observation]")).toHaveCount(0);

    await paste(page, THREE_DAY_PASTE);
    await page.getByLabel("How many days a week do you train?").selectOption("6");
    await page.getByRole("button", { name: "Check my program" }).click();
    await expect(page.getByText(/Fit: /).first()).toBeVisible();
    await expect(page.locator("[data-program-observation]")).toHaveCount(0);
  });

  test("at 375px the note fits and is readable", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await paste(page, BRO_SPLIT);
    await checkPastedProgram(page);
    const note = page.getByRole("complementary", { name: "Program observation" });
    await expect(note).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    if (process.env.CHECK_SHOTS) await page.screenshot({ path: `${process.env.CHECK_SHOTS}/observation-375.png`, fullPage: true });
    const size = await note.locator("p").last().evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(size)).toBeGreaterThanOrEqual(15);
  });
});

// ARCH-067 / Fix 5. Spreadsheet-style "1a." labels are not part of the exercise names, and are not questions.
test("'1a.' list labels are stripped: 3 exercises, no questions", async ({ page }) => {
  await paste(page, "1a. Barbell Row 3x10\n1b. Lat Pulldown 3x10\n2. Seated Row 3x10");
  await expect(page.getByText("Total: 3 exercises across 1 training day")).toBeVisible();
  await expect(page.getByText("Barbell Row 3×10")).toBeVisible();
  // The reading (not the box the lifter typed in) carries no label.
  await expect(page.locator("ol")).not.toContainText("1a.");
  await expect(page.getByRole("heading", { name: "Confirm these exercises" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check my program" })).toBeEnabled();
});

// ARCH-067 / Fix 2. A stranger sees what an assessment looks like before pasting anything.
test("the landing shows a labelled, non-interactive example of an assessment above the paste box", async ({ page }) => {
  await page.goto("/check");
  const example = page.getByRole("region", { name: "Here's what an assessment looks like:" });
  await expect(example).toBeVisible();
  await expect(example.getByText("Example", { exact: true })).toBeVisible();
  await expect(example.getByText("Weekly volume · Chest")).toBeVisible();
  await expect(example.getByText("Adequate", { exact: true })).toBeVisible();
  await expect(example.getByText("14 hard sets / week")).toBeVisible();
  await expect(example.getByText("6 of 6 main movement patterns")).toBeVisible();
  await expect(example.getByText("You press 12 hard sets a week and pull 10 hard sets a week (1.2 to 1).")).toBeVisible();
  await expect(example.locator("a, button, input, select, textarea")).toHaveCount(0);
  // Above the paste box, not below it.
  const above = await example.boundingBox();
  const box = await page.getByLabel("Your routine").boundingBox();
  expect(above!.y + above!.height).toBeLessThanOrEqual(box!.y);
  // It is an example, so it is not on the other tab and not on a result.
  await page.getByRole("tab", { name: "Pick a common split" }).click();
  await expect(page.getByRole("region", { name: "Here's what an assessment looks like:" })).toHaveCount(0);
});

// ARCH-067. The checker used to read one week as the days pasted, so a 3-day PPL run twice a week was called
// under-dosed at half its real volume. The lifter now says how many days a week they train.
const EIGHT_EXERCISE_PPL = [
  THREE_DAY_PASTE.replace("Romanian Deadlift 3x8-10", "Romanian Deadlift 3x8-10\nLeg Curl 3x10-12").replace(
    "Pull-Up 3x6-10",
    "Pull-Up 3x6-10\nDumbbell Curl 3x10-12",
  ),
].join("\n");

test.describe("days a week (ARCH-067)", () => {
  test("defaults to the days parsed; a 3-day PPL (24 sets) is under-dosed, and run on 6 days it is not", async ({ page }) => {
    await paste(page, EIGHT_EXERCISE_PPL);
    const days = page.getByLabel("How many days a week do you train?");
    await expect(days).toHaveValue("3");

    // As pasted: the link carries no days, and the 24-set week is under the floor.
    await checkPastedProgram(page);
    await expect(page).not.toHaveURL(/\?d=/);
    await expect(page.getByText(/Under-dosed/).first()).toBeVisible();
    await expect(page.getByText(/24 hard sets/).first()).toBeVisible();
    await expect(page.getByText(/Run your 3 days twice a week/).first()).toBeVisible();

    // Same program, trained on 6 days: the engine reads the 3 days twice (48 hard sets).
    await paste(page, EIGHT_EXERCISE_PPL);
    await days.selectOption("6");
    await page.getByRole("button", { name: "Check my program" }).click();
    await expect(page).toHaveURL(/\/check\/[A-Za-z0-9_-]+\?d=6$/);
    await expect(page.getByText("3 days listed, assessed as 6 days a week")).toBeVisible();
    await expect(page.getByText(/Fit: /).first()).toBeVisible();
    await expect(page.getByText(/Under-dosed/)).toHaveCount(0);
    await expect(page.getByText(/Run your 3 days twice a week/)).toHaveCount(0);
  });

  test("the choice resets when a different routine is pasted", async ({ page }) => {
    await paste(page, EIGHT_EXERCISE_PPL);
    const days = page.getByLabel("How many days a week do you train?");
    await days.selectOption("6");
    await page.getByLabel("Your routine").fill(THREE_DAY_PASTE.replace(/\n\nLegs[^]*$/, ""));
    await expect(page.getByRole("heading", { name: "Parsed as 2 days" })).toBeVisible();
    await expect(days).toHaveValue("2");
  });

  test("a split can be run on a different number of days: the link carries it, and a plain click does not", async ({ page }) => {
    await page.goto("/check");
    await page.getByRole("tab", { name: "Pick a common split" }).click();
    const days = page.getByLabel("How many days a week do you train?");
    await expect(days).toHaveValue("");
    await days.selectOption("6");
    await page.getByRole("link", { name: /3-day full body/ }).click();
    await expect(page).toHaveURL(/\/check\/[A-Za-z0-9_-]+\?d=6$/);
    await expect(page.getByText("3 days listed, assessed as 6 days a week")).toBeVisible();

    await page.goto("/check");
    await page.getByRole("tab", { name: "Pick a common split" }).click();
    await page.getByRole("link", { name: /3-day full body/ }).click();
    await expect(page).toHaveURL(/\/check\/[A-Za-z0-9_-]+$/);
    await expect(page.getByText(/listed, assessed as/)).toHaveCount(0);
  });

  test("a stray ?d= is ignored", async ({ page }) => {
    await paste(page, EIGHT_EXERCISE_PPL);
    await checkPastedProgram(page);
    const url = page.url();
    await page.goto(`${url}?d=99`);
    await expect(page.getByText(/Fit: /).first()).toBeVisible();
    await expect(page.getByText(/listed, assessed as/)).toHaveCount(0);
  });
});

test("an unmatched exercise shows the confirmation step and blocks checking until answered", async ({ page }) => {
  // AUDIT TRAIL (ARCH-065 / Fix 5a): this used a bare "Bench 3x8" as the line that needs an answer. A bare Bench,
  // Squat, Row or Deadlift is now accepted as the standard barbell lift, so the real choice here is "Curl" (barbell,
  // dumbbell or cable). What the test guards is unchanged: a line that needs an answer shows the confirmation step and
  // blocks checking until it is answered, and the answer replaces the typed name.
  await paste(page, ["Curl 3x8", "Back Squat 3x8", "Barbell Row 3x8", "Zottman Spin 3x8"].join("\n"));

  await expect(page.getByRole("heading", { name: "Confirm these exercises" })).toBeVisible();
  await expect(page.getByText('Line 1: "Curl 3x8". Did you mean "Dumbbell Curl"?')).toBeVisible();
  await expect(page.getByText(/Line 4: "Zottman Spin 3x8". No exercise in the library matches\./)).toBeVisible();

  await expect(page.getByRole("button", { name: "Check my program" })).toBeDisabled();
  await expect(page.getByText("Answer 2 questions to continue.")).toBeVisible();

  await page.getByRole("button", { name: "Yes" }).click();
  await page.getByRole("button", { name: "Remove line" }).click();
  await expect(page.getByRole("heading", { name: "Confirm these exercises" })).toHaveCount(0);
  await expect(page.getByText("Dumbbell Curl 3×8")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check my program" })).toBeEnabled();
});

// ARCH-065 / Fix 5a. The two audit programs: the obvious lifts are accepted (and shown by name), and the one real
// choice is asked about with the right default (Incline is a press on a chest day, not a curl).
test("bare Bench, Squat and Row need no answer; Incline defaults to a press", async ({ page }) => {
  await paste(page, ["Chest", "Bench 4x8", "Incline 3x8", "", "Back", "Row 4x8", "", "Legs", "Squat 4x8"].join("\n"));
  await expect(page.getByText("Barbell Bench Press 4×8")).toBeVisible();
  await expect(page.getByText("Back Squat 4×8")).toBeVisible();
  await expect(page.getByText('Line 3: "Incline 3x8". Did you mean "Incline Dumbbell Press"?')).toBeVisible();
  await expect(page.getByText(/Did you mean "Barbell Bench Press"/)).toHaveCount(0);
  await expect(page.getByText(/Did you mean "Incline Curl"/)).toHaveCount(0);
});

test("'Choose different' opens the exercise picker", async ({ page }) => {
  await paste(page, ["Zottman Spin 3x8", "Back Squat 3x8", "Barbell Row 3x8", "Pull-Up 3x8"].join("\n"));
  await page.getByRole("button", { name: "Choose different" }).click();
  await page.getByLabel("Choose an exercise").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add exercise" }).click();
  await expect(page.getByRole("heading", { name: "Confirm these exercises" })).toHaveCount(0);
});

test("lines with no readable sets and reps are listed and can be deleted", async ({ page }) => {
  await paste(page, ["Back Squat 3x8", "Barbell Row 3x8", "Pull-Up 3x8", "keep it easy this week"].join("\n"));
  await expect(page.getByRole("heading", { name: "Could not parse" })).toBeVisible();
  await expect(page.getByText("Line 4: keep it easy this week")).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "Could not parse" })).toHaveCount(0);
});

test("blank-line sections of one exercise are merged, with a way to undo", async ({ page }) => {
  await paste(page, "Barbell Bench Press 3x8\n\nBarbell Row 3x8\n\nBack Squat 3x8");
  await expect(page.getByRole("heading", { name: "Parsed as 1 day" })).toBeVisible();
  await page.getByRole("button", { name: "They are separate days" }).click();
  await expect(page.getByRole("heading", { name: "Parsed as 3 days" })).toBeVisible();
});

test("'Merge all into one day' collapses the reading", async ({ page }) => {
  await paste(page, THREE_DAY_PASTE);
  await page.getByRole("button", { name: "Merge all into one day" }).click();
  await expect(page.getByRole("heading", { name: "Parsed as 1 day" })).toBeVisible();
});

test("/check/about renders the limits and links back to /check", async ({ page }) => {
  await page.goto("/check/about");
  await expect(page.getByRole("heading", { name: "About the Program Checker" })).toBeVisible();
  // ARCH-067 / Fix 4: what was tested, in numbers a reader can check; no claim that coaches reviewed the analysis.
  await expect(page.getByText("Tested against 24 sample programs.", { exact: false })).toBeVisible();
  await expect(page.getByText("21 match our prediction of what a strength coach would say", { exact: false })).toBeVisible();
  await expect(page.getByText("3 are documented exceptions awaiting real coach input", { exact: false })).toBeVisible();
  await expect(page.getByText("Real coach review is ongoing.", { exact: false })).toBeVisible();
  await expect(page.getByText("The engine's thresholds are provisional", { exact: false })).toBeVisible();
  const about = await page.locator("main").innerText();
  expect(about).not.toMatch(/reviewed by 5 coaches|signed them off|not human-validated/i);
  // No address to write to yet, so no link that pretends there is one.
  await expect(page.locator("main a[href^='mailto:']")).toHaveCount(0);
  await expect(page.getByText("If any exercise causes pain, stop and consult a professional.")).toBeVisible();
  await page.getByRole("link", { name: "Continue to the checker →" }).click();
  await expect(page).toHaveURL(/\/check$/);
  await expect(page.getByRole("heading", { name: "Program Checker", level: 1 })).toBeVisible();
});

test("the landing page links to the checker", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Or check a program you already have →" }).click();
  await expect(page).toHaveURL(/\/check$/);
});

// ARCH-069 / ARCH-071. Cross-muscle balance counts direct sets only while the finding cards and the table credit synergists
// ("arms get none" beside triceps 3.5; hamstrings 9 beside 12), so /check does not show it at all: the table is the one count.
test.describe("what /check shows when nothing is flagged (ARCH-069)", () => {
  const BRO_SPLIT = ["Chest", "Bench 4x8", "Incline Dumbbell Press 3x8", "", "Back", "Row 4x8", "", "Legs", "Squat 4x8"].join("\n");

  test("a program with findings shows no cross-muscle balance, and no tracking block", async ({ page }) => {
    await paste(page, BRO_SPLIT);
    await checkPastedProgram(page);
    await expect(page.getByText(/Fit: /).first()).toBeVisible();
    await expect(page.getByText(/to look at/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cross-muscle balance" })).toHaveCount(0);
    await expect(page.locator("[data-cross-muscle-balance]")).toHaveCount(0);
    await expect(page.getByText("Your program looks solid", { exact: false })).toHaveCount(0);
    // The generic sign-up block, unchanged.
    await expect(page.getByRole("button", { name: "Create account and save this program" })).toBeVisible();
  });

  test("a program with nothing flagged shows what tracking would give, and no balance lines", async ({ page }) => {
    await paste(page, CHATGPT_PASTE);
    await checkPastedProgram(page);
    await expect(page.getByText("Nothing flagged")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cross-muscle balance" })).toHaveCount(0);

    const block = page.getByRole("region", { name: "Your program looks solid. Here's what tracking would give you:" });
    await expect(block).toBeVisible();
    await expect(block.getByRole("listitem")).toHaveCount(3);
    await expect(block).toContainText("From a lift's second session on, a target weight and reps");
    await expect(block).toContainText("first top set next to your latest");
    await expect(block).toContainText("After 3 sessions of a lift, a trend");
    // A promise the app cannot keep is not made: no fixed 4-week review, and no "is it working" verdict.
    await expect(block).not.toContainText(/4 weeks|four weeks|working|no guessing/i);
    await expect(block.getByRole("button", { name: "Create account and try it" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account and save this program" })).toHaveCount(0);
  });

  test("the tracking block's button still carries the program to sign-up", async ({ page }) => {
    await paste(page, CHATGPT_PASTE);
    await checkPastedProgram(page);
    await page.getByRole("button", { name: "Create account and try it" }).click();
    await expect(page).toHaveURL(/\/signup\?from=check&n=\d+$/);
  });

  test("at 375px the block fits and its button is a full-size target", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await paste(page, CHATGPT_PASTE);
    await checkPastedProgram(page);
    const block = page.getByRole("region", { name: /Here's what tracking would give you/ });
    await block.scrollIntoViewIfNeeded();
    if (process.env.CHECK_SHOTS) await page.screenshot({ path: `${process.env.CHECK_SHOTS}/tracking-375.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const box = await block.getByRole("button", { name: "Create account and try it" }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(43.5);
  });

  test("'provisional' appears once on the result (the banner) and once on About; nowhere else on /check", async ({ page }) => {
    const count = async () => ((await page.locator("body").innerText()).match(/provisional/gi) ?? []).length;
    await page.goto("/check");
    expect(await count()).toBe(0);
    await paste(page, THREE_DAY_PASTE);
    expect(await count()).toBe(0);
    await checkPastedProgram(page);
    await expect(page.getByText(/Fit: /).first()).toBeVisible();
    expect(await count()).toBe(1);
    await page.goto("/check/about");
    expect(await count()).toBe(1);
  });
});

// ARCH-070. Every muscle the engine counted, one line each. Before this a muscle that was fine at 6-9 sets appeared nowhere,
// and readers asked whether it had been counted.
test.describe("weekly sets per muscle (ARCH-070)", () => {
  const MUSCLES = ["Chest", "Lats", "Upper back", "Side delts", "Rear delts", "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Calves"];
  const BRO_SPLIT = ["Chest", "Bench 4x8", "Incline Dumbbell Press 3x8", "", "Back", "Row 4x8", "", "Legs", "Squat 4x8"].join("\n");
  const rows = (page: Page) => page.locator("[data-muscle-volume] tbody tr");

  test("a flawed program lists all 11 muscles, the untrained ones at 0, and agrees with its finding cards", async ({ page }) => {
    await paste(page, BRO_SPLIT);
    await checkPastedProgram(page);
    const table = page.locator("[data-muscle-volume]");
    await expect(table.getByRole("heading", { name: "Weekly sets per muscle" })).toBeVisible();
    await expect(rows(page)).toHaveCount(11);
    expect(await rows(page).locator("th").allInnerTexts()).toEqual(MUSCLES);
    for (const muscle of ["hamstrings", "calves", "side delts"]) {
      const row = page.locator(`[data-muscle-volume] tr[data-muscle="${muscle}"]`);
      await expect(row.locator("td").first()).toHaveText("0");
      await expect(row).toHaveAttribute("data-band", "Low");
    }
    // One number per muscle: the whole-program card says triceps 3.5, and so does the table.
    await expect(page.getByText(/triceps 3\.5/)).toBeVisible();
    await expect(page.locator('[data-muscle-volume] tr[data-muscle="triceps"] td').first()).toHaveText("3.5");
    await expect(table.getByText(/of 11 muscles are in the 6–20 range\./)).toBeVisible();
    // The per-muscle volume cards are not repeated.
    await expect(page.getByText("Weekly volume · ", { exact: false })).toHaveCount(0);
    await expect(table).not.toContainText("balance lines");
  });

  test("a program with nothing flagged lists every muscle, including the ones that were never mentioned before", async ({ page }) => {
    await paste(page, CHATGPT_PASTE);
    await checkPastedProgram(page);
    await expect(page.getByText("Nothing flagged")).toBeVisible();
    await expect(rows(page)).toHaveCount(11);
    for (const muscle of ["chest", "side delts", "rear delts", "upper back", "calves"]) {
      const row = page.locator(`[data-muscle-volume] tr[data-muscle="${muscle}"]`);
      await expect(row).toBeVisible();
      expect(Number(await row.locator("td").first().innerText())).toBeGreaterThan(0);
    }
    // No volume card repeats what the table says; the strengths that remain, and their count, are what is shown.
    await expect(page.getByText("Weekly volume · ", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Strengths" })).toBeVisible();
    // What remains under Strengths is the movement-pattern card, not a muscle.
    const strengths = page.locator("section", { has: page.getByRole("heading", { name: "Strengths" }) });
    await expect(strengths).toContainText("Exercise selection");
    await expect(page.getByText(/^1 strength · Nothing flagged/)).toBeVisible();
  });

  test("one count per muscle: a STRONG program shows no balance sentence that disagrees with the table", async ({ page }) => {
    await paste(page, CHATGPT_PASTE);
    await checkPastedProgram(page);
    const hamstrings = (await page.locator('[data-muscle-volume] tr[data-muscle="hamstrings"] td').first().innerText()).trim();
    expect(Number(hamstrings)).toBeGreaterThan(0);
    // The old balance sentences ("Your quads get 10 ... your hamstrings get 9", "Your arms get 12 ...") are not on the page.
    await expect(page.locator("[data-cross-muscle-balance]")).toHaveCount(0);
    await expect(page.getByText(/Your (quads|arms) get /)).toHaveCount(0);
    await expect(page.getByText(/You press \d+(\.\d+)? hard sets a week and pull/)).toHaveCount(0);
    // And no footnote about a second counting method, because there is no second count.
    await expect(page.locator("[data-muscle-volume]")).not.toContainText("balance lines");
  });

  test("at 375px the table fits, the numbers are readable and it follows the actions", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await paste(page, BRO_SPLIT);
    await checkPastedProgram(page);
    const table = page.locator("[data-muscle-volume]");
    await table.scrollIntoViewIfNeeded();
    if (process.env.CHECK_SHOTS) await page.screenshot({ path: `${process.env.CHECK_SHOTS}/muscles-375.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const y = async (loc: ReturnType<Page["locator"]>) => (await loc.first().boundingBox())!.y;
    expect(await y(table)).toBeGreaterThan(await y(page.getByRole("heading", { name: "Actions" })));
    const size = await rows(page).first().locator("td").first().evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(size)).toBeGreaterThanOrEqual(15);
  });
});

test("a bad hash is a 404", async ({ page }) => {
  const response = await page.goto("/check/not-a-program");
  expect(response?.status()).toBe(404);
});

test.describe("sign-up handoff", () => {
  // Sign-up, bcrypt and first-compile of /app on a cold dev server run well past the 30s default.
  test.describe.configure({ timeout: 90_000 });

  async function signUp(page: Page): Promise<void> {
    await page.getByLabel("Email").fill(`check-${crypto.randomUUID()}@example.test`);
    await page.getByLabel("Password (min 8 characters)").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Create account" }).click();
  }

  test("signup with a pending program -> banner -> Save opens the Builder on the draft", async ({ page }) => {
    await page.goto("/check");
    await page.getByRole("tab", { name: "Pick a common split" }).click();
    await page.getByRole("link", { name: /Beginner 2-day/ }).click();
    await page.getByRole("button", { name: "Create account and save this program" }).click();
    await expect(page).toHaveURL(/\/signup\?from=check&n=\d+$/);
    // ARCH-067 / Fix 3: what the account is, before the form. The count is the checked program's own.
    await expect(page.getByRole("heading", { name: /^Save your \d+-exercise program\.$/ })).toBeVisible();
    await expect(page.getByText("Free to use, no credit card, export anytime.", { exact: false })).toBeVisible();
    await expect(page.getByText("Get a target weight and reps for every lift, every session")).toBeVisible();
    await expect(page.getByText("See your progress — charts, personal records, first-vs-now")).toBeVisible();
    await expect(page.getByText("Adjust your program as you go, without starting over")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in →" })).toHaveAttribute("href", "/login");

    await signUp(page);
    await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
    await expect(page.getByText("You checked a program before signing up.")).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page).toHaveURL(/\/app\/programs\/[^/]+\/build$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Overall" })).toBeVisible({ timeout: 30_000 });
  });

  test("the sign-up page says what the account is, and words its heading for what the visitor brought", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Create your account." })).toBeVisible();
    await expect(page.getByText("Track your training in one place.", { exact: false })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Adjust your program as you go" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in →" })).toBeVisible();

    await page.goto("/signup?from=check&n=26");
    await expect(page.getByRole("heading", { name: "Save your 26-exercise program." })).toBeVisible();
    await page.goto("/signup?from=check");
    await expect(page.getByRole("heading", { name: "Save your program." })).toBeVisible();
    // A count that is not a plausible number of exercises is ignored, not printed.
    for (const n of ["0", "9999", "abc", "26<script>"]) {
      await page.goto(`/signup?from=check&n=${encodeURIComponent(n)}`);
      await expect(page.getByRole("heading", { name: "Save your program." })).toBeVisible();
    }
  });

  test("the result's sign-up button says it is free", async ({ page }) => {
    await page.goto("/check");
    await page.getByRole("tab", { name: "Pick a common split" }).click();
    await page.getByRole("link", { name: /Beginner 2-day/ }).click();
    await expect(page.getByText("Free — save your program and check it again after edits.")).toBeVisible();
  });

  test("Discard forgets the pending program", async ({ page }) => {
    await page.goto("/check");
    await page.getByRole("tab", { name: "Pick a common split" }).click();
    await page.getByRole("link", { name: /Beginner 2-day/ }).click();
    await page.getByRole("button", { name: "Create account and save this program" }).click();
    await signUp(page);
    await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByText("You checked a program before signing up.")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("You checked a program before signing up.")).toHaveCount(0);
  });

  test("without sessionStorage the program rides the URL and comes back as ?import=1", async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new Error("storage blocked");
      };
    });
    await page.goto("/check");
    await page.getByRole("tab", { name: "Pick a common split" }).click();
    await page.getByRole("link", { name: /Beginner 2-day/ }).click();
    await page.getByRole("button", { name: "Create account and save this program" }).click();
    await expect(page).toHaveURL(/\/signup\?from=check&h=/);

    await signUp(page);
    await expect(page).toHaveURL(/\/check\/[A-Za-z0-9_-]+\?import=1$/, { timeout: 30_000 });
    await page.getByRole("button", { name: "Save this program", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/programs\/[^/]+\/build$/, { timeout: 30_000 });
  });

  test("?import=1 shows no save button to someone who is not signed in", async ({ page }) => {
    await page.goto("/check");
    await page.getByRole("tab", { name: "Pick a common split" }).click();
    await page.getByRole("link", { name: /Beginner 2-day/ }).click();
    await expect(page).toHaveURL(/\/check\/[A-Za-z0-9_-]+$/);
    await page.goto(`${page.url()}?import=1`);
    await expect(page.getByText(/Fit: /).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Save this program", exact: true })).toHaveCount(0);
  });
});

test.describe("375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  /** No horizontal scroll, and every visible control is at least 44px (43.5 allows for sub-pixel rounding). */
  async function expectPhoneFit(page: Page, where: string): Promise<void> {
    await page.waitForLoadState("networkidle");
    if (process.env.CHECK_SHOTS) {
      await page.screenshot({ path: `${process.env.CHECK_SHOTS}/${where.replace(/[^a-z0-9]+/gi, "-")}.png`, fullPage: true });
    }
    const report = await page.evaluate(() => {
      const vw = window.innerWidth;
      const small: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("a, button, input, select, textarea, summary"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
        if (r.width < 43.5 || r.height < 43.5) small.push(`${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return { scrollWidth: document.documentElement.scrollWidth, vw, small };
    });
    expect(report.scrollWidth, `${where}: horizontal scroll`).toBeLessThanOrEqual(report.vw);
    expect(report.small, `${where}: controls under 44px`).toEqual([]);
  }

  test("/check, /check/[hash] and /check/about fit a phone", async ({ page }) => {
    await page.goto("/check");
    await expectPhoneFit(page, "check empty");

    await page.getByLabel("Your routine").fill(`${THREE_DAY_PASTE}\nZottman Spin 3x8\nkeep it easy`);
    await expect(page.getByRole("heading", { name: "Confirm these exercises" })).toBeVisible();
    await expectPhoneFit(page, "check reading");

    // ARCH-066: the longest reading there is (rest day, notes with "Use ..." buttons) on a phone.
    await page.getByLabel("Your routine").fill(CHATGPT_PASTE);
    await expect(page.getByRole("heading", { name: "Parsed 5 days (4 training, 1 rest)" })).toBeVisible();
    await expectPhoneFit(page, "check chatgpt reading");

    await page.getByRole("tab", { name: "Pick a common split" }).click();
    await expectPhoneFit(page, "check presets");

    await page.getByRole("link", { name: /PPL 6-day/ }).click();
    await expect(page.getByText(/Fit: /).first()).toBeVisible();
    await expectPhoneFit(page, "check result");

    await page.goto("/check/about");
    await expectPhoneFit(page, "check about");

    await page.goto("/signup?from=check&n=26");
    await expect(page.getByRole("heading", { name: "Save your 26-exercise program." })).toBeVisible();
    await expectPhoneFit(page, "signup from check");
  });

  test("the example does not push the paste box off a phone screen", async ({ page }) => {
    await page.goto("/check");
    await expect(page.getByRole("region", { name: "Here's what an assessment looks like:" })).toBeVisible();
    const box = await page.getByLabel("Your routine").boundingBox();
    // The 812px viewport shows the top of the box and the room to start typing.
    expect(box!.y).toBeLessThan(812 - 150);
    await expectPhoneFit(page, "check example");
  });
});

test("no critical or serious accessibility violations on the three public pages", async ({ page }) => {
  async function scan(where: string): Promise<void> {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(blocking.map((v) => `${where}: ${v.id} (${v.nodes.length})`)).toEqual([]);
  }

  await page.goto("/check");
  await page.getByLabel("Your routine").fill(`${THREE_DAY_PASTE}\nZottman Spin 3x8`);
  await expect(page.getByRole("heading", { name: "Confirm these exercises" })).toBeVisible();
  await scan("/check");

  await page.getByRole("tab", { name: "Pick a common split" }).click();
  await page.getByRole("link", { name: /PPL 6-day/ }).click();
  await expect(page.getByText(/Fit: /).first()).toBeVisible();
  await scan("/check/[hash]");

  // ARCH-068: a result that carries the once-a-week note (muted italic text on white).
  await paste(page, ["Chest", "Bench 4x8", "Incline Dumbbell Press 3x8", "", "Back", "Row 4x8", "", "Legs", "Squat 4x8"].join("\n"));
  await checkPastedProgram(page);
  await expect(page.getByRole("complementary", { name: "Program observation" })).toBeVisible();
  await scan("/check/[hash] with the program observation");
  await expect(page.locator("[data-muscle-volume]")).toBeVisible();
  await scan("/check/[hash] with the weekly sets table");

  await page.goto("/check/about");
  await scan("/check/about");
});
