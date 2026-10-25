// tRPC router for the training journal and data export (Project 4).
//
// Read-only. The entries and the CSV come from @training/domain's progress/
// functions; see services/journalService.ts for the loading layer.

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { exportTrainingCsv, getJournalPage, JOURNAL_PAGE_SIZE } from "../services/journalService";

export const journalRouter = router({
  get: protectedProcedure
    .input(
      z.object({
        /** ISO `completedAt` of the oldest entry already shown. */
        before: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(50).default(JOURNAL_PAGE_SIZE),
      }),
    )
    .query(({ ctx, input }) => getJournalPage(ctx.user.id, input)),
  exportCsv: protectedProcedure.query(({ ctx }) => exportTrainingCsv(ctx.user.id)),
});
