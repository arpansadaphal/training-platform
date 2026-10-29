// packages/domain/src/assessment/namedActions.ts
//
// Named, equipment-aware wording for "add weekly volume" actions.
//
// actionTemplates.ts says "Add weekly volume for hamstrings." This module turns that into
// "Add 3 sets of Leg Curl on Day 2 → 7.5 sets/week." for every VOLUME Low action, and leaves every other
// action (and every VOLUME Low it cannot name) exactly as the template wrote it.
//
// ARCH-063 / B2 consolidates several Lows into one finding, and so into one action. This module names those too:
//   - a region or pattern finding that explains several Low muscles: one named addition per muscle, in the
//     finding's order ("Add 3 sets of Leg Curl on Lower → 6 sets/week. Add 3 sets of ...");
//   - a region with NO training at all ("No lower-body training"): a new day with one exercise per muscle at 3
//     sets, run through ONE simulate(ADD_WORKOUT_DAY) so its after-numbers are the engine's, not the sum of
//     separate guesses;
//   - a pattern finding led by the Exercise-selection axis ("no overhead press"): the template stands.
//
// Why a post-step and not part of computeAssessment: the Assessment is persisted verbatim in
// AssessmentSnapshot and is a pure function of the Analysis, which carries no structure. Naming an exercise
// needs the structure and the library, so it runs beside the Assessment, from the same structure the
// Analysis was computed over, and never changes what is stored.
//
// Invariant 1: the number after "→" is not computed here. It is read from the mutated Analysis returned by
// `simulate()` for an ADD_EXERCISE_PRESCRIPTION, i.e. from the engine. (Under an unvalidated profile
// simulate returns CANNOT_COMPUTE for the Gain/Cost diff, but it still carries both Analyses; the
// VOLUME metric is a plain engine number either way.) The mutation goes through applyMutation, the one
// shared mutation function (invariant 2).
// Invariant 9: the copy states sets per week, never what they will do.
//
// Choice of exercise (Tier 4, a product heuristic; a curated list is the obvious later upgrade):
//   1. the muscle must be a main mover of the exercise: involvementFactor equal to the highest the library
//      gives that muscle (1.0 for most; 0.5 for upper back, which no library exercise moves as a primary);
//   2. equipment must already be present in the program (bodyweight is always allowed);
//   3. an exercise already in the program is not proposed (that would be "add sets to", not "add");
//   4. only exercises on PREFERRED_ADDITIONS (the usual first picks for that muscle, a coaching convention,
//      Tier 3/4) are proposed, best first. If none is eligible the template sentence stands: a vague honest
//      line is better than a poor exercise.
//   5. an exercise an earlier action in the same list already proposed is skipped, so two actions never name
//      the same exercise with two different after-numbers.
// Each after-number is that one change alone, measured against the program as it stands.
// How many sets: enough to reach the start of the Adequate band, clamped to 2-4 (2-6 for a muscle the library
// only moves at 0.5) so one exercise on one day stays a sensible addition. If that is still short the line
// says where the band starts.
// Which day: the training day whose existing exercises are in the same region (upper or lower body) as the
// proposed one, then the one with the fewest prescribed sets, then the earliest.

import type {
  ExerciseReferenceData,
  GoalProfileConfig,
  MovementPattern,
  MuscleGroupReference,
} from "../analysis/types";
import { hardSetCredit } from "../analysis/hardSetCredit";
import { joinList } from "../copy/findingSentence";
import { simulate } from "../mutation/simulate";
import type { MutationSpec } from "../mutation/types";
import type { ExercisePrescriptionStructure, ProgramStructure, WorkoutDayStructure } from "../types";
import type { ActionSuggestion, Assessment, AssessmentFinding } from "./types";

const ADDED_RPE = 8;
const MIN_SETS = 2;
const MAX_SETS = 4;
const MAX_SETS_HALF_FACTOR = 6;
const NEW_DAY_SETS = 3;
const SIM_GOAL_ID = "named-actions";

