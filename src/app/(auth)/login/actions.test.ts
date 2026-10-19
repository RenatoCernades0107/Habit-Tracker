import { AuthApiError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendCode, verifyCode } from "./actions";

const m = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  syncProfile: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  }),
  cookies: new Map<string, string>(),
  locale: "es",
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: m.redirect,
  RedirectType: { push: "push", replace: "replace" },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (m.cookies.has(name) ? { name, value: m.cookies.get(name) } : undefined),
  }),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => m.locale }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithOtp: m.signInWithOtp, verifyOtp: m.verifyOtp } }),
}));
vi.mock("@/lib/auth/profile-sync", () => ({ syncProfileAfterSignIn: m.syncProfile }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.cookies.clear();
  m.locale = "es";
  m.signInWithOtp.mockResolvedValue({ data: {}, error: null });
  m.verifyOtp.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
});

describe("sendCode", () => {
  it("rejects an invalid email before calling Supabase", async () => {
    expect(await sendCode({ email: "nope" })).toEqual({ ok: false, error: "invalidEmail" });
    expect(m.signInWithOtp).not.toHaveBeenCalled();
  });

  it("creates accounts on the fly with this device's settings (FR-ACC-2)", async () => {
    expect(
      await sendCode({ email: " Ana@Restart.TEST ", timeZone: "America/Lima", weekStart: 7 }),
    ).toEqual({ ok: true });
    expect(m.signInWithOtp).toHaveBeenCalledWith({
      email: "ana@restart.test",
      options: {
        shouldCreateUser: true,
        data: { locale: "es", timezone: "America/Lima", week_start: 7 },
      },
    });
  });

  it("falls back to the timezone cookie and omits unknown values", async () => {
    m.cookies.set("RESTART_TZ", "Europe/Madrid");
    m.locale = "en";
    await sendCode({ email: "ana@restart.test", timeZone: "Nowhere/Land", weekStart: 6 });
    expect(m.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { shouldCreateUser: true, data: { locale: "en", timezone: "Europe/Madrid" } },
      }),
    );

    m.cookies.clear();
    await sendCode({ email: "ana@restart.test" });
    expect(m.signInWithOtp).toHaveBeenLastCalledWith(
      expect.objectContaining({ options: { shouldCreateUser: true, data: { locale: "en" } } }),
    );
  });

  it("maps Supabase errors to friendly messages", async () => {
    m.signInWithOtp.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError("For security purposes…", 429, "over_email_send_rate_limit"),
    });
    expect(await sendCode({ email: "ana@restart.test" })).toEqual({
      ok: false,
      error: "rateLimited",
    });

    m.signInWithOtp.mockRejectedValueOnce(new Error("socket hang up"));
    expect(await sendCode({ email: "ana@restart.test" })).toEqual({
      ok: false,
      error: "generic",
    });
  });
});

describe("verifyCode", () => {
  it("rejects a malformed code before calling Supabase", async () => {
    expect(await verifyCode({ email: "ana@restart.test", code: "12a" })).toEqual({
      ok: false,
      error: "codeFormat",
    });
    expect(m.verifyOtp).not.toHaveBeenCalled();
  });

  it("reports a wrong or expired code without redirecting", async () => {
    m.verifyOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new AuthApiError("Token has expired or is invalid", 403, "otp_expired"),
    });
    expect(await verifyCode({ email: "ana@restart.test", code: "123456" })).toEqual({
      ok: false,
      error: "invalidCode",
    });
    expect(m.redirect).not.toHaveBeenCalled();
    expect(m.syncProfile).not.toHaveBeenCalled();
  });

  it("signs in, syncs the profile and continues to next", async () => {
    await expect(
      verifyCode({
        email: "Ana@restart.test",
        code: "123456",
        next: "/stats?range=7d",
        timeZone: "America/Lima",
        weekStart: 1,
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(m.verifyOtp).toHaveBeenCalledWith({
      email: "ana@restart.test",
      token: "123456",
      type: "email",
    });
    expect(m.syncProfile).toHaveBeenCalledWith(expect.anything(), "user-1", {
      timeZone: "America/Lima",
      weekStart: 1,
    });
    expect(m.redirect).toHaveBeenCalledWith("/stats?range=7d", "replace");
  });

  it.each(["//evil.example", "https://evil.example", "/login", undefined])(
    "never redirects off-site or back to sign-in (next=%j)",
    async (next) => {
      await expect(verifyCode({ email: "ana@restart.test", code: "123456", next })).rejects.toThrow(
        "NEXT_REDIRECT",
      );
      expect(m.redirect).toHaveBeenCalledWith("/today", "replace");
    },
  );
});
