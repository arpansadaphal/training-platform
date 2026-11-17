import { describe, expect, it } from "vitest";
import { checkEnv, decide } from "./deploy-plan";

describe("decide", () => {
  it("runs on a production build", () => {
    expect(decide({ VERCEL_ENV: "production" })).toMatchObject({ run: true });
  });

  it.each([{}, { VERCEL_ENV: "" }, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }])(
    "skips %j: a preview, local or CI build never migrates",
    (env) => {
      expect(decide(env)).toMatchObject({ run: false });
    },
  );

  it("runs outside production only on an explicit RUN_DB_DEPLOY=true", () => {
    expect(decide({ VERCEL_ENV: "preview", RUN_DB_DEPLOY: "true" })).toMatchObject({ run: true });
    expect(decide({ VERCEL_ENV: "preview", RUN_DB_DEPLOY: "1" })).toMatchObject({ run: false });
    expect(decide({ VERCEL_ENV: "preview", RUN_DB_DEPLOY: "false" })).toMatchObject({ run: false });
  });

  it("tolerates the trailing newline Vercel's env UI sometimes captures", () => {
    expect(decide({ VERCEL_ENV: "production\n" })).toMatchObject({ run: true });
  });
});

describe("checkEnv", () => {
  const direct = "postgresql://u:secret@ep-quiet-sea-b3udlf7g.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
  const pooled = "postgresql://u:secret@ep-quiet-sea-b3udlf7g-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

  it("accepts a direct DIRECT_URL and labels the target without credentials", () => {
    const result = checkEnv({ DATABASE_URL: pooled, DIRECT_URL: direct });
    expect(result).toEqual({
      ok: true,
      target: "ep-quiet-sea-b3udlf7g.c-4.ap-southeast-1.aws.neon.tech/neondb",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("rejects a missing DIRECT_URL or DATABASE_URL", () => {
    const result = checkEnv({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toHaveLength(2);
  });

  it("rejects a pooled DIRECT_URL (the advisory lock does not work through PgBouncer)", () => {
    const result = checkEnv({ DATABASE_URL: pooled, DIRECT_URL: pooled });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(" ")).toMatch(/pooled/);
  });

  it("rejects a DIRECT_URL that is not a URL, without echoing it", () => {
    const result = checkEnv({ DATABASE_URL: pooled, DIRECT_URL: "not a url secret" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(" ")).not.toContain("secret");
  });

  it("accepts a local Postgres", () => {
    const local = "postgresql://ci:ci@localhost:5432/ci";
    expect(checkEnv({ DATABASE_URL: local, DIRECT_URL: local })).toEqual({ ok: true, target: "localhost:5432/ci" });
  });
});
