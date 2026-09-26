import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";
import {
  StaleDraftError,
  DraftNotActiveError,
  StaleSimulationError,
  SimulationAlreadyAppliedError,
} from "./errors";

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    // Explicit per-type projection. Never forward `error.cause` raw — it can
    // carry internal Prisma/DB details (SQL fragments, connection strings in
    // some edge cases) that must not reach a client. Only the four error
    // classes below are allow-listed; everything else omits `cause` entirely.
    const safeCause =
      error instanceof StaleDraftError
        ? {
            code: error.appCode,
            draftId: error.draftId,
            baseVersionId: error.baseVersionId,
            currentVersionId: error.currentVersionId,
          }
        : error instanceof DraftNotActiveError
          ? {
              code: error.appCode,
              draftId: error.draftId,
              draftStatus: error.draftStatus,
            }
          : error instanceof StaleSimulationError
            ? {
                code: error.appCode,
                simulationId: error.simulationId,
                baseVersionId: error.baseVersionId,
                currentVersionId: error.currentVersionId,
              }
            : error instanceof SimulationAlreadyAppliedError
              ? {
                  code: error.appCode,
                  simulationId: error.simulationId,
                  appliedAsVersionId: error.appliedAsVersionId,
                }
              : undefined;

    return {
      ...shape,
      data: {
        ...shape.data,
        cause: safeCause,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  // Narrow ctx.user from ContextUser | null to ContextUser for downstream.
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});