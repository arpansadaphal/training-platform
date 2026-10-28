// packages/domain/src/assessment/namedActions.ts
//
// Named, equipment-aware wording for "add weekly volume" actions.
//
// actionTemplates.ts says "Add weekly volume for hamstrings." This module turns that into
// "Add 3 sets of Leg Curl on Day 2 → 7.5 sets/week." for every VOLUME Low action, and leaves every other
// action (and every VOLUME Low it cannot name) exactly as the template wrote it.
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
} from "../analysis/types";
import { hardSetCredit } from "../analysis/hardSetCredit";
import { simulate } from "../mutation/simulate";
import type { MutationSpec } from "../mutation/types";
import type { ExercisePrescriptionStructure, ProgramStructure } from "../types";
import type { Assessment } from "./types";

const ADDED_RPE = 8;
const MIN_SETS = 2;
const MAX_SETS = 4;
const MAX_SETS_HALF_FACTOR = 6;
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

export interface NamedAction {
  readonly rootCauseKey: string;
  /** The named sentence, or the template sentence unchanged when it could not be named. */
  readonly description: string;
  /** Present only when `description` is a named sentence. */
  readonly suggestion?: NamedActionSuggestion;
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

function nameOne(
  action: Assessment["actions"][number],
  structure: ProgramStructure,
  referenceData: ExerciseReferenceData,
  config: GoalProfileConfig,
  alreadyProposed: ReadonlySet<string>,
): NamedAction {
  const fallback: NamedAction = { rootCauseKey: action.rootCauseKey, description: action.description };
  const axis = action.relatedAxis;
  if (axis.axisType !== "VOLUME" || axis.status.band !== "Low" || axis.scopeKey === null) return fallback;

  const muscle =
    referenceData.muscleGroups.find((m) => m.id === axis.scopeKey) ??
    referenceData.muscleGroups.find((m) => m.name === axis.scopeKey);
  if (!muscle) return fallback;

  const days = structure.workoutDays.filter((d) => d.isRestDay !== true);
  if (days.length === 0) return fallback;

  const exerciseById = new Map(referenceData.exercises.map((e) => [e.id, e]));
  const nameByMuscleId = new Map(referenceData.muscleGroups.map((m) => [m.id, m.name]));
  // An exercise is lower-body when a main mover of it (factor >= 1) is a lower-body group. Unscoped groups
  // (front delts) have no name here and so never count as lower body.
  const lowerByExercise = new Map<string, boolean>();
  let bestFactor = 0;
  for (const inv of referenceData.involvements) {
    if (!(inv.involvementFactor > 0)) continue;
    if (inv.involvementFactor >= 1 && LOWER_BODY.has(nameByMuscleId.get(inv.muscleGroupId) ?? "")) {
      lowerByExercise.set(inv.exerciseId, true);
    }
    if (inv.muscleGroupId === muscle.id && inv.involvementFactor > bestFactor) bestFactor = inv.involvementFactor;
  }
  if (bestFactor <= 0) return fallback;

  const inProgram = new Set<string>();
  const equipmentCount = new Map<string, number>();
  for (const d of days) {
    for (const p of d.prescriptions) {
      inProgram.add(p.exerciseId);
      const eq = exerciseById.get(p.exerciseId)?.equipment;
      if (eq) equipmentCount.set(eq, (equipmentCount.get(eq) ?? 0) + 1);
    }
  }

  const eligible: Candidate[] = [];
  for (const inv of referenceData.involvements) {
    if (inv.muscleGroupId !== muscle.id || inv.involvementFactor !== bestFactor) continue;
    if (inProgram.has(inv.exerciseId) || alreadyProposed.has(inv.exerciseId)) continue;
    const ex = exerciseById.get(inv.exerciseId);
    if (!ex) continue;
    const equipment = ex.equipment;
    if (equipment !== null && equipment !== "bodyweight" && !equipmentCount.has(equipment)) continue;
    eligible.push({
      exerciseId: ex.id,
      name: ex.name,
      pattern: ex.movementPattern,
      factor: bestFactor,
      lower: lowerByExercise.get(ex.id) === true,
    });
  }
  const preferred = PREFERRED_ADDITIONS[muscle.name] ?? [];
  const candidates = eligible
    .filter((c) => preferred.includes(c.name))
    .sort((a, b) => preferred.indexOf(a.name) - preferred.indexOf(b.name));
  if (candidates.length === 0) return fallback;

  // The day: same body region as the proposed exercise first, then the shortest session, then the earliest.
  const first = candidates[0] as Candidate;
  const totalSets = (d: (typeof days)[number]) => d.prescriptions.reduce((t, p) => t + p.targetSets, 0);
  const sameRegion = (d: (typeof days)[number]) =>
    d.prescriptions.filter((p) => (lowerByExercise.get(p.exerciseId) === true) === first.lower).length;
  const day = days.reduce((best, d) => {
    const dr = sameRegion(d);
    const br = sameRegion(best);
    if (dr !== br) return dr > br ? d : best;
    return totalSets(d) < totalSets(best) ? d : best;
  });

  const lower =
    config.statusBands.VOLUME.find((b) => b.status === "Adequate")?.lowerBound ?? null;

  // Run one candidate through the engine; null when it cannot be computed or does not raise the muscle.
  const evaluate = (c: Candidate, sets: number) => {
    const mutation: MutationSpec = {
      op: "ADD_EXERCISE_PRESCRIPTION",
      workoutDayId: day.id,
      prescription: buildPrescription(c, sets, day.prescriptions.length),
    };
    const sim = simulate(structure, mutation, config, referenceData, { goalId: SIM_GOAL_ID });
    if (sim.kind === "INVALID_MUTATION") return null;
    const before = volumeOf(sim.baseAnalysis, axis.scopeKey as string);
    const after = volumeOf(sim.mutatedAnalysis, axis.scopeKey as string);
    if (before === null || after === null || !(after > before)) return null;
    return { before, after };
  };

  const perSet = hardSetCredit(buildPrescription(first, 1, 0)) * first.factor;
  const current = typeof axis.metricValue === "number" ? axis.metricValue : 0;
  const deficit = lower === null ? MIN_SETS : Math.max(0, lower - current);
  const maxSets = first.factor < 1 ? MAX_SETS_HALF_FACTOR : MAX_SETS;
  const sets = Math.min(maxSets, Math.max(MIN_SETS, perSet > 0 ? Math.ceil(deficit / perSet) : MIN_SETS));

  const main = evaluate(first, sets);
  if (main === null) return fallback;
  const second = candidates[1];
  const alt = second ? evaluate(second, sets) : null;

  const suggestion: NamedActionSuggestion = {
    muscle: muscle.name,
    exerciseName: first.name,
    workoutDayName: day.name,
    sets,
    beforeSets: main.before,
    afterSets: main.after,
    alternative: second && alt ? { exerciseName: second.name, afterSets: alt.after } : null,
  };
  let description = `Add ${sets} ${sets === 1 ? "set" : "sets"} of ${first.name} on ${day.name} → ${num(main.after)} sets/week.`;
  if (lower !== null && main.after < lower) description += ` The Adequate range starts at ${num(lower)}.`;
  if (suggestion.alternative) {
    description += ` Or ${suggestion.alternative.exerciseName} → ${num(suggestion.alternative.afterSets)}.`;
  }
  return { rootCauseKey: action.rootCauseKey, description, suggestion };
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
  const proposed = new Set<string>();
  return assessment.actions.map((a) => {
    const named = nameOne(a, structure, referenceData, config, proposed);
    if (named.suggestion) {
      const ex = referenceData.exercises.find((e) => e.name === named.suggestion?.exerciseName);
      if (ex) proposed.add(ex.id);
    }
    return named;
  });
}
