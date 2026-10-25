// packages/api/src/services/queryBudget.test.ts
//
// Perf budget (product-depth roadmap, Week 1): how many database calls, and
// how long a chain of them, each hot flow makes. On Vercel every call is a
// network round trip to the database, so the chain is what a user waits for.
// The ceilings are the roadmap's targets; the measured baseline before the
// work (calls / chain): session page 22/15, logSet 5/5, /app 13/11,
// summary 13/9. Raise a ceiling only with a reason written next to it.

import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupTrackedUsers,
  listExercises,
  makeTestUser,
  prisma,
} from "@training/db";
import type { ProgramStructure } from "@training/domain";
import { measureQueries } from "../testing/queryProbe";
import { createMyProgram } from "./programService";
import { createMyDraft, updateMyDraftStructure } from "./draftService";
import { commitFromDraft } from "./programVersionService";
import {
  getSessionContext,
  getSessionPage,
  markCompleted,
  markStarted,
  startSpecificDay,
  getTrainingOptions,
} from "./sessionService";
import { logBatch, logSet } from "./performanceService";
import { getMyIdentitySummary } from "./identityService";
import { getProgressForUser, getSessionSummary } from "./progressService";

afterEach(async () => {
  await cleanupTrackedUsers();
});

async function setup() {
  const user = await makeTestUser();
  const exercises = await listExercises();
  const structure: ProgramStructure = {
    workoutDays: ["Push", "Pull"].map((name, d) => ({
      id: `day-${name}`,
      orderIndex: d,
      name,
      prescriptions: [0, 1, 2].map((k) => ({
        id: `rx-${name}-${k}`,
        orderIndex: k,
        exerciseId: exercises[d * 3 + k]!.id,
        targetSets: 3,
        targetRepsLow: 8,
        targetRepsHigh: 12,
        targetRpe: 8,
        loadScheme: { type: "FIXED_WEIGHT" as const, weight: 50, unit: "kg" as const },
      })),
    })),
  };
  const program = await createMyProgram(user.id, "Budget");
  const draft = await createMyDraft(user.id, program.id, { label: "v1" });
  await updateMyDraftStructure(user.id, draft.id, structure);
  await commitFromDraft(user.id, draft.id);
  const { days } = await getTrainingOptions(user.id, program.id);
  // Two completed sessions of history so hints, summary and progress have data.
  for (let n = 0; n < 2; n++) {
    const s = await startSpecificDay(user.id, program.id, days[0]!.id);
    await markStarted(user.id, s.id);
    const ctx = await getSessionContext(user.id, s.id);
    await logBatch(user.id, s.id, {
      entries: ctx.workoutDay.prescriptions.flatMap((p, i) =>
        [0, 1, 2].map((setIndex) => ({
          exercisePrescriptionId: p.id,
          setIndex,
          actualReps: 10,
          actualLoad: 40 + n * 2.5 + i,
        })),
      ),
    });
    await markCompleted(user.id, s.id);
  }
  const live = await startSpecificDay(user.id, program.id, days[0]!.id);
  await markStarted(user.id, live.id);
  return { user, program, live };
}

describe("query budget (report)", () => {
  it("keeps each hot flow inside its call budget (and prints the numbers)", async () => {
    const { user, live } = await setup();
    const ctx = await getSessionContext(user.id, live.id);
    const rx = ctx.workoutDay.prescriptions[0]!.id;
    // Open the pool first so connection handshakes are not billed to a flow.
    await Promise.all(Array.from({ length: 8 }, () => prisma.$queryRaw`SELECT 1`));
    const rows: Array<[string, { calls: number; depth: number; ms: number }]> = [];

    const page = await measureQueries(() => getSessionPage(user.id, live.id));
    rows.push(["session page", page]);

    const log = await measureQueries(() =>
      logSet(user.id, live.id, {
        exercisePrescriptionId: rx,
        setIndex: 0,
        actualReps: 10,
        actualLoad: 50,
      }),
    );
    rows.push(["logSet", log]);

    const identity = await measureQueries(() => getMyIdentitySummary(user.id));
    rows.push(["/app identity summary", identity]);

    const progress = await measureQueries(() => getProgressForUser(user.id));
    rows.push(["/app progress", progress]);

    await markStarted(user.id, live.id).catch(() => undefined);
    const done = await measureQueries(() => markCompleted(user.id, live.id));
    rows.push(["markCompleted", done]);

    const summary = await measureQueries(() => getSessionSummary(user.id, live.id));
    rows.push(["summary", summary]);

    // Ceilings. Session page <= 4 (roadmap: 15 -> 4 or fewer), logSet 2
    // (5 -> 2), /app <= 3 (9 -> 3 or fewer), summary <= 4 (13 reads -> ~4).
    expect(page.depth).toBeLessThanOrEqual(4);
    expect(log.calls).toBeLessThanOrEqual(2);
    expect(identity.depth).toBeLessThanOrEqual(3);
    expect(progress.depth).toBeLessThanOrEqual(2);
    expect(summary.depth).toBeLessThanOrEqual(4);

    console.log(
      "\nQUERY BUDGET\n" +
        rows.map(([n, m]) => `${n.padEnd(46)} calls=${String(m.calls).padStart(3)} depth=${String(m.depth).padStart(2)} ms=${m.ms}`).join("\n"),
    );
  });
});
