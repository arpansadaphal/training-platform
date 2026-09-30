# 04 — Database Schema (PART D)

Illustrative Prisma schema — concrete enough to implement from directly, but treat field/relation names as adjustable during Phase 1, not gospel. **No numeric values anywhere below are real scientific thresholds** — see the `validated: boolean` pattern under GoalProfileDefinition and `05-analysis-engine.md`.

## Two explicit design decisions worth reading before the schema

**1. `ProgramVersion` stores both a normalized structure (WorkoutDay/ExercisePrescription rows) and a canonical `structureSnapshot` JSON blob.**
The snapshot is the single source of truth, written once at commit time. The normalized rows are a **derived, queryable projection of that same snapshot**, generated in the same transaction and never independently edited afterward. Rationale: normalized rows give queryability (e.g., "which versions across all users prescribe back squat") and enable a clean structural diff between two versions for history-view display; the immutable snapshot guarantees historical reproducibility even if the row-level schema evolves later (a new field added to `ExercisePrescription` in 2027 doesn't retroactively change what a 2026 version's snapshot means). This is the resolution — flagged explicitly rather than silently decided — to a tension the Final Freeze doesn't fully spell out: normalized rows are convenient, but only a frozen snapshot is truly immutable against future schema drift. If this proves to be unneeded complexity in practice (normalized rows never get queried directly), it is safe to drop them and derive everything from the snapshot on demand — see `18-architecture-sanity-check.md`.

**2. `AssessmentSnapshot` is persisted at exactly two moments: Commit, and TrainingBlock-end/Review.**
Analysis and Assessment are deterministic functions and could always be recomputed live. But if goal-profile thresholds are later revised (expected — they start `[SCIENTIFIC INPUT REQUIRED]`), a live recompute of an *old* version's Assessment would show the user a different verdict than the one they actually saw and acted on. Persisting a snapshot at Commit and at Review time preserves "what you actually saw" as the historical record, while a "recompute with current thresholds" action remains available as an explicit, clearly-labeled, opt-in comparison. **This is an architecture-level recommendation, not a product decision reversal — flagged for product sign-off**, since it has a real UX dimension (does Review show what you saw then, or fresh analysis now?). Logged as `ARCH-015` in `DECISIONS.md`.

## Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ───────────────────────── Identity ─────────────────────────

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String?
  displayName  String
  createdAt    DateTime @default(now())

  programs             Program[]
  constraints          Constraint[]
  temporaryConstraints TemporaryConstraint[]
  aiConversations      AIConversation[]
  observations         Observation[]
  receivedShares       ProgramShare[] @relation("ShareRecipient")
}

// ───────────────────────── Goals ─────────────────────────

model GoalProfileDefinition {
  id            String   @id @default(cuid())
  key           String   @unique          // e.g. "HYPERTROPHY"
  displayName   String
  configVersion String                    // bump on any threshold/weight change
  thresholds    Json                      // GoalProfileConfig shape — see 05-analysis-engine.md
  validated     Boolean  @default(false)  // launch gate: must be true before production use
  sourceNote    String                    // provenance of the numbers, or "UNRESOLVED — SCIENTIFIC INPUT REQUIRED"
  createdAt     DateTime @default(now())

  goals Goal[]
}

model Goal {
  id            String   @id @default(cuid())
  goalProfileId String
  goalProfile   GoalProfileDefinition @relation(fields: [goalProfileId], references: [id])
  params        Json     @default("{}")   // reserved for future per-instance goal parameters
  createdAt     DateTime @default(now())

  programsCurrentlyUsing Program[] @relation("CurrentGoal")
}

// ───────────────────── Programs & Drafts ─────────────────────

enum ProgramVisibility {
  PRIVATE
  SHARED
  PUBLIC
}

