// packages/api/src/services/blockReport.test.ts
//
// Block Report tests (Phase 10b).
//
// Two layers:
//   1. Pure narrative tests on buildNarrative — no DB.
//   2. Integration tests on getBlockReport — test DB via the same fixture
//      pattern as authorization.test.ts.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupTrackedUsers,
  findActiveTrainingBlockForProgram,
  listExercises,
  makeTestUser,
  type TrainingBlockRecord,
  type UserRecord,
} from "@training/db";
import type { ProgramStructure } from "@training/domain";
import {
  buildNarrative,
  getBlockReport,
} from "./blockReportService";
import {
  createMyDraft,
  updateMyDraftStructure,
} from "./draftService";
import { createMyProgram } from "./programService";
import { commitFromDraft } from "./programVersionService";

// ─────────────────────────────────────────────────────────────────────────────
// Pure narrative tests — no DB, fast, forbidden-language over assembled text.
// ─────────────────────────────────────────────────────────────────────────────

const FORBIDDEN_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "outcome guarantee (will)", re: /\bwill\b/i },
  { name: "outcome guarantee (guarantee)", re: /\bguarantee/i },
  { name: "outcome guarantee (ensure)", re: /\bensure/i },
  {
    name: "outcome percentage claim",
    re: /\d+\s*%\s*(more|less|faster|bigger|stronger)/i,
  },
  { name: "optimality claim", re: /\b(optimal|best|ideal)\b/i },
  { name: "medical claim", re: /\b(diagnos|injur|treat(ment)?|rehab)\b/i },
  { name: "streak framing", re: /\bstreak\b/i },
  {
    name: "loss-aversion framing",
    re: /\bdon'?t lose\b|\bmissing out\b|\bmiss out\b/i,
  },
];

type Narrative = ReturnType<typeof buildNarrative>;

function allStrings(n: Narrative): string[] {
  const out: string[] = [n.executionLine];
  if (n.deviationsLine) out.push(n.deviationsLine);
  out.push(...n.previousComparisonLines);
  if (n.firstBlockLine) out.push(n.firstBlockLine);
  return out;
}

function assertNoForbidden(strings: string[]): void {
  for (const line of strings) {
    for (const { name, re } of FORBIDDEN_PATTERNS) {
      expect(line, `forbidden [${name}] in: "${line}"`).not.toMatch(re);
    }
  }
}

const UNVALIDATED_SNAPSHOT = {
  assessment: { kind: "UNVALIDATED", reason: "unvalidated profile" },
} as unknown as Parameters<typeof buildNarrative>[0]["currentSnapshot"];

describe("Block Report narrative — forbidden language", () => {
  it("first-block narrative is clean", () => {
    const n = buildNarrative({
      sessionsCompleted: 12,
      totalSetsLogged: 84,
      systematicDeviations: [],
      previous: null,
      currentSnapshot: UNVALIDATED_SNAPSHOT,
    });
    assertNoForbidden(allStrings(n));
    expect(n.firstBlockLine).not.toBeNull();
    expect(n.previousComparisonLines).toEqual([]);
  });

  it("later-block narrative (unvalidated snapshots) is clean", () => {
    const previous = {
      blockId: "prev",
      startedAt: new Date("2026-01-01"),
      endedAt: new Date("2026-02-01"),
      assessmentSnapshot: {
        assessment: { kind: "UNVALIDATED", reason: "unvalidated profile" },
      },
    } as unknown as Parameters<typeof buildNarrative>[0]["previous"];

    const n = buildNarrative({
      sessionsCompleted: 8,
      totalSetsLogged: 40,
      systematicDeviations: [
        {
          exerciseId: "ex1",
          exerciseName: "Bench Press",
          kind: "REPS_BELOW",
          occurrences: 3,
          totalSetsForExercise: 12,
          example: {
            sessionId: "s1",
            prescriptionId: "p1",
            prescribed: "8-10 reps",
            actual: "6 reps @ 100",
          },
        },
      ],
      previous,
      currentSnapshot: UNVALIDATED_SNAPSHOT,
    });

    assertNoForbidden(allStrings(n));
    expect(n.firstBlockLine).toBeNull();
    expect(n.previousComparisonLines).toEqual([
      "Your previous block's assessment could not be compared directly with this one.",
    ]);
  });
});

