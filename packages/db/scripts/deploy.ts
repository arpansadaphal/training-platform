// packages/db/scripts/deploy.ts
//
// `pnpm --filter @training/db run db:deploy`. Applies pending migrations, then seeds, as a step of the web
// build (apps/web/package.json: launch-gate, then this, then `next build`). ARCH-075.
//
//   prisma migrate deploy   applies only un-applied migrations (idempotent), under Prisma's advisory lock.
//   prisma db seed          upserts the reference data (idempotent; one locked transaction, see seed.ts).
//
// Fails loudly: any non-zero exit from either step exits this script non-zero, which fails the build, so
// Vercel never promotes the deployment. When the database is not to be touched (see deploy-plan.ts) it logs
// one line and exits 0.
//
// Every line is prefixed [db-deploy], like [launch-gate], so a build log can be searched for it.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkEnv, decide } from "./deploy-plan";

const MARKER = "[db-deploy]";
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

function fail(message: string): never {
  console.error(`${MARKER} FAIL ${message}`);
  process.exit(1);
}

function step(label: string, args: string[]): void {
  console.log(`${MARKER} ${label}...`);
  const started = Date.now();
  const result = spawnSync("pnpm", ["exec", "prisma", ...args], {
    cwd: packageRoot,
    stdio: "inherit",
    env: process.env,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.error) fail(`${label}: could not start (${result.error.message}).`);
  if (result.status !== 0) {
    fail(
      `${label} exited with ${result.signal ? `signal ${result.signal}` : `code ${result.status}`} after ${seconds}s. ` +
        `The build stops here; nothing is deployed.`,
    );
  }
  console.log(`${MARKER} ${label}: done in ${seconds}s.`);
}

const decision = decide(process.env);
if (!decision.run) {
  console.log(`${MARKER} Skipped (${decision.reason}). The database is not touched outside production.`);
  process.exit(0);
}

console.log(`${MARKER} Running (${decision.reason}).`);
const check = checkEnv(process.env);
if (!check.ok) fail(check.problems.join(" "));
console.log(`${MARKER} Target: ${check.target}`);

step("prisma migrate deploy", ["migrate", "deploy"]);
step("prisma db seed", ["db", "seed"]);
console.log(`${MARKER} PASS. Migrations applied and seed complete.`);
