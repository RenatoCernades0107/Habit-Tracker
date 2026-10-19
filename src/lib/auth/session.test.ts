import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getUser, requireUser } from "./session";

const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  }),
}));

// React's `cache` memoizes only inside a server request; here every call runs, so each
// test can return a different user.
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: m.getUser } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getUser", () => {
  it("returns the verified user", async () => {
    m.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    expect(await getUser()).toEqual({ id: "user-1" });
  });

  it("returns null when signed out, quietly", async () => {
    m.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    expect(await getUser()).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("returns null for a revoked session and logs it", async () => {
    m.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("Session not found", 403, "session_not_found"),
    });
    expect(await getUser()).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("requireUser", () => {
  it("returns the user when signed in", async () => {
    m.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    await expect(requireUser("/stats")).resolves.toEqual({ id: "user-1" });
  });

  it("redirects to /login with a safe way back", async () => {
    m.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    await expect(requireUser("/stats?range=7d")).rejects.toThrow("NEXT_REDIRECT");
    expect(m.redirect).toHaveBeenLastCalledWith("/login?next=%2Fstats%3Frange%3D7d");

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(m.redirect).toHaveBeenLastCalledWith("/login?next=%2Ftoday");

    await expect(requireUser("//evil.example")).rejects.toThrow("NEXT_REDIRECT");
    expect(m.redirect).toHaveBeenLastCalledWith("/login?next=%2Ftoday");
  });
});
