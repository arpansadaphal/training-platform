import { prisma } from "../client";

/**
 * Plain, Prisma-free domain-facing user shape.
 * Per ARCH-010, nothing above packages/db should see Prisma types.
 */
export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

export interface UserWithHash extends UserRecord {
  passwordHash: string;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, createdAt: true },
  });
}

export async function findUserByEmailWithHash(
  email: string,
): Promise<UserWithHash | null> {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      passwordHash: true,
    },
  });
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  name?: string | null;
}): Promise<UserRecord> {
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name ?? null,
    },
    select: { id: true, email: true, name: true, createdAt: true },
  });
}