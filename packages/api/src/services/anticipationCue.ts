// packages/api/src/services/anticipationCue.ts
//
// Anticipation cues (Phase 10c).
//
// A purely informational, forward-looking line about where the user is in
// the current TrainingBlock: "N sessions remaining in this block, then your
// Review." No streaks, no login counts, no loss-aversion framing — Final
// Freeze §26's explicit exclusion list.
//
// When plannedLengthWeeks is null (the schema permits it; block length is
// informational, not a hard constraint — 08-training-execution-and-
// evidence.md), the cue degrades to a fact, not a projection:
// "N sessions completed in this block." Never invent a block length.
//
// The `sessionsPerWeek` input is the count of WorkoutDays in the version's
// structureSnapshot — the same derivation reviewService.computeAdherence
// uses for plannedSessions. Deliberately not a separately-stored number.
//
// Pure. No I/O. Lives here (not in packages/domain) because it is a
// presentational derivation from already-collected data, not a
// deterministic engine — same discipline as adherence aggregation in
// reviewService.

export interface AnticipationCueInput {
  /** Nullable per the TrainingBlock schema. */
  plannedLengthWeeks: number | null;
  /**
   * The count of WorkoutDays in the version's structureSnapshot. Zero is
   * treated the same as null — a cue needs a nonzero template count to
   * project forward.
   */
  sessionsPerWeek: number;
  /** Count of COMPLETED Sessions in the current block. */
  sessionsCompletedInBlock: number;
}

export type AnticipationCue =
  | { kind: "NO_PLANNED_LENGTH"; text: string }
  | { kind: "REMAINING"; remaining: number; text: string }
  | { kind: "LAST_SESSION"; text: string };

export function buildAnticipationCue(
  input: AnticipationCueInput,
): AnticipationCue {
  const {
    plannedLengthWeeks,
    sessionsPerWeek,
    sessionsCompletedInBlock,
  } = input;

  // No block length declared, or a structure with no workout days to
  // derive a per-week count from. Degrade to a fact — the count of what
  // has happened — never a projection.
  if (plannedLengthWeeks === null || sessionsPerWeek <= 0) {
    return {
      kind: "NO_PLANNED_LENGTH",
      text: `${sessionsCompletedInBlock} ${
        sessionsCompletedInBlock === 1 ? "session" : "sessions"
      } completed in this block.`,
    };
  }

  const totalPlanned = plannedLengthWeeks * sessionsPerWeek;
  const remaining = totalPlanned - sessionsCompletedInBlock;

  if (remaining <= 0) {
    return {
      kind: "LAST_SESSION",
      text: "This is your last session in this block.",
    };
  }

  return {
    kind: "REMAINING",
    remaining,
    text: `${remaining} ${
      remaining === 1 ? "session" : "sessions"
    } remaining in this block, then your Review.`,
  };
}