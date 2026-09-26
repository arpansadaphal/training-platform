// tRPC router for live Analysis preview.
//
// previewAnalyze is a query that reads the draft's currently-persisted
// structure and runs the deterministic engine over it — Analysis,
// Assessment, Fit Score — WITHOUT persisting anything. The Builder calls it
// after each save-draft to refresh the panel; the engine's output is not
// cached or stored here (that only happens at commit time).
//
// Non-persisting is load-bearing: 07-versioning-and-simulation.md separates
// "preview" from "commit" precisely so a user exploring edits does not create
// versions. previewAnalyze is the preview side of that separation; the
// commit side lives in programVersion.commitFromDraft.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  computeAnalysis,
  computeAssessment,
  computeFitScore,
  goalProfileRegistry,
  type AssessmentResult,
  type Analysis,
  type FitScoreResult,
  type ProgramStructure,
} from "@training/domain";
import { findDraftById, findGoalById, findGoalProfileById } from "@training/db";
import { router, protectedProcedure } from "../trpc";
import { loadOwnedProgramOrThrow } from "../services/loadOwnedProgram";
import { loadExerciseReferenceData } from "../services/referenceDataService";

const draftIdSchema = z.string().min(1);

export interface PreviewAnalyzeResult {
  analysis: Analysis;
  assessment: AssessmentResult;
  fitScore: FitScoreResult;
}

export const analysisRouter = router({
  previewAnalyze: protectedProcedure
    .input(z.object({ draftId: draftIdSchema }))
    .query(async ({ ctx, input }): Promise<PreviewAnalyzeResult> => {
      const draft = await findDraftById(input.draftId);
      if (!draft) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      }

      // Ownership via the program, not the draft — the draft has no owner
      // field, and the program is the resource whose access is being checked.
      const program = await loadOwnedProgramOrThrow(ctx.user.id, draft.programId);

      if (!program.currentGoalId) {
        throw new Error(
          `Program ${program.id} has no currentGoalId — createMyProgram should have set one`,
        );
      }
      const goalId: string = program.currentGoalId;

      const goal = await findGoalById(goalId);
      if (!goal) {
        throw new Error(
          `Program.currentGoalId references missing Goal ${goalId}`,
        );
      }
      const profileRow = await findGoalProfileById(goal.goalProfileId);
      if (!profileRow) {
        throw new Error(
          `Goal.goalProfileId references missing GoalProfileDefinition ${goal.goalProfileId}`,
        );
      }
      const config = goalProfileRegistry.get(profileRow.key).loadConfig();

      const referenceData = await loadExerciseReferenceData();
      const structure = draft.structure as ProgramStructure;

      const analysis = computeAnalysis(structure, referenceData, config);
      const assessment = computeAssessment(analysis, config, { goalId });
      const fitScore = computeFitScore(assessment);

      // Returned as-is; the UI narrows on the discriminated unions
      // (AssessmentResult.kind, FitScoreResult.kind) and on AxisStatus.kind
      // within Analysis's axisResults before rendering a band. The router
      // does not unwrap — unwrapping here would defeat the type-level
      // guarantee and force a second, equally-fallible narrowing downstream.
      return { analysis, assessment, fitScore };
    }),
});