/** Usual first picks per muscle, best first. Names are library exercise names. Tier 3/4: a convention, not a measurement. */
const PREFERRED_ADDITIONS: Readonly<Record<string, readonly string[]>> = {
  chest: ["Dumbbell Bench Press", "Incline Dumbbell Press", "Machine Chest Press", "Barbell Bench Press", "Cable Chest Fly", "Push-Up", "Pec Deck"],
  lats: ["Lat Pulldown", "Seated Cable Row", "Dumbbell Row", "Pull-Up", "Barbell Row", "Chest-Supported Row"],
  "upper back": ["Chest-Supported Row", "Seated Cable Row", "Dumbbell Row", "Barbell Row", "Face Pull", "Rear Delt Fly"],
  "side delts": ["Lateral Raise", "Cable Lateral Raise", "Machine Lateral Raise"],
  "rear delts": ["Rear Delt Fly", "Face Pull", "Machine Rear Delt Fly", "Cable Rear Delt Fly"],
  biceps: ["Dumbbell Curl", "Barbell Curl", "Cable Curl", "Hammer Curl", "Incline Curl", "Preacher Curl"],
  triceps: ["Tricep Pushdown", "Overhead Tricep Extension", "Skull Crusher", "Tricep Kickback", "Close-Grip Bench Press"],
  quads: ["Leg Press", "Leg Extension", "Goblet Squat", "Back Squat", "Hack Squat", "Bulgarian Split Squat", "Reverse Lunge", "Step-Up"],
  hamstrings: ["Leg Curl", "Romanian Deadlift", "Seated Leg Curl", "Nordic Hamstring Curl", "Stiff-Leg Deadlift"],
  glutes: ["Hip Thrust", "Glute Bridge", "Cable Pull-Through", "Hip Abduction"],
  calves: ["Standing Calf Raise", "Seated Calf Raise", "Donkey Calf Raise"],
};

const LOWER_BODY: ReadonlySet<string> = new Set(["quads", "hamstrings", "glutes", "calves", "adductors"]);

export interface NamedActionSuggestion {
  readonly muscle: string;
  readonly exerciseName: string;
  readonly workoutDayName: string;
  readonly sets: number;
  readonly beforeSets: number;
  readonly afterSets: number;
  /** A second exercise that would also work, with its own engine-computed after-number. */
  readonly alternative: { exerciseName: string; afterSets: number } | null;
}

/** A new day proposed for a region with no training at all, with the engine's after-number per muscle. */
export interface NamedDaySuggestion {
  readonly dayName: string;
  readonly exercises: readonly { exerciseName: string; sets: number }[];
  readonly afterSets: readonly { muscle: string; afterSets: number }[];
}

export interface NamedAction {
  readonly rootCauseKey: string;
  /** The named sentence, or the template sentence unchanged when it could not be named. */
  readonly description: string;
  /** Present only when `description` names one addition for a single muscle. */
  readonly suggestion?: NamedActionSuggestion;
  /** Present only when `description` names one addition per muscle of a region or pattern finding. */
  readonly suggestions?: readonly NamedActionSuggestion[];
  /** Present only when `description` proposes a new day for a region with no training. */
  readonly newDay?: NamedDaySuggestion;
}

const num = (n: number): string => String(Math.round(n * 10) / 10);

interface Candidate {
  readonly exerciseId: string;
  readonly name: string;
  readonly pattern: MovementPattern;
  readonly factor: number;
  readonly lower: boolean;
}

function volumeOf(analysis: { axisResults: readonly { axisType: string; scopeKey: string | null; metricValue: number | string }[] }, scopeKey: string): number | null {
  const axis = analysis.axisResults.find((a) => a.axisType === "VOLUME" && a.scopeKey === scopeKey);
  return axis && typeof axis.metricValue === "number" ? axis.metricValue : null;
}

function buildPrescription(
  c: Candidate,
  sets: number,
  orderIndex: number,
): ExercisePrescriptionStructure {
  const isolation = c.pattern === "ISOLATION";
  return {
    id: `named-action-${c.exerciseId}`,
    orderIndex,
    exerciseId: c.exerciseId,
    targetSets: sets,
    targetRepsLow: isolation ? 10 : 8,
    targetRepsHigh: isolation ? 15 : 12,
    targetRpe: ADDED_RPE,
    loadScheme: { type: "RPE_BASED", rpe: ADDED_RPE },
  };
}

