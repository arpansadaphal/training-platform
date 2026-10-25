# Product-depth audit: what it takes for this app to feel like a trainer

## Context

You asked for an inspection, audit and plan, with no code. The strategy (22 Oct) is taken as settled: the segment, pricing, horizon and phases. This document is about craft: what the app has to *feel* like to earn that strategy.

**What I did**
- Read PROJECT_STATE, the Freeze reference, ARCH-059/060/061, the 22 Oct strategy, and both lazy-lifter reports (recovered from earlier session transcripts).
- Walked the app at 375×812 on the dev server that was already running locally (branch `phase-a3a1-session-ux`) as a brand-new user. The path was signup → create program → Builder → commit → 7 sessions with rising weights → Progress → Review → Block Report → Coach → Constraints.
- Timed every flow and read the code behind the slow ones.

**What I could not do, and why**
- **Production timing.** The obvious URL for the Vercel project (`training-platform-web.vercel.app`) serves an unrelated site (an AI course called "Breazely"), and the real URL isn't in the repo. I threw away the numbers I took there. Every production figure below is a projection and is labeled as one.
- **The real Coach.** The running dev server uses the e2e mock model (`MODEL_PROVIDER=mock MOCK_SCENARIO=coach-regression`). Its reply to "am I getting stronger?" was the scripted "add a workout day" proposal. I didn't hold that against the Coach. Instead I read what the real Coach is given (§2).
- **A closed-block Block Report.** That needs a second commit. I read the page code and used the earlier diagnostic instead.
- **Real phones, real keyboards, gym signal, and real time passing.** All 7 sessions happened in one afternoon, so durations read "0m" and the block reads "0 weeks in".

**Left behind (no code or tracked files changed)**
- A local test user, `audit.novice.1792921699743@example.com`, in `training_platform_dev`: 1 program, 7 completed sessions, 1 in progress, 1 mock Coach chat.
- Screenshots in `/private/tmp/claude-501/-Users-arpan-Documents-code-training-platform/ac688107-c6f0-48a4-b851-69679cd02930/scratchpad/`.
- An untracked `.playwright-mcp/` folder in the repo root, created by the browser tool. It's safe to delete.

**The one-paragraph verdict.** The app now logs reliably and shows progress honestly; the Progress screen is genuinely good. But it still behaves like a *program checker with a logger attached*, not like a trainer. A trainer's core weekly act is telling you what to lift next, and the app never does it. After six sessions every plan line still says "20 kg", the Builder default, while the user is lifting 47.5 kg. Review then reports that progress as a "systematic deviation: LOAD ABOVE PLAN". The novice's first assessment, of an empty program, reads "NEEDS WORK · 22 things to look at". Fixing those few things moves the app further toward the founder's bar than any new surface would.

---

## 1. What a trainer actually does, function by function

A good trainer for a committed novice does four jobs: decides the plan, moves the numbers, watches you, and expects you. The table is honest about which of those an app can do.

| Function | What a good trainer does | Can the app? | How much, and what's missing | If not, instead |
|---|---|---|---|---|
| **Programming** | Picks a plan that fits your days, time, equipment and goal, and keeps it stable | **Yes** | ~80% with human-written templates chosen by visible rules (ARCH-059). **Today ~10%:** the novice must build their own, on a Builder that breaks at phone width, and is graded for it. | — |
| **Progression** | Says "add 2.5 kg today" or "stay, you missed reps"; deloads; resets after a stall | **Yes** | ~75%. Double progression (fill the rep range, then add load) is a fixed rule trainers use with novices anyway. **Today 0%:** targets never move, and beating them is flagged as a deviation. | — |
| **Session management** | Warm-up, order, rest timing, pacing | **Yes** | ~80%: a rest timer, a warm-up line for the first big lift, pacing. **Today ~30%:** a session clock only; no rest timer, no warm-up. | — |
| **Measuring "is it working"** | Compares you with last month | **Yes, better than most trainers** | ~85%. The Progress verdict exists. Missing: a 4-week roll-up that says what to do about it. | — |
| **Memory** | Remembers your weights, your knee, your preferences | **Yes, better than any trainer** | ~95% possible. Today it shows the last top set. Missing: your own notes coming back ("last Legs day: left knee felt off"). | — |
| **Knowledge transfer** | Explains why this exercise and why 8–12 reps | **Yes** | ~70%. The engine and evidence panel are a real asset, but they speak to program designers. Missing: one plain "why" per program and per exercise, where the novice is when they wonder. | — |
| **Goal clarification** | Asks what you actually want; resets unrealistic hopes | **Partially** | ~60% via onboarding questions. Expectation-setting must stay inside invariant 9: ranges of what evidence shows, never promises. | — |
| **Teaching the movement** | Shows the setup and the path, cues the first reps | **Partially** | ~45%. Two pictures, a setup line and a movement line get a novice to "I'm doing the right exercise". Today: nothing; the Exercise model has only name, pattern and equipment. | — |
| **Effort calibration** | Watches bar speed: "that was too easy, go heavier" | **Partially** | ~60%. Self-reported reps-in-reserve plus rep performance ("you hit 12 on all three sets at 'Hard'") is a decent proxy. It's also what makes the progression rule trustworthy. | — |
| **Adapting to life** | "You look wrecked, we'll go lighter"; hotel gym; 30 minutes today | **Partially** | ~50%, and only when you tell it: a comeback day after a gap, a short-session version, swaps. Today: day picker, skip, and a "welcome back" line. | — |
| **Motivation** | "Nice rep!" and celebrating PRs | **Partially** | ~50%. Facts are motivating (PRs, first-vs-now). In-the-moment human energy is not replicable. | — |
| **Emotional support** | "A stall in week 5 is normal; you're not failing" | **Partially** | ~40%: pre-written lines triggered by facts (a stall, a missed week, week-1 soreness). It can't listen. | — |
| **Accountability** | A person waiting for you at 6pm, paid in advance | **Partially, the weakest** | ~35%: reminders you set (ARCH-060), "this week: 1 of 3", an honest "last trained 9 days ago". The social obligation can't be built, and the Freeze rightly forbids faking it. | For the cohort: the founder texting people by hand. |
| **Form correction** | Sees your knees cave and cues it live | **No** | ~5%. The app can't see you. Pretending would break trust and invariant 10. | Self-check prompts ("film one set from the side; compare with the picture"), machine variants for unsure novices, and an honest referral: "new to barbell lifts? one or two sessions with a coach is worth it". |
| **Injury recognition** | Spots a bad movement pattern; adjusts | **No, and must not** | 0% by design (invariant 10). | A "this hurt" flag on a set: stop that exercise for today, offer an alternative, show "see a professional". It never interprets. |
| **Nutrition basics** | "Eat more protein; you're under-eating" | **Out of scope** | The Freeze excludes nutrition, and MacroFactor/MyFitnessPal own it. | Defer. At most, later, one static evidence-tagged card. Not in this plan. |

