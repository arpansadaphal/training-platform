// packages/db/scripts/deploy-plan.ts
//
// The decision half of `db:deploy` (see deploy.ts): should this build touch the database, and is the
// environment safe to do it with? Pure functions over an env object, so the rules are unit-tested without a
// database or a child process.
//
// The rule (ARCH-075):
//   - VERCEL_ENV === "production"      -> run.
//   - RUN_DB_DEPLOY === "true"         -> run. An explicit opt-in for a staging or test-branch deploy whose
//                                         DATABASE_URL / DIRECT_URL point at a throwaway Neon branch.
//   - anything else                    -> skip. Preview builds, local `pnpm build` and CI never migrate a
//                                         database by accident: a PR's unmerged migration must not reach the
//                                         production database, and a developer's .env may point at Neon.

export type DeployDecision =
  | { run: true; reason: string }
  | { run: false; reason: string };

export type EnvCheck = { ok: true; target: string } | { ok: false; problems: string[] };

type Env = Record<string, string | undefined>;

export function decide(env: Env): DeployDecision {
  const vercelEnv = (env.VERCEL_ENV ?? "").trim();
  if (vercelEnv === "production") return { run: true, reason: "VERCEL_ENV=production" };
  if ((env.RUN_DB_DEPLOY ?? "").trim() === "true") {
    return { run: true, reason: `RUN_DB_DEPLOY=true (VERCEL_ENV=${vercelEnv || "(unset)"})` };
  }
  return {
    run: false,
    reason: `VERCEL_ENV=${vercelEnv || "(unset)"}, RUN_DB_DEPLOY not "true"`,
  };
}

/**
 * Checks the two connection strings a migrate-and-seed run needs, and returns a credential-free label for
 * the target (host and database name) so the build log says which database was touched.
 *
 * DIRECT_URL must be the unpooled connection: `prisma migrate deploy` takes a Postgres advisory lock, which
 * does not work through Neon's PgBouncer pooler, so a pooled DIRECT_URL stalls or errors. Neon pooled hosts
 * contain "-pooler" in the first label.
 */
export function checkEnv(env: Env): EnvCheck {
  const problems: string[] = [];

  const direct = (env.DIRECT_URL ?? "").trim();
  const pooled = (env.DATABASE_URL ?? "").trim();
  if (!pooled) problems.push("DATABASE_URL is not set (the seed connects with it).");
  if (!direct) problems.push("DIRECT_URL is not set (prisma migrate deploy connects with it).");

  let target = "";
  if (direct) {
    try {
      const url = new URL(direct);
      target = `${url.host}${url.pathname}`;
      if (/^[^.]*-pooler(\.|$)/.test(url.hostname)) {
        problems.push(
          `DIRECT_URL points at a pooled host (${url.hostname}). Use the direct (unpooled) connection string.`,
        );
      }
    } catch {
      problems.push("DIRECT_URL is not a valid URL.");
    }
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, target };
}
