import { describe, expect, it } from "vitest";

import { checkEnv, parseEnvFile } from "./check-env";

// A valid uncompressed P-256 point: 0x04 followed by 64 bytes.
const VAPID_PUBLIC = Buffer.from([4, ...new Array<number>(64).fill(1)]).toString("base64url");

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  NEXT_PUBLIC_APP_URL: "https://restart.vercel.app",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: VAPID_PUBLIC,
  SUPABASE_SECRET_KEY: "sb_secret_x",
  CRON_SECRET: "a".repeat(64),
  VAPID_PRIVATE_KEY: "private",
  VAPID_SUBJECT: "mailto:me@example.com",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  TOKEN_ENCRYPTION_KEY: "key",
};

const names = (problems: { name: string }[]) => problems.map((p) => p.name);

describe("parseEnvFile", () => {
  it("reads quoted, exported and commented values", () => {
    expect(
      parseEnvFile("# c\nexport A=\"x # y\"\r\nB='z'\nC=plain   # note\nD=\nnot a line"),
    ).toEqual({ A: "x # y", B: "z", C: "plain", D: "" });
  });
});

describe("checkEnv", () => {
  it("accepts a complete production file", () => {
    expect(checkEnv(valid)).toEqual({ errors: [], warnings: [] });
  });

  it("names each broken variable without its value", () => {
    const { errors } = checkEnv({
      ...valid,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      CRON_SECRET: "short",
      VAPID_SUBJECT: "me@example.com",
      VAPID_PRIVATE_KEY: "",
      SUPABASE_SECRET_KEY: "sb_publishable_x",
    });
    expect(names(errors)).toEqual([
      "NEXT_PUBLIC_APP_URL",
      "CRON_SECRET",
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
      "SUPABASE_SECRET_KEY",
    ]);
    expect(JSON.stringify(errors)).not.toContain("short");
  });

  it("flags a partial Google setup but only warns when it's absent", () => {
    expect(names(checkEnv({ ...valid, TOKEN_ENCRYPTION_KEY: "" }).errors)).toEqual([
      "TOKEN_ENCRYPTION_KEY",
    ]);
    const noGoogle = Object.fromEntries(
      Object.entries(valid).filter(([name]) => !/^(GOOGLE_|TOKEN_)/.test(name)),
    );
    expect(checkEnv(noGoogle)).toMatchObject({
      errors: [],
      warnings: [{ problem: expect.any(String) }],
    });
  });
});
