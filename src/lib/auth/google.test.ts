// @vitest-environment jsdom
import { AuthApiError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startGoogleSignIn } from "./google";

const m = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithOAuth: m.signInWithOAuth } }),
}));

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

function settings(google: boolean) {
  return new Response(JSON.stringify({ external: { email: true, google } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  m.signInWithOAuth.mockReset();
  m.signInWithOAuth.mockResolvedValue({ data: { provider: "google", url: "x" }, error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startGoogleSignIn", () => {
  it("redirects through /auth/callback on this origin with the safe next path", async () => {
    fetchMock.mockResolvedValue(settings(true));

    expect(await startGoogleSignIn({ next: "/stats", weekStart: 7 })).toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:54321/auth/v1/settings",
      expect.objectContaining({ headers: { apikey: "sb_publishable_test" } }),
    );
    expect(m.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Fstats&week_start=7`,
        queryParams: { prompt: "select_account" },
      },
    });
  });

  it("says so when the provider is off, without leaving the page", async () => {
    fetchMock.mockResolvedValue(settings(false));
    expect(await startGoogleSignIn({ next: "/today" })).toBe("googleUnavailable");
    expect(m.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("still tries when the settings can't be read", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    expect(await startGoogleSignIn({ next: "/today" })).toBeNull();
    expect(m.signInWithOAuth).toHaveBeenCalled();
  });

  it("maps failures", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await startGoogleSignIn({ next: "/today" })).toBe("network");

    fetchMock.mockResolvedValue(settings(true));
    m.signInWithOAuth.mockResolvedValueOnce({
      data: { provider: "google", url: null },
      error: new AuthApiError(
        "Unsupported provider: provider is not enabled",
        400,
        "validation_failed",
      ),
    });
    expect(await startGoogleSignIn({ next: "/today" })).toBe("googleUnavailable");
  });
});
