// packages/api/src/services/reviewService.ts
//
// Orchestration for the Review screen (Phase 7).
//
// Review is a read-only aggregation over Phase 6 execution data plus the
// persisted COMMIT-time AssessmentSnapshot. It is NOT a stored entity — see
// 08-training-execution-and-evidence.md §Review.
//
// ARCH-015: Review reads the persisted COMMIT snapshot, not a live
// recompute. `getReview` returns the snapshot only. `recomputeAssessment`
// is a SEPARATE, explicit, opt-in path — it runs a fresh engine pass with
// the CURRENT goal-profile config and persists nothing. The two are never
// blended, and the UI must render them as visibly distinct.
//
// BLOCK_END snapshots are deferred to Phase 9+ (Phase 7 kickoff Q4b). At MVP
// the HYPERTROPHY config is UNVALIDATED, so a BLOCK_END snapshot would be a
// byte-identical copy of COMMIT with no purpose served. Review reads COMMIT
// only — enforced below by a defensive reason check that fails loudly if a
// future phase writes a non-COMMIT snapshot without updating this filter.
//
// Domain changes: none (Phase 7 phase file, "Domain changes: None new").
// Adherence aggregation is orchestration over rows, not a deterministic
// engine — it lives here, not in packages/domain.

import { TRPCError } from "@trpc/server";
import {
  findVersionById,
  findGoalById,
  findGoalProfileById,
  listExercises,
  listSessionsForBlock,
  listPerformanceRecordsForSession,
  listObservationsForBlock,
  findLatestAssessmentSnapshotForVersion,
  type ObservationRecord,
  type TrainingBlockRecord,
  type SessionRecord,
  type PerformanceRecordRecord,
  type AssessmentSnapshotRecord,
} from "@training/db";
import {
  computeAnalysis,
  computeAssessment,
  computeFitScore,
  goalProfileRegistry,
  type ProgramStructure,
  type WorkoutDayStructure,
  type ExercisePrescriptionStructure,
  type LoadScheme,
  type GoalProfileConfig,
  type Analysis,
  type AssessmentResult,
  type FitScoreResult,
} from "@training/domain";
import { loadOwnedTrainingBlockOrThrow } from "./loadOwnedExecution";
import { loadExerciseReferenceData } from "./referenceDataService";

// ---- ReviewData contract -------------------------------------------------
// Verbatim from 08-training-execution-and-evidence.md, with DeviationSummary
// extended per the Phase 7 kickoff exchange (added totalSetsForExercise).
// This shape is what Phase 8's Coach panel will also read — do not change it
// without logging a new DECISIONS entry.

export type DeviationKind =
  | "REPS_BELOW"
  | "REPS_ABOVE"
  | "LOAD_BELOW"
  | "LOAD_ABOVE"
  | "SETS_SKIPPED";

export interface DeviationSummary {
  exerciseId: string;
  exerciseName: string;
  kind: DeviationKind;
  occurrences: number;
  totalSetsForExercise: number;
  example: {
    sessionId: string;
    prescriptionId: string;
    prescribed: string; // service-formatted; the UI does not re-derive
    actual: string;     // service-formatted
  };
}

export interface ReviewAdherence {
  plannedSessions: number;
  completedSessions: number;
  systematicDeviations: DeviationSummary[];
}

// db-layer record; over the wire dates arrive as strings and Json columns
// arrive as unknown. Define ClientAssessmentSnapshot on the web side per the
// Phase 6 Client* convention.
export type ReviewAssessmentSnapshot = AssessmentSnapshotRecord;

export interface ReviewData {
  trainingBlockId: string;
  assessmentSnapshot: ReviewAssessmentSnapshot;
  adherence: ReviewAdherence;
  observations: ObservationRecord[];
  isPartial: boolean; // true if the block is still ACTIVE
}

// ---- Recompute contract (the opt-in comparison) --------------------------

export interface RecomputedAssessment {
  analysis: Analysis;
  assessment: AssessmentResult;
  fitScore: FitScoreResult;
}

// ---- Constants -----------------------------------------------------------

// A deviation is "systematic" once it has occurred at least this many times
// for the same (exercise, kind). Phase-7 provisional; logged as a Phase-7
// outstanding item in PROJECT_STATE at close-out.
const SYSTEMATIC_DEVIATION_THRESHOLD = 2;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ---- Public entrypoints --------------------------------------------------