### Which functions a committed novice needs most

The intuitive answer is form, and for this user it's wrong. Someone 3–18 months in, mostly on machines, cables and dumbbells, has roughly fine form. Their failure modes, which the diagnostics and the strategy both point to, are these:

1. **"What do I do next week?"** They program-hop because nothing tells them the current plan is working. → *programming + progression*
2. **"What weight today?"** They repeat the same weight for months, or guess. → *progression*
3. **"Is this working?"** Without an answer they quit at week 4–6. → *measurement*
4. **"I missed a week."** Shame and fear of failing their old weights. → *adapting to life + accountability*
5. **"How do I do this one?"** This applies only to exercises they haven't done before. → *teaching the movement*

So the priority order is **progression > programming > measurement > adapting to life > session guidance > accountability > form**. A trainer's eyes matter most in a lifter's first month and for barbell lifts. A trainer's *brain* matters every single session.

### If the app did 5 functions at 70%, which 5, and would that beat a $100/month trainer?

**The five:** programming, progression, measurement, session guidance (movement teaching + effort + rest), and adapting to life.

**Would it beat the trainer for a committed novice? Yes for outcomes, no for the relationship.** Unless the trainer is there for every session, most of a novice's training happens alone. That's exactly where the app is present, and where trainers are weakest: many don't track loads rigorously, forget last week's numbers, and don't review data month to month. The app would beat that trainer on consistency of progression, memory, evidence, availability and price. It would still lose on three things: watching you move, the social obligation to show up, and noticing what you didn't say. For someone whose problem is *knowing what to do and whether it's working*, which is the committed novice's problem, that trade wins. For someone whose problem is showing up at all, or learning a barbell squat from zero, it doesn't.

---

## 2. UI/UX audit at 375px

### Scores per screen (1 = poor, 5 = excellent)

Speed is local, measured on a **dev server** (slower than production builds). Production is discussed in §3.

| Screen | Clarity | Density | Feedback | Recover | Voice | Speed (local) | Note |
|---|---|---|---|---|---|---|---|
| Landing (logged out) | 2 | 3 | – | – | Manifesto | static | "Design training programs you can actually reason about": written for program designers. The only CTA is a 19px underlined link. |
| Signup | 4 | 4 | 3 | 4 | Form | 1.5s to dashboard | 16px inputs, 44px button. Fine. |
| `/app` empty | 3 | 3 | – | – | Spec | fast | "Get it analyzed transparently against a stated goal…" |
| `/app` populated | 3 | 2 | 3 | – | Stat sheet | TTFB 70–230ms | "1 VERSIONS COMMITTED", "0 weeks in", a "Review block" button on an empty block, and nothing about today. "Where you stand" is good. |
| Programs / program page | 2 | 3 | 3 | 4 | Git | fast | "Drafts", "Versions", "Commit a draft". Archive is as big as Save (it does confirm now). |
| Builder | **1** | **1** | 2 | 3 | Robot | save 1.3s | Page is 496px wide at 375px; the page slides sideways on "Add exercise". 29px inputs at 13.6px font (iOS zooms on focus). The assessment only refreshes on Save. |
| Session, before Start | 4 | 3 | 4 | **2** | Neutral | TTFB ~330ms | Clean. Bare exercise names: no sets, targets or time estimate. "Skip session" is one tap, with no confirm and no undo. |
| Session, mid-workout | 3 | 2 | 3 | 4 | Form | log 80–230ms | Logging works and edit/delete work. One exercise fits above the fold. No pictures, cues or rest timer. |
| Post-workout summary | 4 | 3 | 4 | – | Generic coach | 140–320ms | The honest "sets the baseline" line is good. "Solid session." every time. Primary button is "Log another session". |
| Review | **2** | **1** | 3 | 4 | Engine | TTFB ~130ms | 9,534px tall (~12 screens). Opens with "engine 0.4.0 · thresholds 0.0.1-unvalidated" and the program critique. Calls progress a deviation. |
| Block Report | 2 | 2 | – | – | Engine | not measured | (from code) Counts, deviations, the full design critique again. No per-lift progress at all. |
| Progress | **4** | **4** | 4 | – | Plain, good | TTFB ~180ms | The best screen. Clean charts, plain verdicts ("Up 19% over your last 4 sessions"). |
| Coach | 2 | 3 | ? | 3 | — | n/a (mock) | **Verified in code: the real Coach is given the program, analysis, assessment, constraints and chat, but no logged sets and no progress.** It can't answer "am I getting stronger?" or "what should I squat?". The input is 14.4px (iOS zoom). |
| Constraints | 2 | 4 | 3 | 4 | Spec | fast | "Durable guidance that shapes your program design and every future assessment." 14.4px inputs. |

