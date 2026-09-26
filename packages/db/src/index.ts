// Public surface of @training/db.
//
// Everything re-exported here returns plain TypeScript shapes — no Prisma
// types escape this package (ARCH-005). Callers in packages/api,
// packages/ai, and apps/web import from "@training/db" only.
//
// Phase 4 additions: the tx-aware write functions used by the commit service
// (createProgramVersionInTx, createRevisionInTx, createAssessmentSnapshotInTx,
// setActiveVersionInTx, markDraftCommittedInTx, createProgramInTx,
// createGoalInTx), the shared TRANSACTION_OPTIONS constant (ARCH-026), and
// read helpers (getLatestVersionForProgram, findLatestAssessmentSnapshotForVersion,
// findGoalProfileById, listAllInvolvements).
//
// Phase 5 additions: the Simulation repository surface — createSimulation,
// findSimulationById, and findAppliedRevisionForSimulation (the derived
// "applied" lookup that avoids a second source of truth for a fact the
// Revision table already encodes).

export { prisma } from "./client";

// User
export {
  findUserById,
  findUserByEmailWithHash,
  createUser,
  type UserRecord,
  type UserWithHash,
} from "./repositories/user";

// Program
export {
  createProgram,
  createProgramInTx,
  listProgramsByOwner,
  findProgramById,
  renameProgram,
  archiveProgram,
  setActiveVersionInTx,
  type ProgramRecord,
  type ProgramVisibility,
} from "./repositories/program";

// ProgramVersion / Revision / AssessmentSnapshot
export {
  findVersionById,
  listVersionsByProgram,
  getLatestVersionForProgram,
  findVersionWithStructure,
  findLatestAssessmentSnapshotForVersion,
  createProgramVersion,
  createProgramVersionInTx,
  createRevisionInTx,
  createAssessmentSnapshotInTx,
  getMaxVersionNumber,
  TRANSACTION_OPTIONS,
  type ProgramVersionRecord,
  type RevisionRecord,
  type AssessmentSnapshotRecord,
  type VersionOrigin,
  type RevisionTrigger,
  type AssessmentSnapshotReason,
  type CreateProgramVersionInput,
} from "./repositories/programVersion";

// Simulation (Phase 5)
export {
  createSimulation,
  findSimulationById,
  findAppliedRevisionForSimulation,
  type SimulationRecord,
  type CreateSimulationInput,
} from "./repositories/simulation";

// Draft
export {
  createDraft,
  findDraftById,
  listActiveDraftsByProgram,
  updateDraftStructure,
  discardDraft,
  markDraftCommittedInTx,
  type ProgramDraftRecord,
  type DraftStatus,
} from "./repositories/draft";

// Reference data
export {
  listExercises,
  findExerciseById,
  listMuscleGroups,
  listInvolvementsForExercise,
  listAllInvolvements,
  type ExerciseRecord,
  type MuscleGroupRecord,
  type ExerciseMuscleInvolvementRecord,
  type MovementPattern,
} from "./repositories/exercise";

// Goals
export {
  findGoalProfileByKey,
  findGoalProfileById,
  listGoalProfiles,
  createGoal,
  createGoalInTx,
  findGoalById,
  type GoalProfileDefinitionRecord,
  type GoalRecord,
} from "./repositories/goal";

// ─── Test helpers ─────────────────────────────────────────────────────────
//
// NOT for production code. Exposed so packages/api's integration tests can
// reuse the same FK-safe user cleanup the db-level tests use — duplicating
// the cleanup walk (which depends on FK order and the circular Program ↔
// ProgramVersion reference) would guarantee drift. A production import of
// `makeTestUser` or `cleanupTrackedUsers` should be treated as a bug in
// code review.
export {
  assertDefined,
  makeTestUser,
  cleanupTrackedUsers,
  cleanupUser,
} from "./repositories/tests/helpers";