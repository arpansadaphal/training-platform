// packages/api/src/routers/blockReport.ts
//
// tRPC surface for the Block Report (Phase 10b).
//
// One procedure: `get`. Ownership and non-disclosure are enforced inside
// the service (loadOwnedTrainingBlockOrThrow → NOT_FOUND for a non-owner
// per ARCH-040). The router adds nothing but input validation and
// context wiring.
//
// The return value is the service's BlockReportResult discriminated union.
// An ACTIVE block returns { kind: "ACTIVE", ... } — a normal page state,
// not an error. The route renders an in-progress fallback for it. Do not
// turn it into a TRPCError here.

import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { getBlockReport } from "../services/blockReportService";

export const blockReportRouter = router({
  get: protectedProcedure
    .input(z.object({ blockId: z.string().min(1) }))
    .query(async ({ ctx, input }) => getBlockReport(ctx.user.id, input.blockId)),
});