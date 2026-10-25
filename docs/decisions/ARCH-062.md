# ARCH-062 — Next-session targets: a fixed double-progression rule, computed on read

**Date:** 2026-10-25
**Status:** Accepted (product-depth roadmap, Project 1; the founder specified the rule in the 2026-10-25 brief)
**Supersedes:** none (narrows the Phase 6 "no prefill" rule, see below)
**Superseded by:** none

## Context

After six sessions the plan line still showed the Builder's 20 kg default while the lifter was at 47.5 kg, and Review reported that progress as "LOAD ABOVE PLAN". The app logged what happened but never said what to do next, which is the one act a trainer repeats every week. The roadmap's Project 1 closes that: the app states a target for every lift, from the lifter's own logs, by a rule they can read.

## Decision

**1. The rule (double progression), per exercise.** It reads the exercise's earlier COMPLETED sessions, newest first, and the prescription's rep range and planned effort.

- *Session load* = the load used on the most sets (ties: the heavier). Only sets at that load are judged.
- A session is **ADVANCE** when at least `targetSets` sets were logged at that load, every one reached the top of the rep range, and none was harder than one step above the planned effort (logged RPE above `plannedRpe + 1` blocks it; no logged RPE, or no planned RPE, never blocks).
- A session is **MISS** when at least half of its sets at that load (rounded up) fell below the bottom of the rep range.
- Anything else is **HOLD**.
- The next target, from the most recent session:
  - ADVANCE: session load + one load step. Reps: the whole range again.
  - HOLD: the same load. Reps: the top of the range on every set.
  - MISS once: the same load (hold).
  - **MISS twice in a row** (the two most recent sessions both MISS): **10% lighter**, rounded to the weight list's grid, and at least one step lighter.
- An exercise with no loaded history has **no target**; the session screen says "First time — find your starting weights" and runs the bootstrap flow (3).
- An exercise with a load step of 0 (bodyweight) never changes weight: progress is reps only. ADVANCE reads "you hit N on every set, add weight or a harder variation when you can"; otherwise the target is "one more rep than last time, up to the top of the range".

**2. Load steps by equipment** (kg; pounds in brackets, for exercises logged in lb): barbell 2.5 (5), dumbbell 2.5 (5; per dumbbell), cable 2.5 (5), machine 5 (10), bodyweight 0, anything else 2.5 (5). Targets are rounded to the weight picker's grid (2.5 kg / 5 lb), so a target is always a choosable row.

**3. Comeback.** When the lifter's last COMPLETED session (any exercise) was 10 or more days ago, the next session's targets are the last session load less 10%, rounded to the grid, with no advance. The line reads "Comeback: 10% lighter after N days off". It replaces the rule's target for that session only; the following session reads the comeback session's sets by the same rule, so the lifter climbs back from there.

**4. Finding your starting weight (an exercise with no history).** After each logged set a question appears: "How many more could you have done?" with five answers: 0, 1-2, 3-4, 5-6, 7+. The answer is stored as the set's RPE, ten minus the middle of the answer (10, 8.5, 6.5, 4.5, 2). Anywhere a set's effort is shown it is shown in reps left ("1-2 reps left"), the picker's own vocabulary, so there is one effort language. The app then suggests the next set's weight: the estimated 1RM of the set just done (Epley, counting the reps left from the answer) turned back into a weight for the middle of the rep range with 2 to 3 reps left, rounded down to the grid and never more than 20% above the weight just used. The suggestion is shown as a chip the lifter can tap; it is never filled in. The next session's target for that exercise is the same estimate from the session's last set.

**5. The Phase 6 no-prefill rule, as it now stands.** The rule's purpose was to stop the app nudging a lifter into affirming a number without thinking. It stays true for **reps and weight**: no input is ever pre-filled with a target or a plan value. What changes is that the target is *shown*: in the exercise's plan line, as a pinned "Target" row at the top of the weight list, and as the row the list opens on and highlights. Using it takes a tap. Effort keeps the A3a.1 founder decision (the picker starts on the option nearest the plan). "Last time" hints remain display-only.

**6. Computed on read, never stored.** Targets are derived from logged sets and the prescription when a page is read. No column, table or ProgramVersion changes (invariant 3 holds), and a target is never the plan: the prescription's own weight is untouched. Review stops counting a load above the plan as a deviation (the plan no longer claims a weight the lifter has moved past); reps below the plan, unlogged exercises and skipped sessions are still deviations.

**7. Where it lives.** Pure functions in `packages/domain/src/progress/` (`nextTargets.ts`, `startingWeight.ts`, `loadSteps.ts`), outside `analysis/`, `assessment/` and `goal-profiles/`, so calibration is unaffected. `packages/api` loads history and maps it in; the pages only render.

## Consequences

- The numbers are product judgement, not science: a 2.5 kg step, "every set at the top", 10% for a comeback. They are named constants in one file, to tune from real logs the way the verdict window was.
- Copy states a target and a reason ("Up 2.5 kg: you hit 12 reps on every set last time"). It never promises an outcome (invariant 9) and never names a cause for a miss (invariant 10). All new strings run through the shared forbidden-copy lint.
- A lifter who logs no effort is never blocked from advancing; one who logs "Max effort" on every top set holds until a set is easier than that.
- Pyramid or drop-set sessions are judged on their most-used load only. A session logged at one load with fewer sets than planned is a HOLD, not an ADVANCE.
- The dashboard's Today card and the session screen read the same function, so the target shown before a session is the one the session shows.
