// packages/api/src/services/reviewAdherence.test.ts
//
// Review's adherence, pure (no database): progress is not a deviation, and
// "planned so far" counts the training days that have come due.

import { describe, expect, it } from "vitest";
import type { PerformanceRecordRecord, SessionRecord, TrainingBlockRecord } from "@training/db";
import type { ProgramStructure } from "@training/domain";
import { computeAdherence } from "./reviewService";

const DAY = 86_400_000;
const NOW = new Date("2026-10-25T12:00:00Z");

function block(daysAgo: number): TrainingBlockRecord {
  return {
    id: "b",
    programVersionId: "v",
    userId: "u",
    status: "ACTIVE",
    plannedLengthWeeks: null,
    startedAt: new Date(NOW.getTime() - daysAgo * DAY),
    endedAt: null,
  };
}

function structure(trainingDays: number, restDays = 0): ProgramStructure {
  const days = [];
  for (let i = 0; i < trainingDays; i++) {
    days.push({
      id: `d${i}`,
      orderIndex: i,
      name: `Day ${i}`,
      prescriptions: [
        {
          id: `rx${i}`,
          orderIndex: 0,
          exerciseId: `ex${i}`,
          targetSets: 3,
          targetRepsLow: 8,
          targetRepsHigh: 12,
          loadScheme: { type: "FIXED_WEIGHT" as const, weight: 20, unit: "kg" as const },
        },
      ],
    });
  }
  for (let i = 0; i < restDays; i++) {
    days.push({ id: `r${i}`, orderIndex: trainingDays + i, name: "Rest", isRestDay: true, prescriptions: [] });
  }
  return { workoutDays: days };
}

function session(id: string, dayId: string, status: SessionRecord["status"], seq: number): SessionRecord {
  return {
    id,
    trainingBlockId: "b",
    workoutDayId: dayId,
    sequenceIndex: seq,
    status,
    scheduledDate: null,
    startedAt: null,
    completedAt: status === "COMPLETED" ? NOW : null,
  };
}

function set(sessionId: string, rx: string, load: number, reps = 10): PerformanceRecordRecord {
  return {
    id: `${sessionId}-${rx}-${load}`,
    sessionId,
    exercisePrescriptionId: rx,
    setIndex: 0,
    actualReps: reps,
    actualLoad: load,
    actualRpe: null,
    completedAt: NOW,
  };
}

const run = (args: {
  daysAgo: number;
  structure: ProgramStructure;
  sessions: SessionRecord[];
  records: PerformanceRecordRecord[][];
}) =>
  computeAdherence({
    block: block(args.daysAgo),
    structure: args.structure,
    sessions: args.sessions,
    recordsBySession: args.records,
    nameById: new Map(),
    now: NOW,
  });

describe("computeAdherence", () => {
  it("does not call a load above the plan a deviation", () => {
    const s = session("s1", "d0", "COMPLETED", 0);
    const sets = [set("s1", "rx0", 40), set("s1", "rx0", 40), set("s1", "rx0", 40)];
    const a = run({ daysAgo: 3, structure: structure(1), sessions: [s], records: [sets] });
    expect(a.systematicDeviations.map((d) => d.kind)).not.toContain("LOAD_ABOVE");
    expect(a.systematicDeviations).toEqual([]);
  });

  it("still reports a load below the plan, repeated", () => {
    const sessions = [0, 1, 2].map((i) => session(`s${i}`, "d0", "COMPLETED", i));
    const records = sessions.map((s) => [set(s.id, "rx0", 10)]);
    const a = run({ daysAgo: 8, structure: structure(1), sessions, records });
    expect(a.systematicDeviations.some((d) => d.kind === "LOAD_BELOW" && d.occurrences === 3)).toBe(true);
  });

  it("counts a first-week session as planned (it used to read 0 planned)", () => {
    const sessions = [session("s0", "d0", "COMPLETED", 0)];
    const a = run({ daysAgo: 2, structure: structure(2), sessions, records: [[]] });
    expect(a.plannedSessions).toBe(1);
    expect(a.completedSessions).toBe(1);
  });

  it("counts sessions as they come due: day 0, then every 7 / perWeek days", () => {
    const planned = (daysAgo: number, perWeek: number) =>
      run({ daysAgo, structure: structure(perWeek), sessions: [], records: [] }).plannedSessions;
    expect(planned(0, 2)).toBe(1);
    expect(planned(3, 2)).toBe(1);
    expect(planned(4, 2)).toBe(2);
    expect(planned(7, 2)).toBe(3);
    expect(planned(0, 3)).toBe(1);
    expect(planned(3, 3)).toBe(2);
    expect(planned(5, 3)).toBe(3);
    expect(planned(14, 4)).toBe(9);
  });

  it("does not count rest days toward what is due", () => {
    const withRest = run({ daysAgo: 7, structure: structure(2, 2), sessions: [], records: [] });
    const without = run({ daysAgo: 7, structure: structure(2), sessions: [], records: [] });
    expect(withRest.plannedSessions).toBe(without.plannedSessions);
  });

  it("keeps each set with its own session when a rest day comes first", () => {
    // Session 0 is a rest day; session 1 has the only sets. A mis-paired
    // list would hand session 1 the rest day's empty log.
    const rest = session("rest", "r0", "SKIPPED", 0);
    const trained = session("s1", "d0", "COMPLETED", 1);
    const a = run({
      daysAgo: 5,
      structure: structure(1, 1),
      sessions: [rest, trained],
      records: [[], [set("s1", "rx0", 20), set("s1", "rx0", 20), set("s1", "rx0", 20)]],
    });
    expect(a.summary.exercisesUnlogged).toBe(0);
    expect(a.sessionLog.map((e) => e.status)).toEqual(["COMPLETED"]);
  });
});
