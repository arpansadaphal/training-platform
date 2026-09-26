// tRPC router for Exercise reference data.
//
// Read-only. The Builder's exercise picker and the future AI Coach both need
// the exercise catalog; nothing user-writable exists here (reference data is
// seeded, not user-owned — see 03-domain-model.md).

import { router, protectedProcedure } from "../trpc";
import { listExercises, type ExerciseRecord } from "@training/db";

export const exerciseRouter = router({
  listAll: protectedProcedure.query(
    async (): Promise<ExerciseRecord[]> => listExercises(),
  ),
});