model Program {
  id                          String   @id @default(cuid())
  ownerUserId                 String
  owner                       User     @relation(fields: [ownerUserId], references: [id])
  name                        String
  currentGoalId               String?
  currentGoal                 Goal?    @relation("CurrentGoal", fields: [currentGoalId], references: [id])
  activeVersionId              String?  @unique
  activeVersion                ProgramVersion? @relation("ActiveVersion", fields: [activeVersionId], references: [id])
  visibility                   ProgramVisibility @default(PRIVATE)  // column exists MVP; SHARED/PUBLIC unused until Phase 10
  publicShowsExecutionHistory  Boolean  @default(false)
  archivedAt                   DateTime?
  createdAt                    DateTime @default(now())
  updatedAt                    DateTime @updatedAt

  drafts      ProgramDraft[]
  versions    ProgramVersion[] @relation("VersionsOfProgram")
  revisions   Revision[]
  simulations Simulation[]
  shares      ProgramShare[]
}

enum DraftStatus {
  ACTIVE
  COMMITTED
  DISCARDED
}

model ProgramDraft {
  id                    String   @id @default(cuid())
  programId             String
  program               Program  @relation(fields: [programId], references: [id])
  baseVersionId         String?
  baseVersion           ProgramVersion? @relation(fields: [baseVersionId], references: [id])
  label                 String              // e.g. "Option A — more chest volume"; supports side-by-side comparison
  structure             Json                // mutable ProgramStructure while ACTIVE
  status                DraftStatus @default(ACTIVE)
  committedAsVersionId  String?  @unique
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([programId, status])
}

// ─────────────────── ProgramVersion & structure ───────────────────

enum VersionOrigin {
  MANUAL_COMMIT
  AI_APPLIED_SIMULATION
}

model ProgramVersion {
  id                String   @id @default(cuid())
  programId         String
  program           Program  @relation("VersionsOfProgram", fields: [programId], references: [id])
  versionNumber     Int
  structureSnapshot Json                    // immutable — authoritative ProgramStructure as committed
  createdVia        VersionOrigin
  createdAt         DateTime @default(now())

  activeForProgram    Program?    @relation("ActiveVersion")
  workoutDays         WorkoutDay[]          // derived projection of structureSnapshot — see note above
  assessmentSnapshots AssessmentSnapshot[]
  trainingBlocks      TrainingBlock[]
  draftsBasedOnThis   ProgramDraft[]
  revisionsFrom       Revision[]  @relation("RevisionFrom")
  revisionsTo         Revision[]  @relation("RevisionTo")
  simulationsFromHere Simulation[]

  @@unique([programId, versionNumber])
}

model WorkoutDay {
  id               String   @id @default(cuid())
  programVersionId String
  programVersion   ProgramVersion @relation(fields: [programVersionId], references: [id])
  orderIndex       Int
  name             String

  prescriptions ExercisePrescription[]
  sessions      Session[]

  @@unique([programVersionId, orderIndex])
}

model ExercisePrescription {
  id             String   @id @default(cuid())
  workoutDayId   String
  workoutDay     WorkoutDay @relation(fields: [workoutDayId], references: [id])
  orderIndex     Int
  exerciseId     String
  exercise       Exercise @relation(fields: [exerciseId], references: [id])
  targetSets     Int
  targetRepsLow  Int
  targetRepsHigh Int
  targetRpe      Decimal?
  loadScheme     Json                       // LoadScheme discriminated union — see 03-domain-model.md

  performanceRecords PerformanceRecord[]

  @@unique([workoutDayId, orderIndex])
}

// ───────────────────── Reference data ─────────────────────

enum MovementPattern {
  SQUAT
  HINGE
  HORIZONTAL_PUSH
  VERTICAL_PUSH
  HORIZONTAL_PULL
  VERTICAL_PULL
  CARRY
  ISOLATION
  OTHER
}

model Exercise {
  id              String   @id @default(cuid())
  name            String
  movementPattern MovementPattern
  equipment       String?
  createdAt       DateTime @default(now())

  prescriptions ExercisePrescription[]
  involvements  ExerciseMuscleInvolvement[]
}

