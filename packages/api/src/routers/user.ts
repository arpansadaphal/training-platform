import { findUserById } from "@training/db";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc";

/**
 * Phase 0's ONLY real procedure. See phase-00-foundation.md:
 * "user.getSelf — the only real procedure. Everything else in
 *  09-api-architecture.md is out of scope for this phase."
 */
export const userRouter = router({
  getSelf: protectedProcedure.query(async ({ ctx }) => {
    const user = await findUserById(ctx.user.id);
    if (!user) {
      // The JWT is valid but the user row is gone (deleted account, etc.).
      // Treat as unauthorized rather than a 500.
      throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
    }
    return user;
  }),
});