interface Ctx {
  readonly structure: ProgramStructure;
  readonly referenceData: ExerciseReferenceData;
  readonly config: GoalProfileConfig;
  readonly days: ProgramStructure["workoutDays"];
  readonly exerciseById: ReadonlyMap<string, ExerciseReferenceData["exercises"][number]>;
  /** Exercises whose main mover (factor >= 1) is a lower-body group. */
  readonly lowerByExercise: ReadonlyMap<string, boolean>;
  readonly inProgram: ReadonlySet<string>;
  readonly equipmentCount: ReadonlyMap<string, number>;
  /** The start of the Adequate VOLUME band, for "The Adequate range starts at 6." */
  readonly lowerBound: number | null;
}

function buildContext(
  structure: ProgramStructure,
  referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
): Ctx | null {
  const days = structure.workoutDays.filter((d) => d.isRestDay !== true);
  if (days.length === 0) return null;
  const exerciseById = new Map(referenceData.exercises.map((e) => [e.id, e]));
  const nameByMuscleId = new Map(referenceData.muscleGroups.map((m) => [m.id, m.name]));
  // An exercise is lower-body when a main mover of it (factor >= 1) is a lower-body group. Unscoped groups
  // (front delts) have no name here and so never count as lower body.
  const lowerByExercise = new Map<string, boolean>();
  for (const inv of referenceData.involvements) {
    if (inv.involvementFactor >= 1 && LOWER_BODY.has(nameByMuscleId.get(inv.muscleGroupId) ?? "")) {
      lowerByExercise.set(inv.exerciseId, true);
    }
  }
  const inProgram = new Set<string>();
  const equipmentCount = new Map<string, number>();
  for (const d of days) {
    for (const p of d.prescriptions) {
      inProgram.add(p.exerciseId);
      const eq = exerciseById.get(p.exerciseId)?.equipment;
      if (eq) equipmentCount.set(eq, (equipmentCount.get(eq) ?? 0) + 1);
    }
  }
  return {
    structure,
    referenceData,
    config,
    days,
    exerciseById,
    lowerByExercise,
    inProgram,
    equipmentCount,
    lowerBound: config.statusBands.VOLUME.find((b) => b.status === "Adequate")?.lowerBound ?? null,
  };
}

function findMuscle(ctx: Ctx, key: string): MuscleGroupReference | undefined {
  return (
    ctx.referenceData.muscleGroups.find((m) => m.id === key) ??
    ctx.referenceData.muscleGroups.find((m) => m.name === key)
  );
}

/** Eligible additions for a muscle, best first (rules 1-5 in the header), with the factor they move it at. */
function candidatesFor(
  ctx: Ctx,
  muscle: MuscleGroupReference,
  taken: ReadonlySet<string>,
): { factor: number; list: Candidate[] } | null {
  let bestFactor = 0;
  for (const inv of ctx.referenceData.involvements) {
    if (inv.muscleGroupId === muscle.id && inv.involvementFactor > bestFactor) bestFactor = inv.involvementFactor;
  }
  if (bestFactor <= 0) return null;

  const eligible: Candidate[] = [];
  for (const inv of ctx.referenceData.involvements) {
    if (inv.muscleGroupId !== muscle.id || inv.involvementFactor !== bestFactor) continue;
    if (ctx.inProgram.has(inv.exerciseId) || taken.has(inv.exerciseId)) continue;
    const ex = ctx.exerciseById.get(inv.exerciseId);
    if (!ex) continue;
    const equipment = ex.equipment;
    if (equipment !== null && equipment !== "bodyweight" && !ctx.equipmentCount.has(equipment)) continue;
    eligible.push({
      exerciseId: ex.id,
      name: ex.name,
      pattern: ex.movementPattern,
      factor: bestFactor,
      lower: ctx.lowerByExercise.get(ex.id) === true,
    });
  }
  const preferred = PREFERRED_ADDITIONS[muscle.name] ?? [];
  const list = eligible
    .filter((c) => preferred.includes(c.name))
    .sort((a, b) => preferred.indexOf(a.name) - preferred.indexOf(b.name));
  return list.length === 0 ? null : { factor: bestFactor, list };
}

