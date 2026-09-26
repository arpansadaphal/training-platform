// Root tRPC router. Routers are organized by domain capability, not by
// UI page (see 01-architecture-recommendation.md decision #4).
//
// Phase 4 additions: draft, analysis, programVersion, exercise, muscleGroup.
// Phase 5 addition:  simulation.
// Phase 6 additions: training, session, performance, observation — the
//                    training-execution surface (TrainingBlock lifecycle,
//                    workout Session generation + status transitions, set
//                    logging, and observation capture).

import { router } from "./trpc";
import { userRouter } from "./routers/user";
import { programRouter } from "./routers/program";
import { draftRouter } from "./routers/draft";
import { analysisRouter } from "./routers/analysis";
import { programVersionRouter } from "./routers/programVersion";
import { exerciseRouter } from "./routers/exercise";
import { muscleGroupRouter } from "./routers/muscleGroup";
import { simulationRouter } from "./routers/simulation";
import { trainingRouter } from "./routers/training";
import { sessionRouter } from "./routers/session";
import { performanceRouter } from "./routers/performance";
import { observationRouter } from "./routers/observation";

export const appRouter = router({
  user: userRouter,
  program: programRouter,
  draft: draftRouter,
  analysis: analysisRouter,
  programVersion: programVersionRouter,
  exercise: exerciseRouter,
  muscleGroup: muscleGroupRouter,
  simulation: simulationRouter,
  training: trainingRouter,
  session: sessionRouter,
  performance: performanceRouter,
  observation: observationRouter,
});

export type AppRouter = typeof appRouter;