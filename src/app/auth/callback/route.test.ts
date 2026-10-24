import { AuthApiError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const m = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  syncProfile: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: m.exchangeCodeForSession } }),
}));
vi.mock("@/lib/auth/profile-sync", () => ({ syncProfileAfterSignIn: m.syncProfile }));

const ORIGIN = "http://localhost:3100";

async function callback(query: string) {
  const response = await GET(new NextRequest(`${ORIGIN}/auth/callback?${query}`));
  const location = response.headers.get("location");
  return {
    response,
    location: location?.startsWith(ORIGIN) ? location.slice(ORIGIN.length) : location,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
});

describe("GET /auth/callback", () => {
  it("exchanges the code, syncs the profile and continues to next", async () => {
    const { response, location } = await callback("code=abc&next=%2Fstats&week_start=7");
    expect(m.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(m.syncProfile).toHaveBeenCalledWith(expect.anything(), "user-1", { weekStart: 7 });
    expect(response.status).toBe(307);
    expect(location).toBe("/stats");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("defaults to /today and ignores a bad week start", async () => {
    const { location } = await callback("code=abc&week_start=3");
    expect(location).toBe("/today");
    expect(m.syncProfile).toHaveBeenCalledWith(expect.anything(), "user-1", {
      weekStart: undefined,
    });
  });

  it.each([
    "next=%2F%2Fevil.example",
    "next=https%3A%2F%2Fevil.example",
    "next=%2F%5Cevil.example",
    "next=%2Flogin",
  ])("only redirects on this origin (%s)", async (next) => {
    const { location } = await callback(`code=abc&${next}`);
    expect(location).toBe("/today");
  });

  it("reports a cancelled Google sign-in", async () => {
    const { location } = await callback(
      "error=access_denied&error_description=The+user+denied+access&next=%2Fhabits",
    );
    expect(location).toBe("/login?error=access_denied&next=%2Fhabits");
    expect(m.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("never echoes the provider's description", async () => {
    const { location } = await callback(
      "error=server_error&error_description=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    );
    expect(location).toBe("/login?error=oauth_failed");
  });

  it("handles a missing code", async () => {
    expect((await callback("next=%2Fstats")).location).toBe(
      "/login?error=missing_code&next=%2Fstats",
    );
  });

  it("handles a failed exchange without syncing", async () => {
    m.exchangeCodeForSession.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new AuthApiError("invalid flow state", 404, "flow_state_not_found"),
    });
    expect((await callback("code=old")).location).toBe("/login?error=exchange_failed");
    expect(m.syncProfile).not.toHaveBeenCalled();

    m.exchangeCodeForSession.mockRejectedValueOnce(new Error("network"));
    expect((await callback("code=old")).location).toBe("/login?error=exchange_failed");
  });
});
