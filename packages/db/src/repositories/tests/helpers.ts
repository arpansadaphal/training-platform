// Shared test helpers for packages/db repository tests.
//
// These helpers are deliberately dependency-ordered to match the FK
// constraints declared in prisma/schema.prisma. Most relations are
// ON DELETE RESTRICT, so children must be deleted before parents, and
// the circular Program ↔ ProgramVersion reference must be broken with
// an updateMany first.
//
// The cleanup walk covers every table a Program-owned test user could
// accumulate, not just the tables Phase 1's tests currently create — so
// future phases can add tests without amending this file.
//
// No $transaction wrapping: on remote Neon the whole walk routinely
// exceeds Prisma's 5s interactive-transaction timeout.

import { prisma, createUser, type UserRecord } from "../../index";

const trackedUserIds: string[] = [];

/**
 * Narrows a T | undefined | null to T, throwing if the value is missing.
 * Satisfies noUncheckedIndexedAccess without falling back to non-null
 * assertions.
 */
export function assertDefined<T>(
  value: T | undefined | null,
  label: string,
): T {
  if (value === undefined || value === null) {
    throw new Error(`Expected ${label} to be present`);
  }
  return value;
}

/**
 * Creates a fresh user with a unique email and registers it for cleanup.
 * Pass a distinct displayName per test file so failures are greppable.
 */
export async function makeTestUser(
  displayName = "Test User",
): Promise<UserRecord> {
  const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const user = await createUser({
    email: `phase1-${slug}-${crypto.randomUUID()}@example.test`,
    passwordHash: "not-a-real-hash",
    displayName,
  });
  trackedUserIds.push(user.id);
  return user;
}

/**
 * Drains every tracked user through cleanupUser. Intended for use as:
 *   afterEach(cleanupTrackedUsers);
 */
export async function cleanupTrackedUsers(): Promise<void> {
  while (trackedUserIds.length > 0) {
    const id = assertDefined(trackedUserIds.pop(), "trackedUserIds.pop()");
    await cleanupUser(id);
  }
}

/**
 * Deletes a user and everything the test surface could have created for
 * them, in FK-safe dependency order. Exported so individual tests can
 * clean up early if they need to; the normal path is cleanupTrackedUsers.
 */
export async function cleanupUser(userId: string): Promise<void> {
  // 1. Break the circular Program ↔ ProgramVersion reference so neither
  //    side blocks the other's delete below.
  await prisma.program.updateMany({
    where: { ownerUserId: userId },
    data: { activeVersionId: null, currentGoalId: null },
  });

  // 2. Training execution data — deepest dependents first.
  await prisma.performanceRecord.deleteMany({
    where: { session: { trainingBlock: { userId } } },
  });
  await prisma.session.deleteMany({
    where: { trainingBlock: { userId } },
  });
  await prisma.observation.deleteMany({ where: { userId } });
  await prisma.trainingBlock.deleteMany({ where: { userId } });

  // 3. Version-scoped and program-scoped derived data.
  await prisma.assessmentSnapshot.deleteMany({
    where: { programVersion: { program: { ownerUserId: userId } } },
  });
  await prisma.revision.deleteMany({
    where: { program: { ownerUserId: userId } },
  });
  await prisma.simulation.deleteMany({
    where: { program: { ownerUserId: userId } },
  });
  await prisma.programDraft.deleteMany({
    where: { program: { ownerUserId: userId } },
  });
  await prisma.exercisePrescription.deleteMany({
    where: {
      workoutDay: { programVersion: { program: { ownerUserId: userId } } },
    },
  });
  await prisma.workoutDay.deleteMany({
    where: { programVersion: { program: { ownerUserId: userId } } },
  });
  await prisma.programVersion.deleteMany({
    where: { program: { ownerUserId: userId } },
  });
  await prisma.program.deleteMany({ where: { ownerUserId: userId } });

  // 4. User-scoped data.
  await prisma.constraint.deleteMany({ where: { userId } });
  await prisma.temporaryConstraint.deleteMany({ where: { userId } });
  await prisma.aIMessage.deleteMany({
    where: { aiConversation: { userId } },
  });
  await prisma.aIConversation.deleteMany({ where: { userId } });

  // 5. The user.
  await prisma.user.delete({ where: { id: userId } });
}