model MuscleGroup {
  id   String @id @default(cuid())
  name String @unique

  involvements ExerciseMuscleInvolvement[]
}

model ExerciseMuscleInvolvement {
  exerciseId        String
  exercise          Exercise    @relation(fields: [exerciseId], references: [id])
  muscleGroupId     String
  muscleGroup       MuscleGroup @relation(fields: [muscleGroupId], references: [id])
  involvementFactor Decimal     // 0..1 — content data, reviewed alongside GoalProfile thresholds

  @@id([exerciseId, muscleGroupId])
}

// ───────────────────── Revisions & Simulation ─────────────────────

enum RevisionTrigger {
  MANUAL_COMMIT
  AI_APPLIED_SIMULATION
}

model Revision {
  id                 String   @id @default(cuid())
  programId          String
  program            Program  @relation(fields: [programId], references: [id])
  fromVersionId      String?
  fromVersion        ProgramVersion? @relation("RevisionFrom", fields: [fromVersionId], references: [id])
  toVersionId        String
  toVersion          ProgramVersion  @relation("RevisionTo", fields: [toVersionId], references: [id])
  trigger            RevisionTrigger
  sourceSimulationId String?
  sourceSimulation   Simulation? @relation(fields: [sourceSimulationId], references: [id])
  userNote           String?
  createdAt          DateTime @default(now())
}

model Simulation {
  id                      String   @id @default(cuid())
  programId               String
  program                 Program  @relation(fields: [programId], references: [id])
  baseVersionId           String
  baseVersion             ProgramVersion @relation(fields: [baseVersionId], references: [id])
  goalId                  String
  mutationSpec            Json
  resultAnalysis          Json
  resultAssessment        Json
  diff                    Json               // Gain/Cost/Net + What-Changed payload
  createdByConversationId String?
  createdByConversation   AIConversation? @relation(fields: [createdByConversationId], references: [id])
  createdAt               DateTime @default(now())

  revisionsSourced Revision[]

  @@index([programId, baseVersionId])
}

enum AssessmentSnapshotReason {
  COMMIT
  BLOCK_END
  MANUAL_RECOMPUTE
}

model AssessmentSnapshot {
  id               String   @id @default(cuid())
  programVersionId String
  programVersion   ProgramVersion @relation(fields: [programVersionId], references: [id])
  goalId           String
  engineVersion    String
  thresholdsVersion String
  metrics          Json               // Analysis payload
  assessment       Json               // Assessment payload
  fitScore         Json
  reason           AssessmentSnapshotReason
  computedAt       DateTime @default(now())

  @@index([programVersionId, goalId, computedAt])
}

// ───────────────────── Training execution ─────────────────────

enum TrainingBlockStatus {
  ACTIVE
  COMPLETED
  ABANDONED
}

model TrainingBlock {
  id               String   @id @default(cuid())
  programVersionId String
  programVersion   ProgramVersion @relation(fields: [programVersionId], references: [id])
  userId           String                      // denormalized for query convenience
  status           TrainingBlockStatus @default(ACTIVE)
  plannedLengthWeeks Int?                       // informational only; not a hard constraint
  startedAt        DateTime @default(now())
  endedAt          DateTime?

  sessions     Session[]
  observations Observation[]

  @@index([userId, status])
}

enum SessionStatus {
  PLANNED
  IN_PROGRESS
  COMPLETED
  SKIPPED
}

model Session {
  id              String   @id @default(cuid())
  trainingBlockId String
  trainingBlock   TrainingBlock @relation(fields: [trainingBlockId], references: [id])
  workoutDayId    String
  workoutDay      WorkoutDay @relation(fields: [workoutDayId], references: [id])
  sequenceIndex   Int
  status          SessionStatus @default(PLANNED)
  scheduledDate   DateTime?
  startedAt       DateTime?
  completedAt     DateTime?

  performanceRecords PerformanceRecord[]
  observations       Observation[]

  @@index([trainingBlockId, sequenceIndex])
}

