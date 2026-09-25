// Pure domain types for ProgramStructure and its nested entities.
//
// This file is intentionally minimal in Phase 1: it defines exactly the
// five types named in phases/phase-01-domain-and-database.md, matching
// 03-domain-model.md verbatim. MutationSpec, Analysis, Assessment, and
// SimulationResult are NOT defined here — 03-domain-model.md explicitly
// reserves them for 05-, 06-, and 07- to avoid drift between documents.
//
// These types are framework-free and dependency-free. packages/db maps
// between these and the Prisma rows; packages/api and packages/ai consume
// them directly.

/**
 * The four evidence categories every AI claim beyond a raw Analysis/
 * Assessment payload must be tagged with. For non-AI screens the category
 * is implicit by data source (see 03-domain-model.md); the literal tag is
 * required specifically for AI Coach output, where a single response can
 * blend all four categories.
 */
export type EvidenceTag = "PLANNED" | "EXECUTED" | "OBSERVED" | "INTERPRETED";

/**
 * How a prescription's load is expressed. A discriminated union so the
 * Builder and the Analysis engine can switch exhaustively.
 */
export type LoadScheme =
  | { type: "PERCENT_1RM"; percent: number }
  | { type: "RPE_BASED"; rpe: number }
  | { type: "FIXED_WEIGHT"; weight: number; unit: "kg" | "lb" }
  | { type: "BODYWEIGHT" };

export interface ExercisePrescriptionStructure {
  id: string;
  orderIndex: number;
  exerciseId: string;
  targetSets: number;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe?: number;
  loadScheme: LoadScheme;
}

export interface WorkoutDayStructure {
  id: string;
  orderIndex: number;
  name: string;
  prescriptions: ExercisePrescriptionStructure[];
}

/**
 * The canonical shape of a ProgramVersion's structural content.
 * Persisted verbatim as ProgramVersion.structureSnapshot (JSON) and
 * mirrored as normalized WorkoutDay/ExercisePrescription rows — see
 * ARCH-012. The snapshot is authoritative; the rows are a derived
 * projection of the same data, written in the same transaction.
 *
 * Goal is never a field here — Assessment is f(ProgramVersion, Goal),
 * with Goal supplied at query time (invariant 4).
 */
export interface ProgramStructure {
  workoutDays: WorkoutDayStructure[];
}