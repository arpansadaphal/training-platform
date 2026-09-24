import { router } from "./trpc";
import { userRouter } from "./routers/user";

/**
 * The root appRouter. Phase 0 mounts only `user`. Phase 1 onward adds
 * `program`, `programDraft`, `programVersion`, `analysis`, `assessment`,
 * `simulation`, `training`, `coach` — per 09-api-architecture.md.
 */
export const appRouter = router({
  user: userRouter,
});

export type AppRouter = typeof appRouter;