// packages/api/src/services/blockReportService.ts
//
// Orchestration for the Block Report (Phase 10b).
//
// The Block Report is a distinct retrospective artifact from Review:
// Review is Assessment-vs-execution, available for the current, still-
// ACTIVE block at any time. The Block Report is a closed-block
// retrospective — available only for COMPLETED or ABANDONED blocks. An
// ACTIVE block is Review's job; this service returns a discriminator so
// the route can render "This block is still in progress — see Review"
// without that being an error.
//
// Read-only over data that already exists:
//   - AssessmentSnapshot (COMMIT only — BLOCK_END is deferred, ARCH-041)
//   - PerformanceRecord
//   - Observation
//   - TrainingBlock (status, dates, and previous-block lookup)
//
// No new schema. No new data collection. No new write path. In-app only —
// Phase 10a's sharing is deferred, so there is no share/export/email path
// here, and the service returns no export-shaped output.
//
// Templated copy over real data. No AI-personalized framing in Phase 10b —
// an AI layer is a legitimate later enhancement, not this phase.
//
// Defensive JSON parsing: the snapshot's `.assessment` Json column is
// unwrapped as the AssessmentResult discriminated union
// ({ kind: "VALIDATED" | "UNVALIDATED"; assessment: Assessment }). Only a
// VALIDATED branch is comparable — an UNVALIDATED branch's classification
// fields may be empty/null when classification did not run to completion,
// so treating it as comparable would risk reporting "no differences" when
// the truth is "unable to compare." The raw snapshot is returned alongside
// the narrative so the UI can render it via AssessmentDisplay — the same
// discipline as reviewService.getReview.

import { TRPCError } from "@trpc/server";
import {
  findVersionById,
  findProgramById,
  listExercises,
  listSessionsForBlock,
  listPerformanceRecordsForSession,
  listObservationsForBlock,
  findLatestAssessmentSnapshotForVersion,
  listTrainingBlocksForProgram,
  type ObservationRecord,
  type TrainingBlockRecord,
  type AssessmentSnapshotRecord,
} from "@training/db";
import type { Assessment, ProgramStructure } from "@training/domain";
import { loadOwnedTrainingBlockOrThrow } from "./loadOwnedExecution";
import {
  computeAdherence,
  type DeviationSummary,
  type ReviewAssessmentSnapshot,
} from "./reviewService";

// ---- Return contract -----------------------------------------------------

export type BlockReportResult =
  | { kind: "ACTIVE"; blockId: string; programId: string }
  | { kind: "REPORT"; report: BlockReportData };

export interface PreviousBlockSummary {
  blockId: string;
  startedAt: Date;
  endedAt: Date | null;
  assessmentSnapshot: ReviewAssessmentSnapshot;
}

export interface BlockReportExecutionSummary {
  sessionsCompleted: number;
  totalSetsLogged: number;
  systematicDeviations: DeviationSummary[];
}

export interface BlockReportNarrative {
  executionLine: string;
  /** null if there are no systematic deviations at all. */
  deviationsLine: string | null;
  /**
   * Empty for a first block. Populated only when the previous block's
   * snapshot is VALIDATED and its headline findings can be extracted
   * confidently; otherwise carries a single "could not be compared" line.
   */
  previousComparisonLines: string[];
  /** Set only when this is the first block. null otherwise. */
  firstBlockLine: string | null;
}

export interface BlockReportData {
  blockId: string;
  programId: string;
  programName: string;
  versionId: string;
  versionNumber: number;
  status: "COMPLETED" | "ABANDONED";
  startedAt: Date;
  endedAt: Date | null;
  assessmentSnapshot: ReviewAssessmentSnapshot;
  execution: BlockReportExecutionSummary;
  observations: ObservationRecord[];
  /** null in the first-block case — the UI skips the comparison section. */
  previousBlock: PreviousBlockSummary | null;
  narrative: BlockReportNarrative;
}

// ---- Public entrypoint ---------------------------------------------------

