import { PrismaClient } from "@prisma/client";

/**
 * Single PrismaClient instance, cached across hot-reloads in development.
 * The globalThis cache prevents exhausting Postgres connections when Next.js
 * re-executes this module during HMR.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}