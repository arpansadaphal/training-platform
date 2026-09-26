// Repository layer for Simulation.
//
// A Simulation is an immutable record once created — no update path exists.
// "Applied" is not a stored field: it is detected by the presence of a
// Revision whose sourceSimulationId points at this Simulation (see
// findAppliedRevisionForSimulation). That keeps the schema free of a second
// source of truth for a fact the Revision row already encodes, and it matches
// the Phase 1 schema exactly — no migration in Phase 5.
//
// The persisted shape maps SimulationResult onto the three non-null Json
// columns the schema froze:
//
//   resultAnalysis   ← the MUTATED Analysis  (the "after" side)
//   resultAssessment ← the MUTATED AssessmentResult
//   diff             ← { kind, baseAnalysis, baseAssessment, ... }
//                       (Gain/Cost/Net + What-Changed for COMPUTED;
//                        reason-only marker for CANNOT_COMPUTE)
//
// The translation lives in the service (packages/api/src/services/simulationService.ts),
// not here — this file is a dumb read/write boundary. It receives whatever
// the service hands it and never inspects the payload.

import { type Prisma } from "@prisma/client";
import { prisma } from "../client";

export interface SimulationRecord {
  id: string;
  programId: string;
  baseVersionId: string;
  goalId: string;
  mutationSpec: unknown; // MutationSpec
  resultAnalysis: unknown; // Analysis (mutated side)
  resultAssessment: unknown; // AssessmentResult (mutated side)
  diff: unknown; // { kind, baseAnalysis, baseAssessment, ... }
  createdByConversationId: string | null;
  createdAt: Date;
}

const SIMULATION_SELECT = {
  id: true,
  programId: true,
  baseVersionId: true,
  goalId: true,
  mutationSpec: true,
  resultAnalysis: true,
  resultAssessment: true,
  diff: true,
  createdByConversationId: true,
  createdAt: true,
} as const;

export interface CreateSimulationInput {
  programId: string;
  baseVersionId: string;
  goalId: string;
  mutationSpec: unknown; // MutationSpec
  resultAnalysis: unknown; // Analysis (mutated side)
  resultAssessment: unknown; // AssessmentResult (mutated side)
  diff: unknown; // { kind, baseAnalysis, baseAssessment, ... }
  createdByConversationId?: string | null;
}

/**
 * Writes a Simulation row. No transaction needed at the Phase 5 call sites:
 * the write is a single-statement INSERT with no dependencies on other rows
 * it produces or reads.
 *
 * `as Prisma.InputJsonValue` casts are the same boundary enforcement as in
 * programVersion.ts (ARCH-010): the caller has a plain domain value; Prisma
 * wants an InputJsonValue; the cast says "yes, this is JSON-serializable" and
 * keeps Prisma types out of the repository's public interface.
 */
export async function createSimulation(
  input: CreateSimulationInput,
): Promise<SimulationRecord> {
  return prisma.simulation.create({
    data: {
      programId: input.programId,
      baseVersionId: input.baseVersionId,
      goalId: input.goalId,
      mutationSpec: input.mutationSpec as Prisma.InputJsonValue,
      resultAnalysis: input.resultAnalysis as Prisma.InputJsonValue,
      resultAssessment: input.resultAssessment as Prisma.InputJsonValue,
      diff: input.diff as Prisma.InputJsonValue,
      createdByConversationId: input.createdByConversationId ?? null,
    },
    select: SIMULATION_SELECT,
  });
}

export async function findSimulationById(
  id: string,
): Promise<SimulationRecord | null> {
  return prisma.simulation.findUnique({
    where: { id },
    select: SIMULATION_SELECT,
  });
}

/**
 * Returns the Revision that applied this Simulation, or null if none has.
 *
 * "Applied" is derived, not stored: the Revision table's sourceSimulationId
 * FK is the single source of truth for "this simulation was applied to
 * produce a new version". commitFromSimulation calls this before proceeding
 * so a second apply attempt on the same Simulation is rejected rather than
 * silently creating a duplicate Revision.
 */
export async function findAppliedRevisionForSimulation(simulationId: string) {
  return prisma.revision.findFirst({
    where: { sourceSimulationId: simulationId },
    select: {
      id: true,
      programId: true,
      toVersionId: true,
      createdAt: true,
    },
  });
}