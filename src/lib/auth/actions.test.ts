import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signOut, signOutEverywhere } from "./actions";

const m = vi.hoisted(() => ({
  signOut: vi.fn(),
  deleted: [] as string[],
  cookieNames: [] as string[],
  redirect: vi.fn((path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => m.cookieNames.map((name) => ({ name, value: "x" })),
    delete: (name: string) => m.deleted.push(name),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut: m.signOut } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.deleted = [];
  m.cookieNames = [
    "sb-127-auth-token",
    "sb-127-auth-token.0",
    "sb-127-auth-token.1",
    "sb-127-auth-token-code-verifier",
    "NEXT_LOCALE",
    "RESTART_TZ",
  ];
  m.signOut.mockResolvedValue({ error: null });
});

describe("signOut", () => {
  it("signs out this device only and goes to /login", async () => {
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT");
    expect(m.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(m.redirect).toHaveBeenCalledWith("/login");
    expect(m.deleted).toEqual([]);
  });

  it("still clears the session cookies when Supabase can't be reached", async () => {
    m.signOut.mockResolvedValue({ error: new AuthRetryableFetchError("fetch failed", 0) });
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT");
    expect(m.deleted).toEqual([
      "sb-127-auth-token",
      "sb-127-auth-token.0",
      "sb-127-auth-token.1",
      "sb-127-auth-token-code-verifier",
    ]);
    expect(m.redirect).toHaveBeenCalledWith("/login");
  });
});

describe("signOutEverywhere (FR-ACC-6)", () => {
  it("revokes every session and goes to /login", async () => {
    await expect(signOutEverywhere()).rejects.toThrow("NEXT_REDIRECT");
    expect(m.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(m.redirect).toHaveBeenCalledWith("/login");
  });

  it("fails loudly instead of pretending", async () => {
    m.signOut.mockResolvedValue({ error: new AuthRetryableFetchError("fetch failed", 0) });
    await expect(signOutEverywhere()).rejects.toThrow("Could not sign out of all devices");
    expect(m.redirect).not.toHaveBeenCalled();
  });
});
