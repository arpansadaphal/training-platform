// Public surface of @training/db.
//
// Everything re-exported here returns plain TypeScript shapes — no Prisma
// types escape this package (ARCH-005). Callers in packages/api,
// packages/ai, and apps/web import from "@training/db" only.
//
// Phase 6 additions: the training-execution surface — TrainingBlock,
// Session, PerformanceRecord, Observation repositories. Notably,
// PerformanceRecord's record type carries `actualLoad: number | null` and
// `actualRpe: number | null`, NOT Prisma.Decimal — the repository converts
// Decimal → number at this boundary so no Prisma type reaches the wire.
// This is the first Decimal on the wire in the codebase and establishes the
// convention: convert at the repository boundary, `Number(decimal)` on read
// and `new Prisma.Decimal(number)` on write.
//
// Also Phase 6: archiveProgramInTx, added so the archive-Program flow can
// close the Program's open TrainingBlock in the same transaction that sets
// archivedAt (kickoff fix A6).

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
  archiveProgramInTx,
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

// TrainingBlock (Phase 6)
export {
  findTrainingBlockById,
  findActiveTrainingBlockForProgram,
  findActiveTrainingBlockForProgramInTx,
  listTrainingBlocksForProgram,
  createTrainingBlockInTx,
  closeTrainingBlockInTx,
  countCompletedSessionsInBlock,
  countCompletedSessionsForBlockInTx,
  type TrainingBlockRecord,
  type TrainingBlockStatus,
  type CreateTrainingBlockInput,
} from "./repositories/trainingBlock";

// Session (Phase 6)
export {
  findSessionById,
  listSessionsForBlock,
  findLatestSessionForBlock,
  findActiveSessionForBlock,
  createSession,
  createSessionInTx,
  updateSessionStatus,
  type SessionRecord,
  type SessionStatus,
  type CreateSessionInput,
  type SessionStatusUpdate,
} from "./repositories/session";

// PerformanceRecord (Phase 6)
export {
  createPerformanceRecord,
  createPerformanceRecordsBatch,
  listPerformanceRecordsForSession,
  type PerformanceRecordRecord,
  type CreatePerformanceRecordInput,
} from "./repositories/performanceRecord";

// Observation (Phase 6)
export {
  createObservation,
  findObservationById,
  listObservationsForBlock,
  listObservationsForSession,
  type ObservationRecord,
  type CreateObservationInput,
} from "./repositories/observation";

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