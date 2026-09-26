// tRPC router for MuscleGroup reference data.
//
// Read-only. May be unused by the Phase 4 Builder UI — added now so the
// Builder's assessment panel has labels to render axis scopeKeys with (a
// VOLUME axis on scopeKey="chest" reads more clearly as "Chest volume" than
// as "chest volume"). If Phase 4 ends up not needing it, the router stays —
// it's two lines and Phase 7's Review will want it.

import { router, protectedProcedure } from "../trpc";
import { listMuscleGroups, type MuscleGroupRecord } from "@training/db";

export const muscleGroupRouter = router({
  listAll: protectedProcedure.query(
    async (): Promise<MuscleGroupRecord[]> => listMuscleGroups(),
  ),
});