**Form vs coach.** Every screen on the *training* side (session, summary, progress) has started to sound like a coach. Every screen on the *program* side (Builder, Review, Block Report, program page, Coach, Constraints) still sounds like the engine talking to an engineer. The novice lives on the training side. The program side keeps leaking into it through the dashboard tiles, the Review link and the first-run Builder.

**Moments of delight I found:** "Last: 47.5 kg × 10 (25 Oct)" on the session screen. "Same as last 47.5 kg" pinned at the top of the weight picker. The summary's "This is your first logged session of this day, so it sets the baseline." The unlogged-exercise prompt on Mark complete. Inputs that keep their values for the next set. The Progress accordion. These are the voice to copy everywhere.

### The top 20 small things (ranked by how likely each is to cost a user)

1. **An empty tap logs a junk set.** Tapping "Log one set" with nothing entered logged "Set 1: reps not recorded @ RPE 8", with no weight, and it counted as 1 of 3. It's one accidental thumb away on every exercise.
2. **The reps box shows a grey "12" that looks filled in.** The placeholder is the top of the range, and it reads as a value. That's how #1 happens.
3. **The plan weight never moves.** After six sessions the plan line still reads "3 × 8-12 @ RPE 8 (2 RIR) · 20 kg" while "Last: 47.5 kg × 10" sits under it. (The real fix is Project 1; the small fix is to stop showing a stale default as the plan.)
4. **Review calls progress a deviation.** "Systematic deviations: Back Squat, LOAD ABOVE PLAN, 12 of 12 sets. Plan: 20 kg · Logged: 40 kg." Every lift is listed. The user did exactly what a trainer wants, and the app frames it as not following the plan.
5. **"Planned so far: 0 · Completed: 7".** `plannedSessions = floor(days/7 × training days)`, so anyone who trains in their first week sees zero planned. Real users will see this in week 1, not only test users.
6. **An empty draft gets a failing grade.** With zero exercises: "Provisional fit: NEEDS WORK · 1 strength · 22 things to look at". The "strength" is "Progression & effort: Sound" for a program with nothing in it. It's followed by 22 cards and 22 actions. This is the novice's first contact with the engine.
7. **A sensible novice program still reads NEEDS WORK · 17 things.** Six exercises, two full-body days. Calves, rear delts and side delts are all "Low". (This matters for templates; see §7, Project 3.)
8. **No "Start training" after Commit.** "Committed as version 1. It is now the version you train." Then nothing; the next step is a tab the user has to find.
9. **Three taps to start, through a page that adds nothing.** Dashboard "Start next session" → `/train` "Start training" → session "Start session".
10. **"Skip session" is one tap, with no confirm and no undo.** It's a red button directly under the exercise list on the pre-start screen. It permanently marks the day skipped and advances the rotation.
11. **Finished exercises don't fold away.** "All 3 sets logged." stays full-size, and the next exercise is below the fold. Mid-workout, the user scrolls past finished work every time.
12. **"Log 3 remaining sets" stamps every set at the same second.** It shows "(0m 00s since last)", so batch logging makes the rest-time data meaningless.
13. **The summary's main button is "Log another session".** The user just finished. The action they want is "Done", plus "next session is Full Body B".
14. **Summary numbers that mislead.** "4 / 9 sets logged" as a headline tile reads like a failing grade. Muscles appear with fractional sets ("Front delts 0.5"). "+225%" volume appears when compared with a half-logged previous session.
15. **"Solid session." opens every full session.** After a while it reads as canned. The facts (PR count, first time, back after a gap) should lead instead.
16. **Two effort scales on one line.** "@ RPE 8 (2 RIR)" sits in the plan line while the picker says "Hard — 2-3 reps left". A novice has to learn two acronyms to read one exercise.
17. **The dashboard is a stat sheet.** Its tiles read "1 VERSIONS COMMITTED", "0 weeks in", "0 sessions completed in this block." with a "Review block" button. After a workout it looks the same as before it, apart from the counters. Nothing says what's next.
18. **Review leads with the engine.** "Assessment at commit time · engine 0.4.0 · thresholds 0.0.1-unvalidated", then about 12 screens of critique. The user's progress (all lifts up 7–19%) appears nowhere on Review or Block Report, and the Coach sits at the very bottom.
19. **The Builder at phone width.** Already known and deferred to A3c, but it's the *only* path to a program until templates exist. The page is 496px wide and slides sideways on "Add exercise". Inputs are 29px with 13.6px text (iOS zoom). The copy says "Select a draft on the left" with nothing on the left. The assessment doesn't refresh until Save.
20. **No app icon or manifest, and the favicon 404s.** "Add to Home Screen", the strategy's phone-first answer, produces a generic icon. Delete uses a native `confirm()` dialog, which looks like a system error on iOS.

Smaller, not in the 20: Coach and Constraints inputs at 14.4px (iOS zoom); chart ticks like "43.8" and "1,313"; "Est. 1RM" unexplained; the session title wraps to two lines ("My first program — Full Body A"); exercise names aren't headings (screen readers); hydration warnings on signup and Coach in dev.

---

## 3. Performance audit

### 3.1 Measured, locally (dev server, warm, 375px, my machine)

