// Root tRPC router. Routers are organized by domain capability, not by
// UI page (see 01-architecture-recommendation.md decision #4).

import { router } from "./trpc";
import { userRouter } from "./routers/user";
import { programRouter } from "./routers/program";

export const appRouter = router({
  user: userRouter,
  program: programRouter,
});

export type AppRouter = typeof appRouter;