describe("Block Report previous-block comparison", () => {
  it("UNVALIDATED snapshots produce 'could not be compared', never 'unchanged'", () => {
    const previous = {
      blockId: "prev",
      startedAt: new Date("2026-01-01"),
      endedAt: new Date("2026-02-01"),
      assessmentSnapshot: {
        assessment: { kind: "UNVALIDATED", reason: "unvalidated profile" },
      },
    } as unknown as Parameters<typeof buildNarrative>[0]["previous"];

    const n = buildNarrative({
      sessionsCompleted: 4,
      totalSetsLogged: 20,
      systematicDeviations: [],
      previous,
      currentSnapshot: UNVALIDATED_SNAPSHOT,
    });

    expect(n.previousComparisonLines).toHaveLength(1);
    expect(n.previousComparisonLines[0]).toMatch(/could not be compared/i);
    expect(n.previousComparisonLines[0]).not.toMatch(/unchanged/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration tests — real DB via the same fixture pattern as authorization.
// ─────────────────────────────────────────────────────────────────────────────

async function makeStructure(): Promise<ProgramStructure> {
  const exercises = await listExercises();
  const first = exercises[0];
  if (!first) throw new Error("Seed missing exercises");
  return {
    workoutDays: [
      {
        id: "day-a",
        orderIndex: 0,
        name: "Day A",
        prescriptions: [
          {
            id: "rx-a",
            orderIndex: 0,
            exerciseId: first.id,
            targetSets: 3,
            targetRepsLow: 8,
            targetRepsHigh: 10,
            loadScheme: { type: "BODYWEIGHT" },
          },
        ],
      },
    ],
  };
}

interface TwoBlockFixture {
  userA: UserRecord;
  userB: UserRecord;
  programId: string;
  firstBlock: TrainingBlockRecord;   // closed (was ACTIVE, then superseded)
  secondBlock: TrainingBlockRecord;  // ACTIVE
}

/**
 * Create a Program with two committed versions, producing one closed block
 * (from version 1) and one ACTIVE block (from version 2). The commit of
 * version 2 is what closes version 1's block — TrainingBlock lifecycle is
 * fully automatic (ARCH-016 / ARCH-039).
 */
async function buildTwoBlockFixture(): Promise<TwoBlockFixture> {
  const userA = await makeTestUser("BlockReport User A");
  const userB = await makeTestUser("BlockReport User B");

  const program = await createMyProgram(userA.id, "BlockReport Program");

  const draft1 = await createMyDraft(userA.id, program.id, { label: "v1" });
  await updateMyDraftStructure(userA.id, draft1.id, await makeStructure());
  await commitFromDraft(userA.id, draft1.id);

  const firstBlock = await findActiveTrainingBlockForProgram(program.id);
  if (!firstBlock) throw new Error("No active block after first commit");

  // Second commit — closes firstBlock, opens secondBlock.
  const draft2 = await createMyDraft(userA.id, program.id, { label: "v2" });
  await updateMyDraftStructure(userA.id, draft2.id, await makeStructure());
  await commitFromDraft(userA.id, draft2.id);

  const secondBlock = await findActiveTrainingBlockForProgram(program.id);
  if (!secondBlock) throw new Error("No active block after second commit");
  if (secondBlock.id === firstBlock.id) {
    throw new Error("Second commit did not open a new block");
  }

  return {
    userA,
    userB,
    programId: program.id,
    firstBlock,
    secondBlock,
  };
}

describe("getBlockReport — ACTIVE discriminator vs REPORT", () => {
  let f: TwoBlockFixture;

  beforeEach(async () => {
    f = await buildTwoBlockFixture();
  });

  afterEach(cleanupTrackedUsers);

  it("ACTIVE block returns kind: ACTIVE (no report fabricated)", async () => {
    const result = await getBlockReport(f.userA.id, f.secondBlock.id);
    expect(result.kind).toBe("ACTIVE");
    if (result.kind === "ACTIVE") {
      expect(result.blockId).toBe(f.secondBlock.id);
      expect(result.programId).toBe(f.programId);
    }
  });

  it("closed block returns kind: REPORT with a first-block narrative when it is the earliest", async () => {
    const result = await getBlockReport(f.userA.id, f.firstBlock.id);
    expect(result.kind).toBe("REPORT");
    if (result.kind !== "REPORT") return;

    expect(result.report.previousBlock).toBeNull();
    expect(result.report.narrative.firstBlockLine).not.toBeNull();
    expect(result.report.narrative.previousComparisonLines).toEqual([]);
    expect(result.report.programId).toBe(f.programId);
    expect(result.report.programName).toBe("BlockReport Program");
    // In the first-block case, the narrative is not permitted to reference
    // forbidden language.
    assertNoForbidden([
      result.report.narrative.executionLine,
      ...(result.report.narrative.firstBlockLine
        ? [result.report.narrative.firstBlockLine]
        : []),
    ]);
  });
});

describe("getBlockReport — non-disclosure (ARCH-040)", () => {
  let f: TwoBlockFixture;

  beforeEach(async () => {
    f = await buildTwoBlockFixture();
  });

  afterEach(cleanupTrackedUsers);

  it("non-owner of a closed block receives NOT_FOUND, never FORBIDDEN", async () => {
    await expect(
      getBlockReport(f.userB.id, f.firstBlock.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("non-owner of an ACTIVE block receives NOT_FOUND (ownership check runs before status)", async () => {
    await expect(
      getBlockReport(f.userB.id, f.secondBlock.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("nonexistent block id receives NOT_FOUND", async () => {
    await expect(
      getBlockReport(f.userA.id, "cuid_that_does_not_exist"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});