| Flow | Measured | Network calls |
|---|---|---|
| `/app` load | TTFB 68–231ms, first paint 180–508ms, load 520–858ms, 16KB HTML | RSC (server-side) |
| `/app/progress` load | TTFB 179ms, load 568ms | RSC |
| Session page load | TTFB ~330ms | RSC |
| Log a set (tap → set visible) | 82–231ms across 18 sets (server 23–139ms) | 1 `performance.logSet` |
| Log remaining sets (batch) | 72–169ms | 1 `performance.logBatch` |
| Mark complete → summary visible | 141–318ms warm (1,127ms on first compile) | `session.markCompleted`, then RSC render |
| Builder Save → assessment updated | ~1.3s to settle | `draft.updateStructure` (169ms), **then** `analysis.previewAnalyze` (79ms), in sequence |
| Signup → dashboard | ~1.5s | server action + redirect |

The A3a.1 diagnostic measured a *production build* against local Postgres two days ago and found 25–60ms TTFB, 57ms per set, and 100ms to the summary. **Locally, nothing is slow.** The slowness you feel on production comes from how many *dependent* database round trips each flow makes, multiplied by the distance to the database.

### 3.2 Where the time goes (verified in code)

| Flow | DB calls | Longest dependent chain | Cause |
|---|---|---|---|
| Session page | 22 | **15** | `getSessionContext` awaits 6–7 reads in sequence (session → block → version → program → all 110 exercises → block sessions). The page then runs `getLastTimeHints`, **which calls `getSessionContext` again**, and loads the exercise list 3 times. |
| `/app` | 14 | 9 | `getIdentitySummary`: 11 calls in 9 steps, repeating `Session.count` and `TrainingBlock.findFirst`. |
| Log a set | 5 | 5 | 3 ownership/lookup reads (`TrainingBlock.findUnique` twice) before one insert. |
| Complete → summary | 3 + 13 | 3 + 9 | `getSessionSummary` runs 3 separate `PerformanceRecord.findMany` calls. |
| `/app/progress` | 2 | 1 | One full-history read; it grows with sets logged. That's fine for a year of data. |

**Indexes.** None is missing in a way that matters at this scale. `ExercisePrescription.exerciseId` and `PerformanceRecord.prescriptionId` have no index; add them when history grows. **Caching.** The 110-exercise list is static reference data, but it is reloaded several times per request. **Parallelism.** Most of the chained reads don't depend on each other.

### 3.3 What probably happens in production (projection, not measured)

Two facts from the repo:
- There's no `vercel.json`, so functions run in Vercel's default region, Washington D.C. (`iad1`), unless the project settings were changed.
- The Neon host in `.env.local`'s commented production line is `ap-southeast-1` (Singapore).

If both hold, every database round trip crosses the Pacific, typically around 200–230ms. Then:

| Flow | Chain | Projected added wait |
|---|---|---|
| Session page | 15 | **~3.0–3.5s** |
| Complete → summary | 12 | ~2.5s |
| `/app` | 9 | ~2s |
| Log a set | 5 | **~1.0–1.2s** per set |

Add cold starts on top: a Vercel cold start carrying the 15MB Prisma engine (often a second or more), and Neon's autosuspend wake-up (around a second after idle). A user in India also pays the hop from the nearest edge to Washington before any of this starts.

### 3.4 The three questions

**Which would make a paying user cancel?**
- **Log a set at about a second, every set.** That's 20–30 times a workout, against Hevy and Strong, which feel instant. The strategy says the free logger is the real competitor.
- **The session page at about 3 seconds.** Phones lock between sets, and mobile Safari may reload a backgrounded tab, so this could hit repeatedly mid-workout (risk, unverified).
- `/app` at ~2s once a day, and the summary at ~2.5s after a workout, are irritating but survivable.

**Cold-start only (fixable by tier or settings):** the Vercel cold start, and Neon autosuspend (a setting on paid plans, or a keep-warm ping). Neither is the main problem if the region mismatch is real.

**Code-level, under a day each:**
- Put the functions in the database's region. This is a config line; verify it by checking that `x-vercel-id` shows `::sin1::`.
- Optimistic set logging, plus a 2-call write path.
- Dedupe and parallelize the session page and `/app` loads, and cache the exercise list.
- Run the Builder's save and analyze in one round trip.

**To verify first (about 15 minutes, by you):** open Vercel → Settings → Functions → Region; confirm `DATABASE_URL` is the `-pooler` host; check Neon's autosuspend setting; time the session page on your phone.

---

## 4. The 5-star experience, four moments

### Monday morning, before the session

**Should feel:** "I know exactly what to do today, and it's a step up from last time."

**Should see (one screen, one tap):**
> **Today: Full Body A · about 45 min**
> Squat **50 kg** × 8–12 (last time 47.5 × 10 on every set, so you earned the jump)
> Bench 35 kg × 8–12 · Lat pulldown 40 kg × 8–12
> [ Start ]

After 9 days away, the first line changes instead: "Welcome back. Today runs about 10% lighter on purpose."

**Today:** "Hi, Audit Novice · CURRENT PROGRAM · My first program · Version 1 active · Start next session · 7 SESSIONS COMPLETED · 58 SETS LOGGED · 1 VERSIONS COMMITTED". Then three taps, and every target reads 20 kg.

**Gap:** no "today", no targets, and a counter sheet where a plan should be. **Closed by:** Project 1 (targets + Today) and UX fix 10.

### An hour after the session

**Should feel:** "That counted. It's recorded, I'm moving, and I know what's next."

**Should see:** the dashboard has changed. "Done: Full Body A. Squat 47.5 kg × 10, a new best (40 kg four sessions ago)." Then "Next: Full Body B on Thursday. Overhead press: try 25 kg." The summary is one tap away.