/**
 * Read the Review for a TrainingBlock. Default view is the persisted COMMIT
 * AssessmentSnapshot (ARCH-015) — never a live recompute.
 *
 * Works for a COMPLETED block and for a still-ACTIVE one; the latter returns
 * `isPartial: true` and whatever data exists so far. No "you haven't
 * finished this yet" error — per 08-…, Review is available at any time.
 */
export async function getReview(
  userId: string,
  trainingBlockId: string,
): Promise<ReviewData> {
  const block = await loadOwnedTrainingBlockOrThrow(userId, trainingBlockId);

  // TrainingBlock has no programId; reach the Program via its version.
  const version = await findVersionById(block.programVersionId);
  if (!version) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Training block references a missing ProgramVersion",
    });
  }

  const snapshot = await findLatestAssessmentSnapshotForVersion(version.id);
  if (!snapshot) {
    // A committed ProgramVersion always has a COMMIT snapshot — Phase 4
    // wrote it in the same transaction as the version. Its absence is an
    // invariant violation, not a normal user-facing state.
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "No COMMIT-time AssessmentSnapshot exists for this block's ProgramVersion",
    });
  }

  // Defensive: at MVP every snapshot is COMMIT (BLOCK_END is deferred to
  // Phase 9). If a future phase writes non-COMMIT snapshots without updating
  // findLatestAssessmentSnapshotForVersion to accept a reason filter, fail
  // loudly rather than silently showing the wrong snapshot as the default
  // Review view.
  if (snapshot.reason !== "COMMIT") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        `Latest AssessmentSnapshot for this version has reason ` +
        `"${snapshot.reason}", not COMMIT. Review's default view requires ` +
        `a COMMIT snapshot (ARCH-015). The repository's find function needs ` +
        `a reason filter before BLOCK_END snapshots ship.`,
    });
  }

  // Read everything the adherence pass needs in parallel, then aggregate.
  const [sessions, observations, allExercises] = await Promise.all([
    listSessionsForBlock(trainingBlockId),
    listObservationsForBlock(trainingBlockId),
    listExercises(),
  ]);

  const recordsBySession = await Promise.all(
    sessions.map((s) => listPerformanceRecordsForSession(s.id)),
  );

  const nameById = new Map<string, string>();
  for (const e of allExercises) nameById.set(e.id, e.name);

  const structure = version.structureSnapshot as ProgramStructure;

  const adherence = computeAdherence({
    block,
    structure,
    sessions,
    recordsBySession,
    nameById,
    now: new Date(),
  });

  return {
    trainingBlockId,
    assessmentSnapshot: snapshot,
    adherence,
    observations,
    isPartial: block.status === "ACTIVE",
  };
}

/**
 * The opt-in "recompute with current thresholds" action.
 *
 * Runs a fresh engine pass over the version's structure using the CURRENT
 * goal-profile config, persisting nothing. At MVP the config is UNVALIDATED
 * so the result is unvalidated too — but the mechanism is in place for
 * Phase 9 to make it meaningful. Deliberately NOT the default view
 * (ARCH-015); the UI must render it as visually distinct.
 */
export async function recomputeAssessment(
  userId: string,
  trainingBlockId: string,
): Promise<RecomputedAssessment> {
  const block = await loadOwnedTrainingBlockOrThrow(userId, trainingBlockId);

  const version = await findVersionById(block.programVersionId);
  if (!version) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Training block references a missing ProgramVersion",
    });
  }

  const snapshot = await findLatestAssessmentSnapshotForVersion(version.id);
  if (!snapshot) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "No COMMIT-time AssessmentSnapshot exists for this block's ProgramVersion",
    });
  }
  if (snapshot.reason !== "COMMIT") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        `Latest AssessmentSnapshot for this version has reason ` +
        `"${snapshot.reason}", not COMMIT.`,
    });
  }

  // Use the HISTORICAL goal from the snapshot so the recompute isolates
  // "what would the current config say about this same design + goal" — not
  // "what would it say about a possibly-different goal". The Program's
  // currentGoalId is deliberately not consulted.
  const [referenceData, config] = await Promise.all([
    loadExerciseReferenceData(),
    loadGoalProfileConfigForGoal(snapshot.goalId),
  ]);

  const structure = version.structureSnapshot as ProgramStructure;

  // Positional signatures match programVersionService's usage.
  const analysis = computeAnalysis(structure, referenceData, config);
  const assessment = computeAssessment(analysis, config, {
    goalId: snapshot.goalId,
  });
  const fitScore = computeFitScore(assessment);

  return { analysis, assessment, fitScore };
}

