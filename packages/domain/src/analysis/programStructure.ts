// packages/domain/src/analysis/programStructure.ts
//
// PROGRAM_STRUCTURE (ARCH-063, Session D): five program-level facts the engine always had the inputs for and never
// said. Each is a scope of one axis, so each is a roll-up axis that Fit reads like any other (invariant 8):
//
//   attendance    training days a week. Fewer than `minTrainingDays` cannot cover a week's volume.
//   total-volume  credited hard sets a week across the whole body, against `minWeeklySets`.
//   session-size  the longest session's credited sets, against `maxSessionSets`.
//   push-pull     pushing at least `minRatio` times what you pull, with at least `minSetsEachSide` on each side.
//   time-budget   the longest session's estimated minutes against the lifter's stated budget. Only computed when
//                 `AnalysisContext.minutesPerSession` is supplied.
//
// Every threshold is Tier 4 (an engine boundary, hypertrophy.ts) and is read from `config.programStructure`. A config
// without it gets no PROGRAM_STRUCTURE axis at all, so older configs and fixtures are untouched.
//
// Each scope resolves its own band here rather than through `statusBands`: one band list per axis type cannot hold
// five different metrics (days, sets, sets, a ratio, minutes). The band NAMES are unique per scope so the profile's
// severity map (per axis type, per band) can still give each its own severity.
//
// A set counts as `creditedSets` (the effort-aware hard-set credit VOLUME uses), so a session of ten sets at RIR 5
// is 0 sets long here, the same as it is everywhere else in the engine. Session length is NOT scaled by
// `runsPerWeek` (a session is one session); the weekly total is.

import type { ProgramStructure } from "../types";
import type {
  AnalysisAxisResult,
  AnalysisContext,
  CrossMuscleRatios,
  GoalProfileConfig,
  ProgramFacts,
} from "./types";
import { creditedSets, resolveHardSetCreditConfig } from "./hardSetCredit";

export const PROGRAM_BANDS = {
  attendance: { fires: "Single session", ok: "Within range" },
  "total-volume": { fires: "Under-dosed", ok: "Within range" },
  "session-size": { fires: "Long session", ok: "Within range" },
  "push-pull": { fires: "Push-heavy", ok: "Within range" },
  "time-budget": { fires: "Over budget", ok: "Within range" },
} as const;

export type ProgramScope = keyof typeof PROGRAM_BANDS;

const positive = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n > 0;

interface Session {
  readonly name: string;
  readonly sets: number;
}

export function computeProgramStructureAxes(
  structure: ProgramStructure,
  ratios: CrossMuscleRatios | undefined,
  config: GoalProfileConfig,
  context: AnalysisContext | undefined,
  runs: number,
): AnalysisAxisResult[] {
  const rules = config.programStructure;
  if (rules === undefined) return [];
  const credit = resolveHardSetCreditConfig(config);

  const sessions: Session[] = structure.workoutDays
    .filter((d) => d.isRestDay !== true)
    .map((d) => ({ name: d.name, sets: d.prescriptions.reduce((n, p) => n + creditedSets(p, credit), 0) }));
  const weeklySets = sessions.reduce((n, s) => n + s.sets, 0) * runs;
  // The longest session; the first of equals, so the finding names a session deterministically.
  const longest = sessions.reduce<Session | undefined>((best, s) => (best === undefined || s.sets > best.sets ? s : best), undefined);
  const trainingDays = positive(context?.daysPerWeek) ? context.daysPerWeek : sessions.length;

  const axis = (scope: ProgramScope, metricValue: number, fires: boolean, program?: ProgramFacts): AnalysisAxisResult => ({
    axisType: "PROGRAM_STRUCTURE",
    scopeKey: scope,
    metricValue,
    status: { kind: "BAND", band: fires ? PROGRAM_BANDS[scope].fires : PROGRAM_BANDS[scope].ok },
    ...(fires && program ? { facts: { program } } : {}),
  });

  const out: AnalysisAxisResult[] = [];

  // attendance. Zero training days is an empty program: total-volume says that, so this stays quiet.
  out.push(
    axis("attendance", trainingDays, trainingDays > 0 && trainingDays < rules.minTrainingDays, {
      trainingDays,
    }),
  );

  out.push(
    axis("total-volume", weeklySets, weeklySets < rules.minWeeklySets, {
      totalSets: weeklySets,
      floorSets: rules.minWeeklySets,
    }),
  );

  const longSets = longest?.sets ?? 0;
  out.push(
    axis("session-size", longSets, longSets > rules.maxSessionSets, {
      ...(longest ? { sessionName: longest.name } : {}),
      sessionSets: longSets,
      sessionMinutes: longSets * rules.minutesPerSet,
    }),
  );

  const pp = ratios?.pushPull ?? null;
  const ratio = pp && pp.pullSets > 0 ? pp.pushSets / pp.pullSets : 0;
  const pushHeavy =
    pp !== null &&
    pp.pushSets >= rules.pushPull.minSetsEachSide &&
    pp.pullSets >= rules.pushPull.minSetsEachSide &&
    ratio >= rules.pushPull.minRatio;
  out.push(axis("push-pull", ratio, pushHeavy, pp ? { pushSets: pp.pushSets, pullSets: pp.pullSets } : undefined));

  const budget = context?.minutesPerSession;
  if (positive(budget)) {
    const minutes = longSets * rules.minutesPerSet;
    const over = minutes > budget + rules.budgetSlackMinutes;
    out.push(
      axis("time-budget", minutes, over, {
        ...(longest ? { sessionName: longest.name } : {}),
        sessionSets: longSets,
        sessionMinutes: minutes,
        budgetMinutes: budget,
        trimSets: Math.ceil((minutes - budget) / rules.minutesPerSet),
      }),
    );
  }

  return out;
}
