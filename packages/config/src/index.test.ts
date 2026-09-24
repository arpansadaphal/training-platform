import { describe, it, expect } from "vitest";
import { loadServerEnv, loadClientEnv } from "./index";

describe("@training/config", () => {
  it("parses a valid server environment", () => {
    const env = loadServerEnv({
      DATABASE_URL: "postgresql://u:p@host/db",
      AUTH_SECRET: "x".repeat(32),
    } as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBe("postgresql://u:p@host/db");
  });

  it("rejects a too-short AUTH_SECRET", () => {
    expect(() =>
      loadServerEnv({
        DATABASE_URL: "postgresql://u:p@host/db",
        AUTH_SECRET: "short",
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it("loads client env without requiring secrets", () => {
    const env = loadClientEnv({} as NodeJS.ProcessEnv);
    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined();
  });
});