// ---- Adherence computation ----------------------------------------------

interface AdherenceInput {
  block: TrainingBlockRecord;
  structure: ProgramStructure;
  sessions: SessionRecord[];
  recordsBySession: PerformanceRecordRecord[][];
  nameById: Map<string, string>;
  now: Date;
}

function computeAdherence(input: AdherenceInput): ReviewAdherence {
  const { block, structure, sessions, recordsBySession, nameById, now } =
    input;

  // --- plannedSessions: linear-expectation form (Phase 7 kickoff Q1(c)). --
  //   daysElapsed     = floor((now - block.startedAt) / 1 day)
  //   sessionsPerWeek = number of WorkoutDays in the version's structure
  //   plannedSessions = floor((daysElapsed / 7) * sessionsPerWeek)
  // Provisional: how "expected so far" is measured is a product decision
  // not signed off. Logged as a Phase-7 outstanding item.
  const daysElapsed = Math.floor(
    (now.getTime() - block.startedAt.getTime()) / MS_PER_DAY,
  );
  const sessionsPerWeek = structure.workoutDays.length;
  const plannedSessions =
    daysElapsed <= 0 || sessionsPerWeek === 0
      ? 0
      : Math.floor((daysElapsed / 7) * sessionsPerWeek);

  const completedSessions = sessions.filter(
    (s) => s.status === "COMPLETED",
  ).length;

  // --- Prescription lookup -------------------------------------------------
  // Presupposes normalized WorkoutDay / ExercisePrescription row ids match
  // the ids embedded in structureSnapshot (ARCH-012: rows are a
  // regenerated-never-edited projection of the snapshot).
  const prescriptionsById = new Map<string, ExercisePrescriptionStructure>();
  const exerciseIdOfPrescription = new Map<string, string>();
  for (const day of structure.workoutDays) {
    for (const p of day.prescriptions) {
      prescriptionsById.set(p.id, p);
      exerciseIdOfPrescription.set(p.id, p.exerciseId);
    }
  }

  type Bucket = {
    exerciseId: string;
    kind: DeviationKind;
    occurrences: number;
    example: DeviationSummary["example"];
  };
  const buckets = new Map<string, Bucket>();
  const totalSetsForExercise = new Map<string, number>();

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    if (!session) continue;
    const records = recordsBySession[i] ?? [];

    const loggedCountByPrescription = new Map<string, number>();

    for (const r of records) {
      const exerciseId = exerciseIdOfPrescription.get(
        r.exercisePrescriptionId,
      );
      if (!exerciseId) continue;

      loggedCountByPrescription.set(
        r.exercisePrescriptionId,
        (loggedCountByPrescription.get(r.exercisePrescriptionId) ?? 0) + 1,
      );
      totalSetsForExercise.set(
        exerciseId,
        (totalSetsForExercise.get(exerciseId) ?? 0) + 1,
      );

      const p = prescriptionsById.get(r.exercisePrescriptionId);
      if (!p) continue;

      if (r.actualReps != null) {
        if (r.actualReps < p.targetRepsLow) {
          addDeviation(buckets, {
            exerciseId,
            kind: "REPS_BELOW",
            example: {
              sessionId: session.id,
              prescriptionId: p.id,
              prescribed: formatPrescribedReps(p),
              actual: formatActual(r.actualReps, r.actualLoad),
            },
          });
        } else if (r.actualReps > p.targetRepsHigh) {
          addDeviation(buckets, {
            exerciseId,
            kind: "REPS_ABOVE",
            example: {
              sessionId: session.id,
              prescriptionId: p.id,
              prescribed: formatPrescribedReps(p),
              actual: formatActual(r.actualReps, r.actualLoad),
            },
          });
        }
      }

      // Load deviations — only meaningful for FIXED_WEIGHT schemes.
      if (
        r.actualLoad != null &&
        p.loadScheme.type === "FIXED_WEIGHT" &&
        r.actualLoad !== p.loadScheme.weight
      ) {
        addDeviation(buckets, {
          exerciseId,
          kind:
            r.actualLoad < p.loadScheme.weight ? "LOAD_BELOW" : "LOAD_ABOVE",
          example: {
            sessionId: session.id,
            prescriptionId: p.id,
            prescribed: formatLoad(p.loadScheme),
            actual: formatActual(r.actualReps, r.actualLoad),
          },
        });
      }
    }

    // SETS_SKIPPED — only for COMPLETED sessions. A still-in-progress
    // session hasn't "skipped" anything; the user just hasn't finished.
    if (session.status === "COMPLETED") {
      const day = findWorkoutDayById(structure, session.workoutDayId);
      if (day) {
        for (const p of day.prescriptions) {
          const logged = loggedCountByPrescription.get(p.id) ?? 0;
          if (logged < p.targetSets) {
            addDeviation(buckets, {
              exerciseId: p.exerciseId,
              kind: "SETS_SKIPPED",
              example: {
                sessionId: session.id,
                prescriptionId: p.id,
                prescribed: `${p.targetSets} sets`,
                actual: `${logged} ${logged === 1 ? "set" : "sets"} logged`,
              },
            });
          }
        }
      }
    }
  }

  const systematicDeviations: DeviationSummary[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.occurrences < SYSTEMATIC_DEVIATION_THRESHOLD) continue;
    systematicDeviations.push({
      exerciseId: bucket.exerciseId,
      exerciseName: nameById.get(bucket.exerciseId) ?? bucket.exerciseId,
      kind: bucket.kind,
      occurrences: bucket.occurrences,
      totalSetsForExercise:
        totalSetsForExercise.get(bucket.exerciseId) ?? 0,
      example: bucket.example,
    });
  }

  systematicDeviations.sort((a, b) => {
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    if (a.exerciseId !== b.exerciseId) {
      return a.exerciseId < b.exerciseId ? -1 : 1;
    }
    return a.kind < b.kind ? -1 : 1;
  });

  return { plannedSessions, completedSessions, systematicDeviations };
}