export async function getBlockReport(
  userId: string,
  blockId: string,
): Promise<BlockReportResult> {
  const block = await loadOwnedTrainingBlockOrThrow(userId, blockId);

  const version = await findVersionById(block.programVersionId);
  if (!version) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Training block references a missing ProgramVersion",
    });
  }

  if (block.status === "ACTIVE") {
    return { kind: "ACTIVE", blockId: block.id, programId: version.programId };
  }

  const program = await findProgramById(version.programId);
  if (!program) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Training block references a missing Program",
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
        `"${snapshot.reason}", not COMMIT. Block Report requires a COMMIT ` +
        `snapshot (ARCH-015, ARCH-041). The repository's find function ` +
        `needs a reason filter before non-COMMIT snapshots ship.`,
    });
  }

  const [sessions, observations, allExercises, allBlocks] = await Promise.all([
    listSessionsForBlock(block.id),
    listObservationsForBlock(block.id),
    listExercises(),
    listTrainingBlocksForProgram(version.programId),
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
    now: block.endedAt ?? new Date(),
  });

  const totalSetsLogged = recordsBySession.reduce(
    (sum, records) => sum + records.length,
    0,
  );

  const previousBlockRecord = findPreviousBlock(allBlocks, block.id);
  const previousBlock = await loadPreviousBlockSummary(previousBlockRecord);

  const narrative = buildNarrative({
    sessionsCompleted: adherence.completedSessions,
    totalSetsLogged,
    systematicDeviations: adherence.systematicDeviations,
    previous: previousBlock,
    currentSnapshot: snapshot,
  });

  return {
    kind: "REPORT",
    report: {
      blockId: block.id,
      programId: version.programId,
      programName: program.name,
      versionId: version.id,
      versionNumber: version.versionNumber,
      status: block.status,
      startedAt: block.startedAt,
      endedAt: block.endedAt,
      assessmentSnapshot: snapshot,
      execution: {
        sessionsCompleted: adherence.completedSessions,
        totalSetsLogged,
        systematicDeviations: adherence.systematicDeviations,
      },
      observations,
      previousBlock,
      narrative,
    },
  };
}

// ---- Previous-block lookup ----------------------------------------------

function findPreviousBlock(
  allBlocks: TrainingBlockRecord[],
  currentBlockId: string,
): TrainingBlockRecord | null {
  const sorted = [...allBlocks].sort((a, b) => {
    const dt = a.startedAt.getTime() - b.startedAt.getTime();
    if (dt !== 0) return dt;
    return a.id < b.id ? -1 : 1;
  });
  const idx = sorted.findIndex((b) => b.id === currentBlockId);
  if (idx <= 0) return null;
  return sorted[idx - 1] ?? null;
}

async function loadPreviousBlockSummary(
  prev: TrainingBlockRecord | null,
): Promise<PreviousBlockSummary | null> {
  if (!prev) return null;
  if (prev.status === "ACTIVE") return null;

  const prevVersion = await findVersionById(prev.programVersionId);
  if (!prevVersion) return null;

  const prevSnapshot = await findLatestAssessmentSnapshotForVersion(
    prevVersion.id,
  );
  if (!prevSnapshot || prevSnapshot.reason !== "COMMIT") return null;

  return {
    blockId: prev.id,
    startedAt: prev.startedAt,
    endedAt: prev.endedAt,
    assessmentSnapshot: prevSnapshot,
  };
}

// ---- Narrative synthesis (templated, no AI) ------------------------------

interface BuildNarrativeInput {
  sessionsCompleted: number;
  totalSetsLogged: number;
  systematicDeviations: DeviationSummary[];
  previous: PreviousBlockSummary | null;
  currentSnapshot: AssessmentSnapshotRecord;
}

/**
 * Exported for the forbidden-language test. Pure — no I/O — so the test can
 * call it directly with fixture inputs rather than spinning up a test DB.
 */
export function buildNarrative(
  input: BuildNarrativeInput,
): BlockReportNarrative {
  const {
    sessionsCompleted,
    totalSetsLogged,
    systematicDeviations,
    previous,
    currentSnapshot,
  } = input;

  const executionLine =
    `You completed ${sessionsCompleted} ` +
    `${sessionsCompleted === 1 ? "session" : "sessions"} ` +
    `and logged ${totalSetsLogged} ` +
    `${totalSetsLogged === 1 ? "set" : "sets"} in this block.`;

  const deviationsLine =
    systematicDeviations.length === 0
      ? null
      : `Systematic deviations from the plan: ` +
        systematicDeviations
          .slice(0, 3)
          .map(formatDeviation)
          .join("; ") +
        (systematicDeviations.length > 3
          ? ` (and ${systematicDeviations.length - 3} more)`
          : "") +
        ".";

  const previousComparisonLines = previous
    ? buildPreviousComparisonLines(
        previous.assessmentSnapshot,
        currentSnapshot,
      )
    : [];

  const firstBlockLine = previous
    ? null
    : "This was your first block. Future reports compare against this one.";

  return {
    executionLine,
    deviationsLine,
    previousComparisonLines,
    firstBlockLine,
  };
}

function formatDeviation(d: DeviationSummary): string {
  const label = DEVIATION_LABELS[d.kind];
  return `${d.exerciseName} — ${label} (${d.occurrences}×)`;
}

const DEVIATION_LABELS: Record<DeviationSummary["kind"], string> = {
  REPS_BELOW: "reps below plan",
  REPS_ABOVE: "reps above plan",
  LOAD_BELOW: "load below plan",
  LOAD_ABOVE: "load above plan",
  SETS_SKIPPED: "sets skipped",
};

// ---- Previous-block comparison ------------------------------------------