model PerformanceRecord {
  id                     String   @id @default(cuid())
  sessionId              String
  session                Session  @relation(fields: [sessionId], references: [id])
  exercisePrescriptionId String
  exercisePrescription   ExercisePrescription @relation(fields: [exercisePrescriptionId], references: [id])
  setIndex               Int
  actualReps             Int?
  actualLoad             Decimal?
  actualRpe              Decimal?
  completedAt            DateTime @default(now())

  @@index([sessionId])
}

model Observation {
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  sessionId        String?
  session          Session? @relation(fields: [sessionId], references: [id])
  trainingBlockId  String?
  trainingBlock    TrainingBlock? @relation(fields: [trainingBlockId], references: [id])
  content          String
  structuredFields Json?            // optional: sleep/stress/soreness ratings, etc.
  createdAt        DateTime @default(now())

  @@index([userId, createdAt])
}

// ───────────────────── Constraints ─────────────────────

enum ConstraintKind {
  EXERCISE_AVOIDANCE
  MOVEMENT_PATTERN_AVOIDANCE
  FREEFORM
}

model Constraint {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  kind            ConstraintKind
  exerciseId      String?
  movementPattern MovementPattern?
  note            String
  active          Boolean  @default(true)
  createdAt       DateTime @default(now())
}

model TemporaryConstraint {
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  aiConversationId String                  // scoped to a Coach conversation, NOT a workout Session
  aiConversation   AIConversation @relation(fields: [aiConversationId], references: [id])
  note             String
  createdAt        DateTime @default(now())
}

// ───────────────────── AI Coach ─────────────────────

enum AIMessageRole {
  USER
  ASSISTANT
  TOOL
}

model AIConversation {
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  programId        String?
  programVersionId String?
  createdAt        DateTime @default(now())
  lastMessageAt    DateTime @default(now())

  messages              AIMessage[]
  temporaryConstraints  TemporaryConstraint[]
  simulationsCreated    Simulation[]

  @@index([userId, lastMessageAt])
}

model AIMessage {
  id               String   @id @default(cuid())
  aiConversationId String
  aiConversation   AIConversation @relation(fields: [aiConversationId], references: [id])
  role             AIMessageRole
  segments         Json                     // structured content — array of {type, tag?, content, sourceRef?}
  rawToolCalls     Json?
  createdAt        DateTime @default(now())

  @@index([aiConversationId, createdAt])
}

// ───────────────────── Sharing (Phase 10 only) ─────────────────────

model ProgramShare {
  id                       String   @id @default(cuid())
  programId                String
  program                  Program  @relation(fields: [programId], references: [id])
  ownerUserId              String
  recipientUserId          String
  recipient                User     @relation("ShareRecipient", fields: [recipientUserId], references: [id])
  canViewExecutionHistory  Boolean  @default(false)
  createdAt                DateTime @default(now())
  revokedAt                DateTime?

  @@index([recipientUserId])
  @@index([programId])
}
```

## MVP vs. architecturally-anticipated vs. future-only

| Table | MVP (built + used) | Anticipated (column exists, unused) | Future-only (not created until its phase) |
|---|---|---|---|
| User, Program, ProgramDraft, ProgramVersion, WorkoutDay, ExercisePrescription, Exercise, MuscleGroup, ExerciseMuscleInvolvement, GoalProfileDefinition, Goal, Revision, Simulation, AssessmentSnapshot, TrainingBlock, Session, PerformanceRecord, Observation, Constraint, TemporaryConstraint, AIConversation, AIMessage | ✅ | | |
| `Program.visibility`, `Program.publicShowsExecutionHistory` | | ✅ (column present, only `PRIVATE` enforced) | |
| `ProgramShare` | | | ✅ Phase 10 |

No table exists in this schema "because the future product might need it" without a specific citation above justifying it now (per the instruction not to create unnecessary tables speculatively). `ProgramShare` is deliberately absent from the MVP migration even though it's fully designed here — see `phases/phase-01-domain-and-database.md` and `phases/phase-10-optional-extensions.md`.