/** One named addition for one muscle that is at `current` sets, or null when nothing fits the equipment. */
function suggestForMuscle(
  ctx: Ctx,
  scopeKey: string,
  muscle: MuscleGroupReference,
  current: number,
  taken: ReadonlySet<string>,
): NamedActionSuggestion | null {
  const found = candidatesFor(ctx, muscle, taken);
  if (!found) return null;
  const candidates = found.list;

  // The day: same body region as the proposed exercise first, then the shortest session, then the earliest.
  const first = candidates[0] as Candidate;
  const totalSets = (d: (typeof ctx.days)[number]) => d.prescriptions.reduce((t, p) => t + p.targetSets, 0);
  const sameRegion = (d: (typeof ctx.days)[number]) =>
    d.prescriptions.filter((p) => (ctx.lowerByExercise.get(p.exerciseId) === true) === first.lower).length;
  const day = ctx.days.reduce((best, d) => {
    const dr = sameRegion(d);
    const br = sameRegion(best);
    if (dr !== br) return dr > br ? d : best;
    return totalSets(d) < totalSets(best) ? d : best;
  });

  // Run one candidate through the engine; null when it cannot be computed or does not raise the muscle.
  const evaluate = (c: Candidate, sets: number) => {
    const mutation: MutationSpec = {
      op: "ADD_EXERCISE_PRESCRIPTION",
      workoutDayId: day.id,
      prescription: buildPrescription(c, sets, day.prescriptions.length),
    };
    const sim = simulate(ctx.structure, mutation, ctx.config, ctx.referenceData, { goalId: SIM_GOAL_ID });
    if (sim.kind === "INVALID_MUTATION") return null;
    const before = volumeOf(sim.baseAnalysis, scopeKey);
    const after = volumeOf(sim.mutatedAnalysis, scopeKey);
    if (before === null || after === null || !(after > before)) return null;
    return { before, after };
  };

  const perSet = hardSetCredit(buildPrescription(first, 1, 0)) * first.factor;
  const deficit = ctx.lowerBound === null ? MIN_SETS : Math.max(0, ctx.lowerBound - current);
  const maxSets = first.factor < 1 ? MAX_SETS_HALF_FACTOR : MAX_SETS;
  const sets = Math.min(maxSets, Math.max(MIN_SETS, perSet > 0 ? Math.ceil(deficit / perSet) : MIN_SETS));

  const main = evaluate(first, sets);
  if (main === null) return null;
  const second = candidates[1];
  const alt = second ? evaluate(second, sets) : null;

  return {
    muscle: muscle.name,
    exerciseName: first.name,
    workoutDayName: day.name,
    sets,
    beforeSets: main.before,
    afterSets: main.after,
    alternative: second && alt ? { exerciseName: second.name, afterSets: alt.after } : null,
  };
}

/** "Add 3 sets of Leg Curl on Day 2 → 7.5 sets/week. The Adequate range starts at 6. Or Seated Leg Curl → 7.5." */
function sentenceOf(s: NamedActionSuggestion, lowerBound: number | null, withAlternative: boolean): string {
  let text = `Add ${s.sets} ${s.sets === 1 ? "set" : "sets"} of ${s.exerciseName} on ${s.workoutDayName} → ${num(s.afterSets)} sets/week.`;
  if (lowerBound !== null && s.afterSets < lowerBound) text += ` The Adequate range starts at ${num(lowerBound)}.`;
  if (withAlternative && s.alternative) text += ` Or ${s.alternative.exerciseName} → ${num(s.alternative.afterSets)}.`;
  return text;
}