**Today:** the dashboard is identical to the morning apart from +1 on the counters. The summary can't be reached from the dashboard.

**Gap:** the app forgets the session as soon as you leave the summary. **Closed by:** Project 1 (the Today card has an after-session state) and Project 4 (journal).

### Week 4, 12 sessions

**Should feel:** "This is working, and I understand why." Or, just as valuable: "This lift stalled; that's normal, and here's the plan."

**Should see:** a check-in. "4 weeks · 11 of 12 sessions." Then every main lift, first vs now, in kg. Then one stalled lift with a plain reason and the response ("Overhead press: same weight for 3 sessions. Normal for a small lift. Next block drops to 22.5 kg and builds back."). Then "Your next 4 weeks".

**Today:**
- Review opens with the commit-time critique ("NEEDS WORK · 17 things to look at").
- Then "0 planned so far", and every progression listed as "LOAD ABOVE PLAN".
- Progress has per-lift verdicts but no roll-up.
- Block Report repeats the critique and shows no lift progress at all.

**Gap:** the largest one. The paid moment the strategy is built on doesn't exist, and the screen that *does* exist at week 4 grades the program instead of the person. **Closed by:** UX fix 10 now (Review leads with progress). Hand-written check-ins for the cohort in weeks 4–6. The automated check-in in Phase 2, designed from those hand-written ones.

### Week 12

**Should feel:** "I've become someone who trains. This is *my* record."

**Should see:** a journal of 36 sessions that reads like a training diary, not a table. Your first squat here (40 kg × 10, 25 Oct) next to today's. Three check-ins. Facts that showed up once along the way ("your 25th session", "first time squatting 60 kg"). Your own notes. An export button.

**Today:** version history in git terms ("Version 3 · Manual commit"), block reports that are program critiques, charts, and no narrative.

**Gap:** nothing accumulates *as yours*. **Closed by:** Project 4.

**The design, in one sentence:** the app should open to *what you're doing today*, close every session with *what changed and what's next*, and keep *a record that grows more valuable the longer you keep it*. Everything about the program (versions, the engine, the grade) moves backstage, one tap away for anyone who wants it.

---

## 5. Cues and illustrations

### 5.1 What a cue can honestly teach

| Cue type | Example | Useful for a novice? | Why |
|---|---|---|---|
| **Setup** | "Seat height: handles at mid-chest." "Feet under the bar, shoulder width." | **Most useful** | Concrete, checkable without anyone watching, and it removes "am I even set up right?" |
| **Range of motion** | "Lower until the bar touches your chest. Same depth every rep." | **Very useful** | Consistent range is what makes your logged numbers comparable week to week. Without it, "progress" can just be shorter reps. |
| **Effort** | "Stop when you have 2–3 good reps left. If the last rep moved as fast as the first, go heavier next set." | **The most important one** | It teaches what "Hard" means, and the progression rule (Project 1) depends on honest effort ratings. Shared across exercises, not repeated per card. |
| **Attention (external)** | "Push the floor away." "Drive your elbows down to your pockets." | Useful on big lifts | Evidence suggests external focus helps performance on compound lifts. |
| **Attention ("feel it")** | "Feel your chest stretch at the bottom." | Useful on isolation and machines | One small trial suggests "focus on the muscle" may help growth on isolation lifts. Mark it as low certainty. |
| **Tempo** | "Two seconds down, no bounce." | Moderately useful | Consistency more than magic. |
| **Form correction** | "Keep your back straight." "Don't let your knees cave." | **Mostly noise, sometimes harmful** | A novice can't perceive their own back angle mid-rep. The cue implies the app knows something it doesn't, and it drifts toward safety claims (invariant 10). In my judgment, most generic cue lists in fitness apps are this genre. I haven't measured that. |

