// Root tRPC router. Routers are organized by domain capability, not by
// UI page (see 01-architecture-recommendation.md decision #4).
//
// Phase 4 additions: draft, analysis, programVersion (the Builder's
// Build↔Analyze↔Commit loop), plus the two read-only reference-data
// routers (exercise, muscleGroup) the Builder's exercise picker needs.
//
// Phase 5 addition: simulation (the simulate side of the Apply flow).

import { router } from "./trpc";
import { userRouter } from "./routers/user";
import { programRouter } from "./routers/program";
import { draftRouter } from "./routers/draft";
import { analysisRouter } from "./routers/analysis";
import { programVersionRouter } from "./routers/programVersion";
import { exerciseRouter } from "./routers/exercise";
import { muscleGroupRouter } from "./routers/muscleGroup";
import { simulationRouter } from "./routers/simulation";

export const appRouter = router({
  user: userRouter,
  program: programRouter,
  draft: draftRouter,
  analysis: analysisRouter,
  programVersion: programVersionRouter,
  exercise: exerciseRouter,
  muscleGroup: muscleGroupRouter,
  simulation: simulationRouter,
});

export type AppRouter = typeof appRouter;