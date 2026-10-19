import { describe, expect, it, vi } from "vitest";

import { secretsMatch } from "./constant-time";

vi.mock("server-only", () => ({}));

const SECRET = "a".repeat(32) + "-cron-secret";

describe("secretsMatch", () => {
  it("accepts the exact secret", () => {
    expect(secretsMatch(SECRET, SECRET)).toBe(true);
  });

  it("rejects a different secret of the same length", () => {
    expect(secretsMatch(SECRET.slice(0, -1) + "X", SECRET)).toBe(false);
  });

  it("rejects prefixes, extensions and other lengths without throwing", () => {
    expect(secretsMatch(SECRET.slice(0, 10), SECRET)).toBe(false);
    expect(secretsMatch(`${SECRET}x`, SECRET)).toBe(false);
    expect(secretsMatch("x".repeat(10_000), SECRET)).toBe(false);
  });

  it("rejects missing or empty values", () => {
    expect(secretsMatch(null, SECRET)).toBe(false);
    expect(secretsMatch(undefined, SECRET)).toBe(false);
    expect(secretsMatch("", SECRET)).toBe(false);
    // An empty expected secret is a misconfiguration, never a match.
    expect(secretsMatch("", "")).toBe(false);
  });

  it("is case and Unicode sensitive", () => {
    expect(secretsMatch(SECRET.toUpperCase(), SECRET)).toBe(false);
    expect(secretsMatch("café", "café")).toBe(false);
  });
});