**The cue philosophy (the rules):**
1. **At most two lines per exercise:** one setup line and one movement-and-range line. Add a "feel it" line only for isolation and machine moves.
2. **Effort is taught once per session, not per exercise.** It's the same sentence everywhere, in the same words as the effort picker.
3. **Only things a person can check alone.** If checking a cue needs a mirror or a coach, don't write it.
4. **Never phrased as a warning.** No "avoid injury", "safe", "prevent" or "pain" (they're already on the copy lint). A pain flag redirects; it never explains.
5. **Cues fade as you learn.** They're fully shown the first two times you do an exercise, then shrink to one line, then hide behind "How to". The app stops cueing what you've learned, like a good trainer, and that fading is itself a felt sign of competence.

### 5.2 What a GIF teaches that two stills don't

| Teaches | 2 stills (start, end) | Motion loop |
|---|---|---|
| Starting position and setup | ✅ | ✅ |
| End position and range of motion | ✅ | ✅ |
| The path between them (bar path, hips and knees moving together) | ❌ | ✅, and this is the skill in free-weight compound lifts |
| Tempo | ❌ | ✅ (only if the loop is filmed at a deliberate tempo) |
| Whether *you* are doing it safely | ❌ | ❌. Neither can see you. |
| What it should feel like | ❌ | ❌ |

On a machine, the machine defines the path, so two stills teach nearly everything. On a barbell squat, RDL or row, the path *is* the skill, and motion earns its bytes. Two WebP stills are about 15–30KB each. A 3-second looped muted video is about 100–300KB. An animated GIF of the same clip is several times larger, so if motion ships, ship short video, not GIF. (These sizes are estimates.)

### 5.3 The minimum set

- **Two stills plus two cue lines for every exercise in the starter templates**, about 35 according to the strategy, not all 110. Builder users can live without pictures for niche exercises.
- **Short motion loops for about 8 free-weight compounds** (squat, RDL, deadlift, bench, overhead press, barbell row, lunge, hip thrust), and only if warm users still ask "how do I do this?" after seeing the stills.
- **Sourcing is on the critical path.** Your hard rule is no charging until the illustrations are properly sourced, and the free-exercise-db images' provenance is unverified. Commission or license the ~35 template exercises in one consistent style. Start that in week 1; its lead time, not engineering, sets when Phase 2 can charge.

---

## 6. What makes "investing in myself" real

**What creates the feeling**
- **A record that grows more valuable the longer you keep it.** Like a journal or a savings account, the value compounds, and it's *yours*.
- **Visible competence.** Numbers going up, exercises you no longer need cues for.
- **Being known.** The app remembers your weights, your notes and your week, without being asked.
- **Your past self as the only comparison.**
- **A plan that fits your life,** with a reason you can read.
- **Respect for your time.** Fast, few taps, no nagging.
- **Honesty.** It tells you when something stalled. Hype feels like a sales pitch; honesty feels like a serious tool you're right to use.

**What breaks it**
- **Being graded.** "NEEDS WORK" on day one says the app is judging you, not working for you.
- **Being told you deviated when you progressed.**
- **Doing the app's job:** remembering weights, designing programs.
- **Gamification.** Streaks and badges say the app wants your attention, not your progress.
- **Engineering vocabulary.** Version, commit, block, "engine 0.4.0" say the tool is for someone else.
- **Canned copy** ("Solid session." every time).
- **Slowness in the gym, and anything that looks like lost data.**

**Design moves, with Freeze fit**

| Move | What it is | Freeze |
|---|---|---|
| **"The app remembers" Today card** | Opens on today's session with targets taken from your last session, and "back after 9 days" when true. Facts only. | ✅ |
| **Your own notes come back** | If last Legs day you wrote "left knee felt off", next Legs day shows "Your note from last time: …" above squats. It echoes your words and never interprets them. | ✅ Invariant 10 holds because the app never interprets. |
| **Training journal** | Every session is an entry: date, day, duration, top sets, PRs in words, your note. Reverse chronological, styled like a diary. | ✅ It's a page, not the home screen (that's a non-goal). |
| **First vs now** | On each lift: "Your first squat here: 40 kg × 10 (25 Oct). Now: 55 kg × 10." | ✅ |
| **Facts, not badges** | Shown once, inline, in the summary: "Your 10th session." "First time squatting 60 kg." No badge cabinet, no counting of consecutive days. | ✅ "You've trained 4 weeks" is a fact. "4 weeks in a row, don't break it" is a streak and stays out. |
| **Cues that fade** | §5.1 rule 5. The felt signal is "I know this one now". | ✅ |
| **"Your data is yours"** | Export (CSV) from the journal, plus one plain line: "Everything you log is yours, and you can download it any time." The strategy already lists export as free forever. | ✅ |
| **Ownership words** | "Your program" not "Version 1 active"; "edit history" not "versions"; "weeks 1–4" not "block"; "save and use" not "commit". | ✅ Copy only. |

---

## 7. The 6-week plan

### 7.1 The app at week 6

A committed novice answers six questions in under two minutes, without an account. They see "Full Body Foundation: 3 days, about 50 minutes", with three plain reasons it fits them, and they sign up and add it to their home screen.

Session 1 is "find your starting weights": start light, answer "how many more could you have done?" after each set, and the app suggests the next set's weight.

From then on, opening the app on a training day shows today's session with a target for every lift. Each exercise has two pictures and two lines; the first time they meet an exercise the cues are expanded, and by the third time they're gone. Logging a set is one tap that never waits on the network. A rest timer starts by itself, and finished exercises fold away.

After the session: "Squat: new best. Next time, 52.5 kg." The journal grows by one entry, and their own notes come back to them on the right day.

At week 4, the founder sends each cohort member a hand-written check-in built from the same data.

**What they tell a friend:** "It tells me exactly what to lift every session, and it's been right. My squat's up 15 kg in a month, and I didn't have to think about it."

### 7.2 Before anything: three performance fixes

1. **Put the functions next to the database.** Check the Vercel function region. If it isn't Singapore (`sin1`) while Neon is in `ap-southeast-1`, move it; it's one config line. While there, confirm the pooled connection string and Neon's autosuspend. Verify with the `x-vercel-id` header. *Hours.* If the region hypothesis is right, this alone removes most of the slowness you feel.
2. **Make logging a set instant.** Show the set the moment it's tapped, save in the background, and retry when gym signal drops (with a visible "saving…/saved"). Cut the server write path from 5 dependent calls to 2. *Under a day.* This removes the in-gym cancel risk whatever the network does.
3. **Shorten the page-load chains.** Session page 15 → 4 or fewer (one query for session, block, version and program; stop computing the context twice; cache the exercise list). `/app` 9 → 3 or fewer. Summary 13 calls → about 4. *About a day.*

### 7.3 The four projects

#### Project 1: "It tells you what to lift" (next-session targets + Today)

- **What it is**
  - A fixed, visible progression rule computed from your logs: double progression. Fill the top of the rep range on every set at the planned effort, and the next session adds one load step (by equipment). Miss the bottom of the range, and you hold. Miss twice, and the weight drops about 10%.
  - Session 1 bootstraps targets ("find your starting weights").
  - A comeback rule: after 10 or more days off, the next session runs about 10% lighter.
  - The dashboard opens on a Today card with the targets and one tap to the session.
  - The weight picker opens centered on the target. It still doesn't select it; you tap.
