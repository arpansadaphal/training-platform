// packages/api/src/services/identityService.ts
//
// The /app landing screen's single aggregation. One procedure, one fan-out,
// so the page renders with a single round trip rather than five-to-six
// parallel reads across four routers.
//
// "Primary Program" is a Phase-7 product choice, not derived from the
// freeze: the Program the user is currently training. Resolution order:
//   1. A non-archived Program with an ACTIVE TrainingBlock.
//   2. Otherwise, the most recently created non-archived Program.
//   3. Otherwise, null (a user with no Programs).
// If two Programs have ACTIVE blocks — an invariant-level oddity at MVP —
// the most recently started block wins; ties break on Program.createdAt.
//
// Headline stats are lifetime-scope, primary-Program-scope, per the Phase 7
// kickoff exchange: sessionsCompleted, totalSetsLogged, versionsCommitted.
// No streak, no "current week" — the phase file warns against
// streak-as-hero-stat.

import {
  listProgramsByOwner,
  findActiveTrainingBlockForProgram,
  findVersionById,
  listVersionsByProgram,
  countCompletedSessionsForProgram,
  countPerformanceRecordsForProgram,
  findActiveSessionForBlock,
  type TrainingBlockRecord,
  type ProgramRecord,
} from "@training/db";
import type { ProgramStructure } from "@training/domain";

export interface IdentitySummaryActiveVersion {
  id: string;
  versionNumber: number;
  createdAt: Date;
}

export interface IdentitySummaryCurrentBlock {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
  startedAt: Date;
  plannedLengthWeeks: number | null;
}

export interface IdentitySummaryCurrentSession {
  id: string;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
  workoutDayName: string;
  sequenceIndex: number;
}

export interface IdentitySummaryProgram {
  id: string;
  name: string;
  activeVersion: IdentitySummaryActiveVersion | null;
  currentBlock: IdentitySummaryCurrentBlock | null;
}

export interface IdentitySummaryStats {
  sessionsCompleted: number;
  totalSetsLogged: number;
  versionsCommitted: number;
}

export interface IdentitySummary {
  primaryProgram: IdentitySummaryProgram | null;
  /** Read-only: an existing PLANNED / IN_PROGRESS Session, or null. Never creates one. */
  currentSession: IdentitySummaryCurrentSession | null;
  stats: IdentitySummaryStats;
}

export async function getMyIdentitySummary(
  userId: string,
): Promise<IdentitySummary> {
  const programs = await listProgramsByOwner(userId, {
    includeArchived: false,
  });

  const primary = await pickPrimaryProgram(programs);

  if (!primary) {
    return {
      primaryProgram: null,
      currentSession: null,
      stats: {
        sessionsCompleted: 0,
        totalSetsLogged: 0,
        versionsCommitted: 0,
      },
    };
  }

  // --- Active version ------------------------------------------------------
  let activeVersionInfo: IdentitySummaryActiveVersion | null = null;
  let activeVersionStructure: ProgramStructure | null = null;
  if (primary.activeVersionId) {
    const v = await findVersionById(primary.activeVersionId);
    if (v) {
      activeVersionInfo = {
        id: v.id,
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
      };
      activeVersionStructure = v.structureSnapshot as ProgramStructure;
    }
  }

  // --- Current block -------------------------------------------------------
  const block = await findActiveTrainingBlockForProgram(primary.id);
  const currentBlock: IdentitySummaryCurrentBlock | null = block
    ? {
        id: block.id,
        status: block.status,
        startedAt: block.startedAt,
        plannedLengthWeeks: block.plannedLengthWeeks,
      }
    : null;

  // --- Current session (READ-ONLY — never creates) -------------------------
  // session.getOrCreateNext is the MUTATING path and is called only from
  // /train. Rendering /app must not create a Session.
  let currentSession: IdentitySummaryCurrentSession | null = null;
  if (block && activeVersionStructure) {
    const s = await findActiveSessionForBlock(block.id);
    if (s) {
      currentSession = {
        id: s.id,
        status: s.status,
        sequenceIndex: s.sequenceIndex,
        workoutDayName: resolveWorkoutDayName(
          activeVersionStructure,
          s.workoutDayId,
        ),
      };
    }
  }

  // --- Stats (primary-Program scope, lifetime) -----------------------------
  const [sessionsCompleted, totalSetsLogged, versions] = await Promise.all([
    countCompletedSessionsForProgram(primary.id),
    countPerformanceRecordsForProgram(primary.id),
    listVersionsByProgram(primary.id),
  ]);

  return {
    primaryProgram: {
      id: primary.id,
      name: primary.name,
      activeVersion: activeVersionInfo,
      currentBlock,
    },
    currentSession,
    stats: {
      sessionsCompleted,
      totalSetsLogged,
      versionsCommitted: versions.length,
    },
  };
}

// ---- Helpers -------------------------------------------------------------

async function pickPrimaryProgram(
  programs: ProgramRecord[],
): Promise<ProgramRecord | null> {
  if (programs.length === 0) return null;

  // Prefer one with an ACTIVE block.
  const withActiveBlock: {
    program: ProgramRecord;
    block: TrainingBlockRecord;
  }[] = [];
  for (const p of programs) {
    const block = await findActiveTrainingBlockForProgram(p.id);
    if (block) withActiveBlock.push({ program: p, block });
  }

  if (withActiveBlock.length > 0) {
    withActiveBlock.sort((a, b) => {
      const dt = b.block.startedAt.getTime() - a.block.startedAt.getTime();
      if (dt !== 0) return dt;
      return b.program.createdAt.getTime() - a.program.createdAt.getTime();
    });
    const first = withActiveBlock[0];
    if (first) return first.program;
  }

  // Otherwise the most recently created non-archived Program.
  const sorted = [...programs].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  return sorted[0] ?? null;
}

function resolveWorkoutDayName(
  structure: ProgramStructure,
  workoutDayId: string,
): string {
  const day = structure.workoutDays.find((d) => d.id === workoutDayId);
  return day?.name ?? "Workout";
}