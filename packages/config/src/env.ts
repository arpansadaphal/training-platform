import { z } from "zod";

/**
 * Server-only environment. Parsed lazily so importing this module never
 * throws at build time in environments that only need a subset of vars.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
   if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    console.error("Invalid server environment:", fieldErrors);
    throw new Error("Invalid server environment");
  }
  return parsed.data;
}

/**
 * Client-exposed environment (must be NEXT_PUBLIC_*). Never put secrets here.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

export function loadClientEnv(source: NodeJS.ProcessEnv = process.env): ClientEnv {
  return clientEnvSchema.parse({
    NEXT_PUBLIC_SENTRY_DSN: source.NEXT_PUBLIC_SENTRY_DSN,
  });
}