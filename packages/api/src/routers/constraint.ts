import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  createConstraint,
  deleteOwnedConstraint,
  listConstraintsForUser,
  loadOwnedConstraint,
  updateOwnedConstraint,
} from '../services/constraintService';
import { protectedProcedure, router } from '../trpc';

/**
 * constraint router — persistent, user-level Constraints.
 *
 * Scope: Constraints attach to a User, not a Program (see 03-domain-model.md
 * and the Phase 1 schema). The dedicated /app/constraints route is what
 * surfaces them, and this router is its backing API.
 *
 * NOT to be confused with TemporaryConstraint, which is scoped to a Coach
 * conversation and lives in the coach router's `getConversation` payload.
 * Different lifecycle, different scope, different UI.
 *
 * The Coach's `note_constraint` tool writes to the same table through the
 * same service. A constraint created by the Coach and one created by the
 * user-facing form are indistinguishable in the database — the note_constraint
 * write is visible here, editable here, and deletable here, which is the
 * Final Freeze §17 "writes are never silent" requirement in structural form.
 *
 * Error codes per ARCH-040:
 *   - Ownership/existence failures: NOT_FOUND.
 *   - Shape/membership violations: BAD_REQUEST.
 */

const constraintKindSchema = z.enum([
  'EXERCISE_AVOIDANCE',
  'MOVEMENT_PATTERN_AVOIDANCE',
  'FREEFORM',
]);

const constraintIdInput = z.object({ id: z.string().min(1) });

const createConstraintInput = z.object({
  kind: constraintKindSchema,
  note: z.string().trim().min(1).max(2000),
});

const updateConstraintInput = z.object({
  id: z.string().min(1),
  kind: constraintKindSchema,
  note: z.string().trim().min(1).max(2000),
});

export const constraintRouter = router({
  /**
   * List the user's own constraints. Returns newest-first, capped.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await listConstraintsForUser({
      userId: ctx.user.id,
      limit: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      note: r.note,
      createdAtISO: r.createdAt.toISOString(),
    }));
  }),

  /**
   * Load one constraint by id. Ownership-checked.
   */
  get: protectedProcedure
    .input(constraintIdInput)
    .query(async ({ ctx, input }) => {
      const row = await loadOwnedConstraint({
        userId: ctx.user.id,
        constraintId: input.id,
      });
      if (!row) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Constraint not found.',
        });
      }
      return {
        id: row.id,
        kind: row.kind,
        note: row.note,
        createdAtISO: row.createdAt.toISOString(),
      };
    }),

  /**
   * Create a constraint from the user-facing form.
   *
   * This is a fully supported path, not a workaround for the Coach's absence:
   * a user who knows what they want to avoid should not have to open a chat
   * to record it.
   */
  create: protectedProcedure
    .input(createConstraintInput)
    .mutation(async ({ ctx, input }) => {
      const row = await createConstraint({
        userId: ctx.user.id,
        kind: input.kind,
        note: input.note,
      });
      return {
        id: row.id,
        kind: row.kind,
        note: row.note,
        createdAtISO: row.createdAt.toISOString(),
      };
    }),

  /**
   * Full update — kind and note both. Per the Phase 8 UI ruling, this is a
   * form edit, not delete-and-recreate: the row keeps its id (and any future
   * references to that id, such as Revision provenance or AI-note backlinks,
   * survive the edit).
   */
  update: protectedProcedure
    .input(updateConstraintInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await loadOwnedConstraint({
        userId: ctx.user.id,
        constraintId: input.id,
      });
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Constraint not found.',
        });
      }
      const row = await updateOwnedConstraint({
        userId: ctx.user.id,
        constraintId: input.id,
        kind: input.kind,
        note: input.note,
      });
      return {
        id: row.id,
        kind: row.kind,
        note: row.note,
        createdAtISO: row.createdAt.toISOString(),
      };
    }),

  /**
   * Delete a constraint. Idempotent in the sense that the caller learns the
   * truth either way — but a delete of a non-owned constraint returns
   * NOT_FOUND, not success (ARCH-040).
   */
  delete: protectedProcedure
    .input(constraintIdInput)
    .mutation(async ({ ctx, input }) => {
      const deleted = await deleteOwnedConstraint({
        userId: ctx.user.id,
        constraintId: input.id,
      });
      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Constraint not found.',
        });
      }
      return { id: input.id };
    }),
});