// ---- Helpers -------------------------------------------------------------

function addDeviation(
  buckets: Map<
    string,
    {
      exerciseId: string;
      kind: DeviationKind;
      occurrences: number;
      example: DeviationSummary["example"];
    }
  >,
  input: {
    exerciseId: string;
    kind: DeviationKind;
    example: DeviationSummary["example"];
  },
): void {
  const key = `${input.exerciseId}|${input.kind}`;
  const existing = buckets.get(key);
  if (existing) {
    existing.occurrences += 1;
    return;
  }
  buckets.set(key, {
    exerciseId: input.exerciseId,
    kind: input.kind,
    occurrences: 1,
    example: input.example,
  });
}

function findWorkoutDayById(
  structure: ProgramStructure,
  workoutDayId: string,
): WorkoutDayStructure | undefined {
  return structure.workoutDays.find((d) => d.id === workoutDayId);
}

function formatPrescribedReps(p: ExercisePrescriptionStructure): string {
  if (p.targetRepsLow === p.targetRepsHigh) {
    return `${p.targetRepsLow} reps`;
  }
  return `${p.targetRepsLow}-${p.targetRepsHigh} reps`;
}

function formatLoad(scheme: LoadScheme): string {
  switch (scheme.type) {
    case "PERCENT_1RM":
      return `${scheme.percent}% of 1RM`;
    case "RPE_BASED":
      return `RPE ${scheme.rpe}`;
    case "FIXED_WEIGHT":
      return `${scheme.weight}${scheme.unit}`;
    case "BODYWEIGHT":
      return "bodyweight";
  }
}

function formatActual(reps: number | null, load: number | null): string {
  const repsPart = reps != null ? `${reps} reps` : "— reps";
  if (load == null) return repsPart;
  return `${repsPart} @ ${load}`;
}

/**
 * Three-hop resolution, matching the pattern already inlined in
 * programVersionService.ts, analysis.ts, and simulationService.ts:
 *
 *   Goal → goalProfileId → GoalProfileDefinition → key →
 *     goalProfileRegistry.get(key).loadConfig()
 *
 * Uses the HISTORICAL goalId from the snapshot so the recompute isolates
 * the threshold change, not a possible goal change.
 *
 * Phase-7 cleanup candidate: extract into a shared helper and migrate all
 * four sites. Deferred per the kickoff exchange.
 */
async function loadGoalProfileConfigForGoal(
  goalId: string,
): Promise<GoalProfileConfig> {
  const goal = await findGoalById(goalId);
  if (!goal) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Goal not found",
    });
  }
  const profileRow = await findGoalProfileById(goal.goalProfileId);
  if (!profileRow) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "GoalProfileDefinition not found for Goal",
    });
  }
  const definition = goalProfileRegistry.get(profileRow.key);
  if (!definition) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `No goal profile registered for key "${profileRow.key}"`,
    });
  }
  return definition.loadConfig();
}