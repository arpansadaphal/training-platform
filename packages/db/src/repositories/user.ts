// Repository layer for User. Returns plain TypeScript shapes only — callers
// outside packages/db must never see a Prisma type.
//
// Reconciled with Phase 1 schema (ARCH-024): displayName replaces name;
// passwordHash is nullable.

import { prisma } from "../client";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithHash extends UserRecord {
  passwordHash: string | null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const row = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return row ?? null;
}

export async function findUserByEmailWithHash(
  email: string,
): Promise<UserWithHash | null> {
  const row = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      displayName: true,
      passwordHash: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return row ?? null;
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  displayName: string;
}): Promise<UserRecord> {
  const row = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return row;
}