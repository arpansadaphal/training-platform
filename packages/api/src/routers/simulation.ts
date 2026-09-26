// tRPC router for Simulation.
//
// One procedure: `simulate`. It applies a MutationSpec to the Program's
// active version, persists a Simulation row (except for INVALID_MUTATION,
// which has nothing to persist), and returns both the row id and the full
// SimulationResult.
//
// The response shape is `{ simulationId, result }` rather than just
// SimulationResult because the client needs the id to call
// programVersion.commitFromSimulation later. On INVALID_MUTATION,
// simulationId is null — the caller inspects result.kind and narrates the
// failure; it does not attempt a commit.
//
// The manual UI panel (apps/web) is the only Phase 5 caller. Phase 8's Coach
// tool handler will call the underlying service function directly
// (simulationService.simulateAndPersist), not this procedure — same service,
// no HTTP round-trip. See phase-05 kickoff "commitFromMutation's final
// two-call-site signature".

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { simulateAndPersist } from "../services/simulationService";
import { mutationSpecSchema } from "../schemas/mutation";

const programIdSchema = z.string().min(1);

export const simulationRouter = router({
  simulate: protectedProcedure
    .input(
      z.object({
        programId: programIdSchema,
        mutation: mutationSpecSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      simulateAndPersist(ctx.user.id, input.programId, input.mutation),
    ),
});