/** One addition inside a multi-muscle action: it says which muscle the after-number belongs to. */
function memberSentence(s: NamedActionSuggestion): string {
  return `Add ${s.sets} ${s.sets === 1 ? "set" : "sets"} of ${s.exerciseName} on ${s.workoutDayName} → ${s.muscle} ${num(s.afterSets)} sets/week.`;
}

/** The exercise ids a named action proposed, so a later action in the same list does not name them again. */
function proposedIds(named: NamedAction, referenceData: ExerciseReferenceData): string[] {
  const names = [
    ...(named.suggestion ? [named.suggestion.exerciseName] : []),
    ...(named.suggestions ?? []).map((s) => s.exerciseName),
    ...(named.newDay?.exercises ?? []).map((e) => e.exerciseName),
  ];
  return names.flatMap((name) => {
    const ex = referenceData.exercises.find((e) => e.name === name);
    return ex ? [ex.id] : [];
  });
}

const sameAxis = (a: AssessmentFinding["lead"], b: AssessmentFinding["lead"]): boolean =>
  a.axisType === b.axisType && a.scopeKey === b.scopeKey;

/** A single VOLUME Low whose action is the axis's own "add volume for X". */
function nameAxisAction(action: ActionSuggestion, ctx: Ctx, taken: ReadonlySet<string>): NamedAction {
  const fallback: NamedAction = { rootCauseKey: action.rootCauseKey, description: action.description };
  const axis = action.relatedAxis;
  if (axis.axisType !== "VOLUME" || axis.status.band !== "Low" || axis.scopeKey === null) return fallback;
  if (action.rootCauseKey !== `volume:add-${axis.scopeKey}`) return fallback;
  const muscle = findMuscle(ctx, axis.scopeKey);
  if (!muscle) return fallback;
  const current = typeof axis.metricValue === "number" ? axis.metricValue : 0;
  const suggestion = suggestForMuscle(ctx, axis.scopeKey, muscle, current, taken);
  if (!suggestion) return fallback;
  return {
    rootCauseKey: action.rootCauseKey,
    description: sentenceOf(suggestion, ctx.lowerBound, true),
    suggestion,
  };
}

/** A region or pattern finding that explains several Low muscles: one named addition per muscle. */
function nameMemberAction(
  action: ActionSuggestion,
  finding: AssessmentFinding,
  ctx: Ctx,
  taken: ReadonlySet<string>,
): NamedAction {
  const fallback: NamedAction = { rootCauseKey: action.rootCauseKey, description: action.description };
  const local = new Set(taken);
  const named: NamedActionSuggestion[] = [];
  const unnamed: string[] = [];
  for (const member of finding.members) {
    const muscle = findMuscle(ctx, member.muscle);
    const suggestion = muscle ? suggestForMuscle(ctx, member.muscle, muscle, member.sets, local) : null;
    if (!suggestion) {
      unnamed.push(member.muscle);
      continue;
    }
    named.push(suggestion);
    for (const id of proposedIds({ rootCauseKey: "", description: "", suggestion }, ctx.referenceData)) local.add(id);
  }
  if (named.length === 0) return fallback;
  const belowRange = ctx.lowerBound !== null && named.some((s) => s.afterSets < (ctx.lowerBound as number));
  const description =
    named.map(memberSentence).join(" ") +
    (belowRange ? ` The Adequate range starts at ${num(ctx.lowerBound as number)}.` : "") +
    (unnamed.length > 0 ? ` Add weekly volume for ${joinList(unnamed)}.` : "");
  return { rootCauseKey: action.rootCauseKey, description, suggestions: named };
}

