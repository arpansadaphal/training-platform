-- CreateEnum
CREATE TYPE "ProgramVisibility" AS ENUM ('PRIVATE', 'SHARED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('ACTIVE', 'COMMITTED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "VersionOrigin" AS ENUM ('MANUAL_COMMIT', 'AI_APPLIED_SIMULATION');

-- CreateEnum
CREATE TYPE "MovementPattern" AS ENUM ('SQUAT', 'HINGE', 'HORIZONTAL_PUSH', 'VERTICAL_PUSH', 'HORIZONTAL_PULL', 'VERTICAL_PULL', 'CARRY', 'ISOLATION', 'OTHER');

-- CreateEnum
CREATE TYPE "RevisionTrigger" AS ENUM ('MANUAL_COMMIT', 'AI_APPLIED_SIMULATION');

-- CreateEnum
CREATE TYPE "AssessmentSnapshotReason" AS ENUM ('COMMIT', 'BLOCK_END', 'MANUAL_RECOMPUTE');

-- CreateEnum
CREATE TYPE "TrainingBlockStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ConstraintKind" AS ENUM ('EXERCISE_AVOIDANCE', 'MOVEMENT_PATTERN_AVOIDANCE', 'FREEFORM');

-- CreateEnum
CREATE TYPE "AIMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- AlterTable: rename name → displayName with backfill (per ARCH-024)
-- Non-destructive: rename preserves existing data; UPDATE covers NULL rows before SET NOT NULL.
ALTER TABLE "User" RENAME COLUMN "name" TO "displayName";
UPDATE "User" SET "displayName" = 'Anonymous' WHERE "displayName" IS NULL;
ALTER TABLE "User" ALTER COLUMN "displayName" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "GoalProfileDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "configVersion" TEXT NOT NULL,
    "thresholds" JSONB NOT NULL,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "sourceNote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalProfileDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "goalProfileId" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentGoalId" TEXT,
    "activeVersionId" TEXT,
    "visibility" "ProgramVisibility" NOT NULL DEFAULT 'PRIVATE',
    "publicShowsExecutionHistory" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramDraft" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "baseVersionId" TEXT,
    "label" TEXT NOT NULL,
    "structure" JSONB NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'ACTIVE',
    "committedAsVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramVersion" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "structureSnapshot" JSONB NOT NULL,
    "createdVia" "VersionOrigin" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutDay" (
    "id" TEXT NOT NULL,
    "programVersionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "WorkoutDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExercisePrescription" (
    "id" TEXT NOT NULL,
    "workoutDayId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "targetSets" INTEGER NOT NULL,
    "targetRepsLow" INTEGER NOT NULL,
    "targetRepsHigh" INTEGER NOT NULL,
    "targetRpe" DECIMAL(65,30),
    "loadScheme" JSONB NOT NULL,

    CONSTRAINT "ExercisePrescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "movementPattern" "MovementPattern" NOT NULL,
    "equipment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MuscleGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "MuscleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseMuscleInvolvement" (
    "exerciseId" TEXT NOT NULL,
    "muscleGroupId" TEXT NOT NULL,
    "involvementFactor" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "ExerciseMuscleInvolvement_pkey" PRIMARY KEY ("exerciseId","muscleGroupId")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "fromVersionId" TEXT,
    "toVersionId" TEXT NOT NULL,
    "trigger" "RevisionTrigger" NOT NULL,
    "sourceSimulationId" TEXT,
    "userNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Simulation" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "baseVersionId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "mutationSpec" JSONB NOT NULL,
    "resultAnalysis" JSONB NOT NULL,
    "resultAssessment" JSONB NOT NULL,
    "diff" JSONB NOT NULL,
    "createdByConversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Simulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSnapshot" (
    "id" TEXT NOT NULL,
    "programVersionId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "thresholdsVersion" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "assessment" JSONB NOT NULL,
    "fitScore" JSONB NOT NULL,
    "reason" "AssessmentSnapshotReason" NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingBlock" (
    "id" TEXT NOT NULL,
    "programVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TrainingBlockStatus" NOT NULL DEFAULT 'ACTIVE',
    "plannedLengthWeeks" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "TrainingBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "trainingBlockId" TEXT NOT NULL,
    "workoutDayId" TEXT NOT NULL,
    "sequenceIndex" INTEGER NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'PLANNED',
    "scheduledDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "exercisePrescriptionId" TEXT NOT NULL,
    "setIndex" INTEGER NOT NULL,
    "actualReps" INTEGER,
    "actualLoad" DECIMAL(65,30),
    "actualRpe" DECIMAL(65,30),
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "trainingBlockId" TEXT,
    "content" TEXT NOT NULL,
    "structuredFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Constraint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ConstraintKind" NOT NULL,
    "exerciseId" TEXT,
    "movementPattern" "MovementPattern",
    "note" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Constraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemporaryConstraint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aiConversationId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemporaryConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT,
    "programVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" TEXT NOT NULL,
    "aiConversationId" TEXT NOT NULL,
    "role" "AIMessageRole" NOT NULL,
    "segments" JSONB NOT NULL,
    "rawToolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoalProfileDefinition_key_key" ON "GoalProfileDefinition"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Program_activeVersionId_key" ON "Program"("activeVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramDraft_committedAsVersionId_key" ON "ProgramDraft"("committedAsVersionId");

-- CreateIndex
CREATE INDEX "ProgramDraft_programId_status_idx" ON "ProgramDraft"("programId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramVersion_programId_versionNumber_key" ON "ProgramVersion"("programId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutDay_programVersionId_orderIndex_key" ON "WorkoutDay"("programVersionId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ExercisePrescription_workoutDayId_orderIndex_key" ON "ExercisePrescription"("workoutDayId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "MuscleGroup_name_key" ON "MuscleGroup"("name");

-- CreateIndex
CREATE INDEX "Simulation_programId_baseVersionId_idx" ON "Simulation"("programId", "baseVersionId");

-- CreateIndex
CREATE INDEX "AssessmentSnapshot_programVersionId_goalId_computedAt_idx" ON "AssessmentSnapshot"("programVersionId", "goalId", "computedAt");

-- CreateIndex
CREATE INDEX "TrainingBlock_userId_status_idx" ON "TrainingBlock"("userId", "status");

-- CreateIndex
CREATE INDEX "Session_trainingBlockId_sequenceIndex_idx" ON "Session"("trainingBlockId", "sequenceIndex");

-- CreateIndex
CREATE INDEX "PerformanceRecord_sessionId_idx" ON "PerformanceRecord"("sessionId");

-- CreateIndex
CREATE INDEX "Observation_userId_createdAt_idx" ON "Observation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIConversation_userId_lastMessageAt_idx" ON "AIConversation"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "AIMessage_aiConversationId_createdAt_idx" ON "AIMessage"("aiConversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_goalProfileId_fkey" FOREIGN KEY ("goalProfileId") REFERENCES "GoalProfileDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_currentGoalId_fkey" FOREIGN KEY ("currentGoalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "ProgramVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDraft" ADD CONSTRAINT "ProgramDraft_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDraft" ADD CONSTRAINT "ProgramDraft_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "ProgramVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramVersion" ADD CONSTRAINT "ProgramVersion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutDay" ADD CONSTRAINT "WorkoutDay_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExercisePrescription" ADD CONSTRAINT "ExercisePrescription_workoutDayId_fkey" FOREIGN KEY ("workoutDayId") REFERENCES "WorkoutDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExercisePrescription" ADD CONSTRAINT "ExercisePrescription_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseMuscleInvolvement" ADD CONSTRAINT "ExerciseMuscleInvolvement_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseMuscleInvolvement" ADD CONSTRAINT "ExerciseMuscleInvolvement_muscleGroupId_fkey" FOREIGN KEY ("muscleGroupId") REFERENCES "MuscleGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_fromVersionId_fkey" FOREIGN KEY ("fromVersionId") REFERENCES "ProgramVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_toVersionId_fkey" FOREIGN KEY ("toVersionId") REFERENCES "ProgramVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_sourceSimulationId_fkey" FOREIGN KEY ("sourceSimulationId") REFERENCES "Simulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "ProgramVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_createdByConversationId_fkey" FOREIGN KEY ("createdByConversationId") REFERENCES "AIConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSnapshot" ADD CONSTRAINT "AssessmentSnapshot_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingBlock" ADD CONSTRAINT "TrainingBlock_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_trainingBlockId_fkey" FOREIGN KEY ("trainingBlockId") REFERENCES "TrainingBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_workoutDayId_fkey" FOREIGN KEY ("workoutDayId") REFERENCES "WorkoutDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecord" ADD CONSTRAINT "PerformanceRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecord" ADD CONSTRAINT "PerformanceRecord_exercisePrescriptionId_fkey" FOREIGN KEY ("exercisePrescriptionId") REFERENCES "ExercisePrescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_trainingBlockId_fkey" FOREIGN KEY ("trainingBlockId") REFERENCES "TrainingBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Constraint" ADD CONSTRAINT "Constraint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryConstraint" ADD CONSTRAINT "TemporaryConstraint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryConstraint" ADD CONSTRAINT "TemporaryConstraint_aiConversationId_fkey" FOREIGN KEY ("aiConversationId") REFERENCES "AIConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_aiConversationId_fkey" FOREIGN KEY ("aiConversationId") REFERENCES "AIConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