- **Why it matters for "investing in myself":** it's the single most trainer-like act, and it turns the log from something you feed into something that feeds you back. It also fixes a lot by itself: the stale 20 kg plan line, "LOAD ABOVE PLAN", the picker centered on 20 kg, the 3-tap start, and the identical-looking dashboard after a workout.
- **Cost:** one phase, about 3–5 days with tests. Plus a decision record (ARCH-062: the rule, the load steps per equipment, the comeback rule, and how the picker relates to the Phase 6 no-prefill rule, which you already relaxed for effort).
- **Unlocks:** the 4-week check-in's "next 4 weeks" (Phase 2), the automatic next block (Phase 3), and trustworthy verdicts, because effort ratings now matter to the user.
- **Freeze:**
  - Invariant 1 holds: the rule is deterministic and lives in the engine layer.
  - Invariant 3 holds: targets are computed when the page is read; no ProgramVersion changes.
  - Invariant 9: copy says "target" and "try", never "will".
  - The no-prefill rule needs the decision record above.

#### Project 2: "A coach at your elbow" (session screen as guidance)

- **What it is**
  - Each exercise card gets two stills (tap to toggle), a setup line and a movement/range line, all fading with exposure (§5).
  - One shared effort explainer, in the same words as the picker.
  - A rest timer that starts on each log: a visual countdown with longer defaults for big lifts.
  - Finished exercises collapse, and the next one scrolls into view.
  - A "this hurt" flag on a set that suggests stopping that exercise today and seeing a professional.
  - Content covers the template exercises only.
- **Why it matters:** this is where the founder's "cues and GIFs" belong. It makes the first session with a new exercise feel supervised, and the fifth feel like mastery.
- **Cost:** one phase of engineering, about 3–4 days. Content: about 35 × 2 cue lines (drafted, then rewritten by you, about 2 days). Illustrations: licensed or commissioned (the lead time and budget are the real constraint; the A3b estimate was $5–15 per exercise). It ships in stages: cues and the rest timer first, pictures when sourced.
- **Unlocks:** the "how do I do this" objection; first-session confidence; your hard rule on properly sourced assets, which gates Phase 2 revenue.
- **Freeze:** invariant 10 (no form or injury claims; the copy lint extended to cues). The illustrations hard rule. No streak-like exposure counters shown to the user.

#### Project 3: "A program chosen for you" (onboarding + starter templates)

- **What it is**
  - Six questions, one per screen, before signup.
  - A visible rule table picks one of 6–8 human-written templates.
  - A preview shows the week and three plain "why this fits you" lines with evidence tiers.
  - Sign up to save it. Templates open in the Builder for anyone who wants to edit.
- **Why it matters:** a novice who is handed an empty Builder, which is broken at phone width, and then graded "NEEDS WORK" can't feel that they're investing in anything. A plan with their days and their equipment in it is the first "this is mine".
- **Cost:** one phase of engineering, about 5 days. Content: about 1–2 weeks of your time to write templates; book the external reviewer now (a Phase 2 gate for charging, not for warm users).
- **The risk to resolve first:** run your draft templates through the engine *before* building onboarding. My sensible 6-exercise test program scored "NEEDS WORK · 17 things" because calves, rear delts and side delts read "Low" against bands written for trained lifters. If good novice templates fail your own engine, the problem is the profile, not the template.
  - Until the external review settles it, template users should see the template's reasons and strengths, with the full assessment one tap away. They shouldn't see a grade on their first screen.
  - That's presentation only: no thresholds change, and the evidence stays visible, so it isn't opaque scoring.
- **Unlocks:** the strategy's whole funnel, the Program Checker later, and Builder phone work becoming unnecessary for novices.
- **Freeze:** **requires accepting ARCH-059.** "AI-generated programs" stays a non-goal (rules plus human templates). Assessment stays Hypertrophy-only. The goal question should not offer "strength" as if a strength profile existed. Either drop it from v1, or label it as a rep-range preference.

#### Project 4: "Your training record" (journal, first-vs-now, notes that come back, export)

- **What it is**
  - A journal page: each session an entry with date, day, duration, top sets, PRs in words, and your note.
  - "First vs now" on each Progress lift.
  - Your last note on an exercise or day shown the next time you train it.
  - Facts-as-milestones, shown once inline in the summary.
  - CSV export.
- **Why it matters:** it's the compounding asset in "invest in myself", and it gives the week-4 hand-written check-ins, and later the automated one, a home.
- **Cost:** one PR, about 2–3 days. All the data already exists.
- **Unlocks:** the check-in page (Phase 2), the shareable progress card (Phase 4), and a reason to open the app on rest days that isn't a streak.
- **Freeze:** no streaks and no consecutive-day counts; facts only; not the home screen. This is pulled forward from the strategy's Phase 3 ("your lifting story") because it's cheap and it's the emotional payoff of Projects 1–3.

### 7.4 The ten small UX fixes that ship alongside

These are chosen because they're independent of the projects. They're one batch PR, about 1–2 days.

1. A set needs reps before it can be logged (weight can be bodyweight). This closes the empty-tap junk set.
2. The reps placeholder shows the range ("8–12"), not "12".
3. Review and Block Report stop counting "load above plan" as a deviation, and "planned so far" counts the training days actually due (no more "0 planned" in week 1).
4. After Commit, show a primary "Start your first session" button.
5. An empty draft shows an empty state ("Add your first day to see an assessment"), not "NEEDS WORK · 22 things".
6. Summary:
   - The primary button becomes "Done", with the next session named.
   - Hide muscles under one set.
   - Don't show a % change against a session that was only partly logged.
   - Lead with the facts instead of "Solid session.".
