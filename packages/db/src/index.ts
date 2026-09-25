// Public surface of @training/db.
//
// Everything re-exported here returns plain TypeScript shapes — no Prisma
// types escape this package (ARCH-005). Callers in packages/api,
// packages/ai, and apps/web import from "@training/db" only.

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
  listProgramsByOwner,
  findProgramById,
  renameProgram,
  archiveProgram,
  type ProgramRecord,
  type ProgramVisibility,
} from "./repositories/program";

// ProgramVersion
export {
  findVersionById,
  listVersionsByProgram,
  findVersionWithStructure,
  createProgramVersion,
  getMaxVersionNumber,
  type ProgramVersionRecord,
  type VersionOrigin,
} from "./repositories/programVersion";

// Draft
export {
  createDraft,
  findDraftById,
  listActiveDraftsByProgram,
  updateDraftStructure,
  discardDraft,
  type ProgramDraftRecord,
  type DraftStatus,
} from "./repositories/draft";

// Reference data
export {
  listExercises,
  findExerciseById,
  listMuscleGroups,
  listInvolvementsForExercise,
  type ExerciseRecord,
  type MuscleGroupRecord,
  type ExerciseMuscleInvolvementRecord,
  type MovementPattern,
} from "./repositories/exercise";

// Goals
export {
  findGoalProfileByKey,
  listGoalProfiles,
  createGoal,
  findGoalById,
  type GoalProfileDefinitionRecord,
  type GoalRecord,
} from "./repositories/goal";