// tRPC router for the public Program Checker (/check).
//
// analyze and exercises are PUBLIC procedures: a stranger can call them with no
// account. Rate limiting is Edge middleware keyed on the procedure name
// (apps/web/src/lib/rateLimit.ts, category "check"), so analyze must stay reachable over
// HTTP; an in-process caller (RSC, server action) would bypass the limit.
//
// A routine travels as a hash (base64url of exercise NAMES, see
// packages/domain/src/check). analyze resolves names against the seeded library
// and runs the same engine calls as analysis.previewAnalyze, without persisting
// anything. save is the only procedure that writes, and it needs a signed-in user.
//
// All three refuse when CHECK_PUBLIC is not "true", so turning the flag off
// closes the API as well as the pages.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { isCheckPublic } from "@training/config";
import {
  CHECK_LIMITS,
  computeAnalysis,
  computeAssessment,
  computeFitScore,
  decodeCompactProgram,
  frequencyObservation,
  goalProfileRegistry,
  nameActions,
  toProgramStructure,
  withoutRestDays,
  type AnalysisContext,
  type AssessmentResult,
  type FitScoreResult,
  type FrequencyObservation,
  type NamedAction,
  type ProgramStructure,
} from "@training/domain";
import { listExercises, type ExerciseRecord } from "@training/db";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { loadExerciseReferenceData } from "../services/referenceDataService";
import { createMyProgram } from "../services/programService";
import { createMyDraft, updateMyDraftStructure } from "../services/draftService";

const CHECK_GOAL_PROFILE_KEY = "HYPERTROPHY";
/** Not a Goal row: the engine only copies goalId into the result. */
const CHECK_GOAL_ID = "program-checker";
const SAVED_PROGRAM_NAME = "Checked program";
const SAVED_DRAFT_LABEL = "From the Program Checker";

const hashInput = z.object({ hash: z.string().min(1).max(CHECK_LIMITS.maxHashLength) });
/** ARCH-067: days a week the lifter trains, when it differs from the days listed. The hash stays the program alone. */
const analyzeInput = hashInput.extend({ daysPerWeek: z.number().int().min(1).max(CHECK_LIMITS.maxDays).optional() });

export interface CheckAnalyzeResult {
  assessment: AssessmentResult;
  fitScore: FitScoreResult;
  namedActions: NamedAction[];
  /** ARCH-068: an unscored note, shown between the Fit line and the Strengths; null when it does not apply. */
  observation: FrequencyObservation | null;
  summary: { days: number; exercises: number; daysPerWeek: number };
}

function assertCheckEnabled(): void {
  if (!isCheckPublic()) throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
}

async function resolveHash(hash: string) {
  const program = decodeCompactProgram(hash);
  if (program === null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This link is not a valid program." });
  }
  const referenceData = await loadExerciseReferenceData({ goalProfileKey: CHECK_GOAL_PROFILE_KEY });
  const structure = toProgramStructure(program, new Map(referenceData.exercises.map((e) => [e.name, e.id])));
  if (!structure.ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unknown exercise: ${structure.unknownExercises.join(", ")}`,
    });
  }
  return { program, structure: structure.structure, referenceData };
}

export const checkRouter = router({
  /** The exercise library the parser matches against. Reference data, not user data. */
  exercises: publicProcedure.query(async (): Promise<ExerciseRecord[]> => {
    assertCheckEnabled();
    return listExercises();
  }),

  analyze: publicProcedure.input(analyzeInput).query(async ({ input }): Promise<CheckAnalyzeResult> => {
    assertCheckEnabled();
    const { program, structure, referenceData } = await resolveHash(input.hash);
    const config = goalProfileRegistry.get(CHECK_GOAL_PROFILE_KEY).loadConfig();

    // Same calls, in the same order, as analysis.previewAnalyze. The context is passed only when the lifter trains
    // a different number of days than the routine lists; equal (or absent) is the older, context-free read.
    const analysed = withoutRestDays(structure);
    const listedDays = analysed.workoutDays.length;
    const context: AnalysisContext | undefined =
      input.daysPerWeek !== undefined && input.daysPerWeek !== listedDays ? { daysPerWeek: input.daysPerWeek } : undefined;
    const analysis = computeAnalysis(analysed, referenceData, config, context !== undefined ? { context } : {});
    const assessment = computeAssessment(analysis, config, { goalId: CHECK_GOAL_ID });
    const fitScore = computeFitScore(assessment);
    // ARCH-068: the observation first, because when it says "add a training day" the whole-program action must say the
    // same, not offer sets on the days listed.
    const observation = frequencyObservation(analysis, analysed, referenceData, config, context);
    const namedActions = nameActions(assessment.assessment, analysed, referenceData, config, {
      ...(context !== undefined ? { context } : {}),
      addDay: observation !== null,
    });

    return {
      assessment,
      fitScore,
      namedActions,
      observation,
      summary: {
        days: program.days.length,
        exercises: program.days.reduce((n, d) => n + d.rows.length, 0),
        daysPerWeek: context?.daysPerWeek ?? listedDays,
      },
    };
  }),

  /** Signed-in only: the checked routine becomes the user's first Program with one draft. */
  save: protectedProcedure.input(hashInput).mutation(async ({ ctx, input }) => {
    assertCheckEnabled();
    const { structure } = await resolveHash(input.hash);
    const program = await createMyProgram(ctx.user.id, SAVED_PROGRAM_NAME);
    const draft = await createMyDraft(ctx.user.id, program.id, { label: SAVED_DRAFT_LABEL, baseVersionId: null });
    await updateMyDraftStructure(ctx.user.id, draft.id, structure as ProgramStructure);
    return { programId: program.id, draftId: draft.id };
  }),
});