7. Finished exercise cards collapse to one line, and the next card scrolls into view.
8. Undo instead of dead ends: "Skip session" and "Delete set" both act at once and show an inline Undo for a few seconds. That replaces Skip having no confirm, and Delete using a native `confirm()`.
9. One effort language everywhere. The plan line reads "3 sets × 8–12 · stop with 2–3 reps left" instead of "@ RPE 8 (2 RIR)".
10. The dashboard and Review lead with the person.
    - **Dashboard:** remove "versions committed", "0 weeks in" and the Review button on an empty block; show "This week: 1 of 2 sessions".
    - **Review:** open with what you did (lift verdicts, sessions), move the commit-time critique into a collapsed section, and put engine and threshold version strings behind "Details".

Also cheap, if there's room: app icon, manifest and favicon (home-screen install); 16px inputs on Coach and Constraints.

### 7.5 Sequence

| Week | Engineering | Content and ops (you) |
|---|---|---|
| 1 | Perf fixes 1–3 · UX batch | Accept or reject ARCH-059; write the progression rule (ARCH-062); start illustration sourcing; draft templates; start the 15-person concierge cohort (strategy §8) |
| 1–2 | **Project 1** (targets + Today) | Run draft templates through the engine; resolve the grade-display question |
| 2–4 | **Project 2** (cues + rest timer first, pictures when sourced) | Rewrite about 35 × 2 cue lines; book the external reviewer |
| 3–5 | **Project 3** (onboarding + templates) | Finalize 6–8 templates |
| 5–6 | **Project 4** (record) | Write week-4 check-ins by hand for the cohort; they become the Phase 2 spec |
| After each project | Re-run the lazy-lifter diagnostic at 375px | Five user conversations a week |

### 7.6 What this plan does not include, and why

1. **Payments and the day-28 paywall.** That's Phase 2, and your own hard rule blocks charging until the illustrations are properly sourced.
2. **An automated 4-week check-in.** Write them by hand for the cohort first. The automated version should be designed from what people actually responded to.
3. **Reminders and the weekly email (ARCH-060).** That needs email or push infrastructure and the decision. Text the cohort yourself for now. Phase 3, if accepted.
4. **Any Coach work, and the Coach should come off the novice path.** It can't see a single logged set, so it can't answer the two questions novices ask most, and its main button changes your program. That's the opposite of what someone on a vetted template should do. Keep it reachable for Builder users. Its next step is "explain my check-in" in Phase 3.
5. **Builder phone rework (A3c).** Templates take the Builder off the novice path. Don't invest in the segment you've deprioritized.
6. **Mid-session exercise swap.** That's Phase 3. Today's workaround (skip the exercise and leave it unlogged) is acceptable for six weeks.
7. **Motion for all 110 exercises, or pictures for non-template exercises.** These are the most expensive and the least needed.
8. **Engine or threshold changes, and a strength profile.** That's scientific input you don't have yet. The only change here is presentational: not leading template users with a grade.
9. **Nutrition, social, streaks, AI-generated programs, a native app.** These are Freeze non-goals or out of scope, and none beats the four projects for paying, returning or telling a friend.

### 7.7 How you'll know it worked

- **Speed (production, on your phone):**
  - Tapping a set shows it in under 300ms every time.
  - The session page is usable in under 1s warm.
  - The function region shows `sin1`.
- **Project 1:**
  - 70% or more of logged sets land within the target (the strategy's own metric).
  - Most sessions start from the Today card.
- **Project 2:**
  - The picture or cues are opened in 40% or more of first sessions with an exercise (the strategy metric).
  - No "this hurt" flag goes unredirected.
- **Project 3:**
  - 70% or more finish the questions.
  - 55% or more log session 1 within 7 days.
  - 10% or fewer switch programs in week 1 (all strategy gates).
- **Project 4:** journal visits on rest days.
- **Overall:** at least 5 of the 15-person cohort are still training at week 4 (the strategy's kill gate). In interviews, people answer "what did the app tell you to lift?" without hesitating.

---

## 8. Can this replace a $100/month trainer for a committed novice?

**Yes, for the parts of training that decide a committed novice's results, with these five capabilities:**
1. A program that fits your week, chosen by rules you can read (Project 3).
2. A target for every lift, every session, that moves when you earn it (Project 1).
3. Pictures, setup, range and effort guidance, plus a rest timer, at the moment you need them (Project 2).
4. An honest answer every four weeks to "is this working?", with what to change (Phase 2, hand-written until then).
5. Adapting to your life when you tell it: back after a gap, a short day, a swap (partially in 6 weeks; finished in Phase 3).

**No, because:**
1. **It can't see you move.** Form feedback, and noticing a bad pattern before it matters, needs eyes.
2. **It can't make you show up.** A person waiting for you, already paid, is a kind of accountability no honest app can manufacture, and the Freeze is right to forbid faking it.
3. **It only knows what you tell it.** It can't read that you're exhausted, hurt or discouraged, and it must never guess at pain or injury.

**The honest public position**

*Say:* "The plan, the numbers and the check-ins a good trainer gives you: every session, for every lift, based on what you actually did." And, as a mark of seriousness: "New to barbell lifts? Book one or two sessions with a coach to learn them, then use this for everything after."

*Don't say:* "Replaces your personal trainer." "Perfect form." "Safe" or "injury-free." "Guaranteed gains." "An AI coach that knows you." The Coach doesn't see your training today, and every one of these breaks an invariant or a promise you can't keep.

The short version: **this app can be the trainer's brain, not the trainer's eyes.** For a committed novice, the brain is the part that's missing. Right now the app has the brain's knowledge (the engine) but not its habit of telling you what to do next. The next six weeks should give it that habit.
