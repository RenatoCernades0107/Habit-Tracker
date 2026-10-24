import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateSession } from "./proxy";

type CookieMethods = {
  getAll: () => { name: string; value: string }[];
  setAll: (
    cookies: { name: string; value: string; options: Record<string, unknown> }[],
    headers: Record<string, string>,
  ) => void;
};

const auth = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  cookies: undefined as CookieMethods | undefined,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: CookieMethods }) => {
    auth.cookies = options.cookies;
    return { auth: { getClaims: auth.getClaims, getUser: auth.getUser, signOut: auth.signOut } };
  },
}));

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55421");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3100");

const CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
};

function request() {
  const req = new NextRequest("http://localhost:3100/today");
  req.cookies.set("sb-127-auth-token", "old");
  return req;
}

beforeEach(() => {
  auth.getClaims.mockReset();
  auth.getUser.mockReset();
  auth.signOut.mockReset();
});

describe("updateSession", () => {
  it("reports a valid session and passes refreshed cookies on", async () => {
    auth.getClaims.mockImplementation(async () => {
      auth.cookies?.setAll(
        [{ name: "sb-127-auth-token", value: "new", options: { path: "/", httpOnly: false } }],
        CACHE_HEADERS,
      );
      return { data: { claims: { sub: "user-1" } }, error: null };
    });
    const req = request();

    const session = await updateSession(req);

    expect(session.state).toBe("signed-in");
    expect(session.response.cookies.get("sb-127-auth-token")?.value).toBe("new");
    expect(session.response.headers.get("cache-control")).toContain("no-store");
    // Server Components in the same request read the new token.
    expect(req.cookies.get("sb-127-auth-token")?.value).toBe("new");

    const redirect = session.carryOver(NextResponse.redirect("http://localhost:3100/login"));
    expect(redirect.cookies.get("sb-127-auth-token")?.value).toBe("new");
    expect(redirect.headers.get("cache-control")).toContain("no-store");
  });

  it("is signed out without a session", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: null });
    expect((await updateSession(request())).state).toBe("signed-out");
  });

  it("is signed out when the session can't be refreshed", async () => {
    auth.getClaims.mockResolvedValue({
      data: null,
      error: new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found"),
    });
    expect((await updateSession(request())).state).toBe("signed-out");
  });

  it("is unknown when the Auth server can't be reached", async () => {
    auth.getClaims.mockResolvedValue({
      data: null,
      error: new AuthRetryableFetchError("fetch failed", 0),
    });
    expect((await updateSession(request())).state).toBe("unknown");

    auth.getClaims.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await updateSession(request())).state).toBe("unknown");
  });

  describe("confirm", () => {
    beforeEach(() => {
      auth.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    });

    it("confirms a live session", async () => {
      auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
      const session = await updateSession(request());
      expect(await session.confirm()).toBe("signed-in");
      expect(auth.signOut).not.toHaveBeenCalled();
    });

    it("clears a revoked session from this browser", async () => {
      auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new AuthApiError("Session not found", 403, "session_not_found"),
      });
      auth.signOut.mockImplementation(async () => {
        auth.cookies?.setAll(
          [{ name: "sb-127-auth-token", value: "", options: { path: "/", maxAge: 0 } }],
          CACHE_HEADERS,
        );
        return { error: null };
      });
      const session = await updateSession(request());

      expect(await session.confirm()).toBe("signed-out");
      expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(session.response.cookies.get("sb-127-auth-token")?.value).toBe("");
    });

    it("keeps the session when the Auth server is unreachable", async () => {
      auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new AuthRetryableFetchError("fetch failed", 0),
      });
      const session = await updateSession(request());
      expect(await session.confirm()).toBe("unknown");
      expect(auth.signOut).not.toHaveBeenCalled();
    });
  });
});
