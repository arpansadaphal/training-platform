// Authorization test for the program router.
//
// Exercises appRouter.createCaller directly — no HTTP. The key property:
// a non-owner must NOT be able to get / rename / archive another user's
// Program, and the error must be NOT_FOUND (not FORBIDDEN), so the API
// does not leak the existence of another user's Program.

import { afterEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createProgram, prisma, type UserRecord } from "@training/db";
import { appRouter } from "../../router";
import {
  assertDefined,
  makeTestUser,
  cleanupTrackedUsers,
} from "./helpers";

afterEach(cleanupTrackedUsers);

function callerFor(user: UserRecord) {
  return appRouter.createCaller({ user: { id: user.id, email: user.email } });
}

describe("program router — authorization", () => {
  it("owner can create, list, get, rename, archive", async () => {
    const owner = await makeTestUser("Program Router Test Owner");
    const caller = callerFor(owner);

    const created = await caller.program.create({ name: "My Program" });
    expect(created.ownerUserId).toBe(owner.id);

    const list = await caller.program.listMine({});
    expect(list.map((p) => p.id)).toContain(created.id);

    const fetched = await caller.program.get({ id: created.id });
    expect(fetched.name).toBe("My Program");

    const renamed = await caller.program.rename({
      id: created.id,
      name: "Renamed",
    });
    expect(renamed.name).toBe("Renamed");

    const archived = await caller.program.archive({ id: created.id });
    expect(archived.archivedAt).toBeInstanceOf(Date);
  });

  it("non-owner gets NOT_FOUND (not FORBIDDEN) on get/rename/archive", async () => {
    const owner = await makeTestUser("Program Router Test Owner");
    const intruder = await makeTestUser("Program Router Test Intruder");

    const program = await createProgram({
      ownerUserId: owner.id,
      name: "Owner's private program",
    });

    const intruderCaller = callerFor(intruder);

    const expectNotFound = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        throw new Error("Expected NOT_FOUND but call succeeded");
      } catch (err) {
        if (!(err instanceof TRPCError)) {
          throw new Error(`Expected TRPCError, got ${String(err)}`);
        }
        expect(err.code).toBe("NOT_FOUND");
      }
    };

    await expectNotFound(() => intruderCaller.program.get({ id: program.id }));
    await expectNotFound(() =>
      intruderCaller.program.rename({ id: program.id, name: "Hijacked" }),
    );
    await expectNotFound(() =>
      intruderCaller.program.archive({ id: program.id }),
    );

    // Owner's Program is untouched.
    const stillOwner = await prisma.program.findUnique({
      where: { id: program.id },
      select: { name: true, archivedAt: true },
    });
    expect(stillOwner?.name).toBe("Owner's private program");
    expect(stillOwner?.archivedAt).toBeNull();
  });

  it("listMine returns only the caller's own Programs", async () => {
    const userA = await makeTestUser("Program Router Test User A");
    const userB = await makeTestUser("Program Router Test User B");

    await createProgram({ ownerUserId: userA.id, name: "A's" });
    await createProgram({ ownerUserId: userB.id, name: "B's" });

    const listA = await callerFor(userA).program.listMine({});
    expect(listA).toHaveLength(1);
    const a = assertDefined(listA[0], "listA[0]");
    expect(a.name).toBe("A's");

    const listB = await callerFor(userB).program.listMine({});
    expect(listB).toHaveLength(1);
    const b = assertDefined(listB[0], "listB[0]");
    expect(b.name).toBe("B's");
  });
});