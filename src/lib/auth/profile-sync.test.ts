import { beforeEach, describe, expect, it, vi } from "vitest";

import type { createClient } from "@/lib/supabase/server";

import { syncProfileAfterSignIn } from "./profile-sync";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

const m = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  setCookie: vi.fn(),
  acceptLanguage: "es-PE,es;q=0.9" as string | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (m.cookies.has(name) ? { name, value: m.cookies.get(name) } : undefined),
    set: m.setCookie,
  }),
  headers: async () => new Headers(m.acceptLanguage ? { "accept-language": m.acceptLanguage } : {}),
}));

/** A tiny stand-in for the `from("profiles")` query builder. */
function fakeSupabase(
  profile: unknown,
  options: { selectError?: unknown; updateError?: unknown } = {},
) {
  const update = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: options.updateError ?? null })),
  }));
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: profile, error: options.selectError ?? null })),
        })),
      })),
      update,
    })),
  };
  return { client: client as unknown as ServerSupabase, update };
}

const fresh = { locale: "en", timezone: "UTC", week_start: 1, onboarding_completed_at: null };

beforeEach(() => {
  vi.clearAllMocks();
  m.cookies.clear();
  m.acceptLanguage = "es-PE,es;q=0.9";
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("syncProfileAfterSignIn", () => {
  it("copies this device's settings before onboarding", async () => {
    m.cookies.set("RESTART_TZ", "America/Lima");
    const { client, update } = fakeSupabase(fresh);

    await syncProfileAfterSignIn(client, "user-1", { weekStart: 7 });

    expect(update).toHaveBeenCalledWith({
      locale: "es",
      timezone: "America/Lima",
      week_start: 7,
    });
    expect(m.setCookie).not.toHaveBeenCalled();
  });

  it("prefers the timezone from the form", async () => {
    m.cookies.set("RESTART_TZ", "America/Lima");
    m.cookies.set("NEXT_LOCALE", "en");
    const { client, update } = fakeSupabase(fresh);

    await syncProfileAfterSignIn(client, "user-1", { timeZone: "Europe/Madrid" });

    expect(update).toHaveBeenCalledWith({ timezone: "Europe/Madrid" });
  });

  it("restores the saved language on a new device after onboarding", async () => {
    const { client, update } = fakeSupabase({
      ...fresh,
      locale: "es",
      onboarding_completed_at: "2026-10-01T00:00:00Z",
    });

    await syncProfileAfterSignIn(client, "user-1");

    expect(update).not.toHaveBeenCalled();
    expect(m.setCookie).toHaveBeenCalledWith(
      "NEXT_LOCALE",
      "es",
      expect.objectContaining({ path: "/", sameSite: "lax" }),
    );
  });

  it("never throws", async () => {
    const missing = fakeSupabase(null);
    await expect(syncProfileAfterSignIn(missing.client, "user-1")).resolves.toBeUndefined();
    expect(missing.update).not.toHaveBeenCalled();

    const failingSelect = fakeSupabase(null, { selectError: { code: "42501" } });
    await expect(syncProfileAfterSignIn(failingSelect.client, "user-1")).resolves.toBeUndefined();

    const failingUpdate = fakeSupabase(fresh, { updateError: { code: "22023" } });
    await expect(syncProfileAfterSignIn(failingUpdate.client, "user-1")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