function buildPreviousComparisonLines(
  prevSnapshot: AssessmentSnapshotRecord,
  currentSnapshot: AssessmentSnapshotRecord,
): string[] {
  const prevRead = readSnapshotAssessment(prevSnapshot.assessment);
  const curRead = readSnapshotAssessment(currentSnapshot.assessment);

  if (prevRead.kind !== "VALIDATED" || curRead.kind !== "VALIDATED") {
    return [
      "Your previous block's assessment could not be compared directly with this one.",
    ];
  }

  const prevSummary = trySummarizeAssessment(prevRead.assessment);
  const curSummary = trySummarizeAssessment(curRead.assessment);

  if (!prevSummary || !curSummary) {
    return [
      "Your previous block's assessment could not be compared directly with this one.",
    ];
  }

  const lines: string[] = [];

  if (
    prevSummary.biggestOpportunityLabel !==
    curSummary.biggestOpportunityLabel
  ) {
    const from = prevSummary.biggestOpportunityLabel ?? "none";
    const to = curSummary.biggestOpportunityLabel ?? "none";
    lines.push(`Biggest opportunity shifted from "${from}" to "${to}".`);
  }

  const prevStrengths = new Set(prevSummary.strengthLabels);
  const curStrengths = new Set(curSummary.strengthLabels);
  const addedStrengths = curSummary.strengthLabels.filter(
    (s) => !prevStrengths.has(s),
  );
  const droppedStrengths = prevSummary.strengthLabels.filter(
    (s) => !curStrengths.has(s),
  );
  if (addedStrengths.length > 0) {
    lines.push(
      `Strength(s) appearing this block: ${addedStrengths.join(", ")}.`,
    );
  }
  if (droppedStrengths.length > 0) {
    lines.push(
      `Strength(s) no longer present: ${droppedStrengths.join(", ")}.`,
    );
  }

  if (lines.length === 0) {
    lines.push(
      "The assessment's headline findings are unchanged from the previous block.",
    );
  }

  return lines;
}

// ---- Snapshot payload reading -------------------------------------------

type SnapshotAssessmentRead =
  | { kind: "VALIDATED"; assessment: Assessment }
  | { kind: "UNVALIDATED" }
  | { kind: "UNKNOWN" };

/**
 * Read a snapshot's `.assessment` Json column.
 *
 * Canonical shape (packages/domain/src/assessment/types.ts):
 *   AssessmentResult =
 *     | { kind: "VALIDATED"; assessment: Assessment }
 *     | { kind: "UNVALIDATED"; reason: string; assessment: Assessment }
 */
function readSnapshotAssessment(payload: unknown): SnapshotAssessmentRead {
  if (!payload || typeof payload !== "object") return { kind: "UNKNOWN" };
  const p = payload as Record<string, unknown>;

  if (p.kind === "VALIDATED") {
    const inner = p.assessment;
    if (inner && typeof inner === "object") {
      return { kind: "VALIDATED", assessment: inner as Assessment };
    }
    return { kind: "UNKNOWN" };
  }
  if (p.kind === "UNVALIDATED") {
    return { kind: "UNVALIDATED" };
  }

  // Defensive fallback: an older snapshot whose payload IS the inner
  // Assessment. This codebase has never written that shape; tolerated only
  // so an unexpectedly-shaped historical row does not crash the read.
  if ("overallSummary" in p || "strengths" in p || "biggestOpportunity" in p) {
    return { kind: "VALIDATED", assessment: p as unknown as Assessment };
  }
  return { kind: "UNKNOWN" };
}

interface AssessmentSummary {
  biggestOpportunityLabel: string | null;
  strengthLabels: string[];
}

function trySummarizeAssessment(
  assessment: Assessment,
): AssessmentSummary | null {
  const biggestOpportunity = assessment.biggestOpportunity;
  const biggestOpportunityLabel = axisLabel(biggestOpportunity);
  if (biggestOpportunity && !biggestOpportunityLabel) return null;

  const strengthLabels: string[] = [];
  for (const s of assessment.strengths) {
    const l = axisLabel(s);
    if (!l) return null;
    strengthLabels.push(l);
  }

  return { biggestOpportunityLabel, strengthLabels };
}

/**
 * Extract an identifier for an AssessedAxis.
 *
 * AssessedAxis extends AnalysisAxisResult (minus `status`) and carries
 * `axisType` (AxisType) and `scopeKey` (string | null). It has no display-
 * label field. The composite `${axisType}:${scopeKey}` is developer-shaped,
 * not user-facing — acceptable at MVP because the comparison branch never
 * executes while every snapshot is UNVALIDATED (ARCH-032). A future phase
 * that ships VALIDATED snapshots should introduce a friendly display-name
 * lookup; see PROJECT_STATE.md's Phase-10 outstanding items.
 */
function axisLabel(axis: unknown): string | null {
  if (!axis || typeof axis !== "object") return null;
  const o = axis as Record<string, unknown>;
  const axisType = firstString(o, "axisType");
  const scopeKey = firstString(o, "scopeKey");
  if (axisType && scopeKey) return `${axisType}:${scopeKey}`;
  if (scopeKey) return scopeKey;
  if (axisType) return axisType;
  return null;
}

function firstString(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === "string" ? v : null;
}