const article = (word: string): string => (/^[aeiou]/i.test(word) ? "an" : "a");
const capitalise = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** A region with no training: a new day, one exercise per muscle at 3 sets, through one simulate. */
function nameNewDayAction(
  action: ActionSuggestion,
  finding: AssessmentFinding,
  ctx: Ctx,
  taken: ReadonlySet<string>,
): NamedAction {
  const fallback: NamedAction = { rootCauseKey: action.rootCauseKey, description: action.description };
  const region = ctx.config.regions?.find((r) => r.key === finding.region);
  if (!region) return fallback;

  const local = new Set(taken);
  const chosen: Candidate[] = [];
  for (const member of finding.members) {
    const muscle = findMuscle(ctx, member.muscle);
    const found = muscle ? candidatesFor(ctx, muscle, local) : null;
    const pick = found?.list[0];
    if (!pick) continue;
    chosen.push(pick);
    local.add(pick.exerciseId);
  }
  if (chosen.length === 0) return fallback;

  const dayName = `${capitalise(region.adjective)} day`;
  const day: WorkoutDayStructure = {
    id: "named-action-day",
    orderIndex: ctx.structure.workoutDays.length,
    name: dayName,
    prescriptions: chosen.map((c, i) => buildPrescription(c, NEW_DAY_SETS, i)),
  };
  const sim = simulate(ctx.structure, { op: "ADD_WORKOUT_DAY", day }, ctx.config, ctx.referenceData, {
    goalId: SIM_GOAL_ID,
  });
  if (sim.kind === "INVALID_MUTATION") return fallback;

  // Only the muscles the new day actually raises are given an after-number; the rest are said plainly.
  const afterSets: { muscle: string; afterSets: number }[] = [];
  const unraised: string[] = [];
  for (const m of finding.members) {
    const after = volumeOf(sim.mutatedAnalysis, m.muscle);
    if (after !== null && after > m.sets) afterSets.push({ muscle: m.muscle, afterSets: after });
    else unraised.push(m.muscle);
  }
  if (afterSets.length === 0) return fallback;
  const exerciseClause = chosen
    .map((c, i) => (i === 0 ? `${NEW_DAY_SETS} sets of ${c.name}` : `${NEW_DAY_SETS} of ${c.name}`))
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");
  let description =
    `Add ${article(region.adjective)} ${region.adjective} day: ${exerciseClause}` +
    ` → ${joinList(afterSets.map((a) => `${a.muscle} ${num(a.afterSets)}`))} sets/week.`;
  if (ctx.lowerBound !== null && afterSets.some((a) => a.afterSets < (ctx.lowerBound as number))) {
    description += ` The Adequate range starts at ${num(ctx.lowerBound)}.`;
  }
  if (unraised.length > 0) description += ` Add weekly volume for ${joinList(unraised)}.`;
  return {
    rootCauseKey: action.rootCauseKey,
    description,
    newDay: {
      dayName,
      exercises: chosen.map((c) => ({ exerciseName: c.name, sets: NEW_DAY_SETS })),
      afterSets,
    },
  };
}

function nameOne(
  action: ActionSuggestion,
  finding: AssessmentFinding | undefined,
  ctx: Ctx,
  taken: ReadonlySet<string>,
): NamedAction {
  if (finding === undefined || finding.kind === "AXIS") return nameAxisAction(action, ctx, taken);
  if (finding.kind === "REGION") {
    return finding.absent ? nameNewDayAction(action, finding, ctx, taken) : nameMemberAction(action, finding, ctx, taken);
  }
  // PATTERN: members explain VOLUME Lows (name one addition per muscle); otherwise the template stands.
  return finding.members.length > 0
    ? nameMemberAction(action, finding, ctx, taken)
    : { rootCauseKey: action.rootCauseKey, description: action.description };
}

/**
 * One NamedAction per `assessment.actions`, in the same order. `structure` must be the structure the
 * Analysis was computed over (rest days stripped or not; rest days are ignored here either way).
 */
export function nameActions(
  assessment: Assessment,
  structure: ProgramStructure,
  referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
): NamedAction[] {
  const ctx = buildContext(structure, referenceData, config);
  const proposed = new Set<string>();
  return assessment.actions.map((action) => {
    if (ctx === null) return { rootCauseKey: action.rootCauseKey, description: action.description };
    const finding = assessment.findings?.find((f) => sameAxis(f.lead, action.relatedAxis));
    const named = nameOne(action, finding, ctx, proposed);
    for (const id of proposedIds(named, referenceData)) proposed.add(id);
    return named;
  });
}
