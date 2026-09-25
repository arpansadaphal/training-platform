// Repository round-trip test for Program.
//
// Uses the real Prisma client against the database in packages/db/.env
// (DATABASE_URL). Cleanup order and per-user teardown live in ./helpers.

import { afterEach, describe, expect, it } from "vitest";
import {
  createProgram,
  findProgramById,
  listProgramsByOwner,
  renameProgram,
  archiveProgram,
} from "../../index";
import { makeTestUser, cleanupTrackedUsers } from "./helpers";

afterEach(cleanupTrackedUsers);

describe("programRepository", () => {
  it("creates a Program and returns it with a plain-TS shape", async () => {
    const user = await makeTestUser("Program Repo Test User");

    const program = await createProgram({
      ownerUserId: user.id,
      name: "Upper/Lower 4-day",
    });

    expect(program.id).toBeTypeOf("string");
    expect(program.ownerUserId).toBe(user.id);
    expect(program.name).toBe("Upper/Lower 4-day");
    expect(program.visibility).toBe("PRIVATE");
    expect(program.publicShowsExecutionHistory).toBe(false);
    expect(program.activeVersionId).toBeNull();
    expect(program.currentGoalId).toBeNull();
    expect(program.archivedAt).toBeNull();
    expect(program.createdAt).toBeInstanceOf(Date);
    expect(program.updatedAt).toBeInstanceOf(Date);
  });

  it("lists only this owner's active programs by default", async () => {
    const userA = await makeTestUser("Program Repo Test User A");
    const userB = await makeTestUser("Program Repo Test User B");

    const p1 = await createProgram({ ownerUserId: userA.id, name: "A1" });
    const p2 = await createProgram({ ownerUserId: userA.id, name: "A2" });
    await createProgram({ ownerUserId: userB.id, name: "B1" });

    const listA = await listProgramsByOwner(userA.id);
    expect(listA.map((p) => p.id).sort()).toEqual([p1.id, p2.id].sort());

    await archiveProgram(p1.id);
    const listAActive = await listProgramsByOwner(userA.id);
    expect(listAActive.map((p) => p.id)).toEqual([p2.id]);

    const listAAll = await listProgramsByOwner(userA.id, {
      includeArchived: true,
    });
    expect(listAAll.map((p) => p.id).sort()).toEqual([p1.id, p2.id].sort());
  });

  it("renames and archives a Program", async () => {
    const user = await makeTestUser("Program Repo Test User");
    const program = await createProgram({ ownerUserId: user.id, name: "Old" });

    const renamed = await renameProgram(program.id, "New");
    expect(renamed.name).toBe("New");
    expect(renamed.updatedAt.getTime()).toBeGreaterThanOrEqual(
      program.updatedAt.getTime(),
    );

    const archived = await archiveProgram(program.id);
    expect(archived.archivedAt).toBeInstanceOf(Date);

    const fetched = await findProgramById(program.id);
    expect(fetched?.archivedAt).toBeInstanceOf(Date);
  });

  it("returns null for an unknown Program id", async () => {
    const missing = await findProgramById("nonexistent-cuid");
    expect(missing).toBeNull();
  });
});