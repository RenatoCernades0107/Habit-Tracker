import { describe, expect, it } from "vitest";

import { isAuthPath, isProtectedPath, loginPathFor, oauthCallbackUrl } from "./routes";

describe("isProtectedPath", () => {
  it.each([
    "/today",
    "/today/",
    "/habits",
    "/habits/new",
    "/habits/1/edit",
    "/stats",
    "/settings",
    "/settings/notifications",
    "/routine/abc",
    "/review/2026-W42",
    "/onboarding",
  ])("protects %s", (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each(["/", "/login", "/auth/callback", "/offline", "/todayx", "/habitsfoo", "/api/push/test"])(
    "leaves %s public",
    (path) => {
      expect(isProtectedPath(path)).toBe(false);
    },
  );
});

describe("isAuthPath", () => {
  it.each(["/login", "/login/", "/Login", "/auth", "/auth/callback"])(
    "%s is part of sign-in",
    (p) => {
      expect(isAuthPath(p)).toBe(true);
    },
  );

  it.each(["/", "/today", "/authors", "/login-help"])("%s is not", (p) => {
    expect(isAuthPath(p)).toBe(false);
  });
});

describe("loginPathFor", () => {
  it("encodes the next path", () => {
    expect(loginPathFor("/today")).toBe("/login?next=%2Ftoday");
    expect(loginPathFor("/stats?range=30d")).toBe("/login?next=%2Fstats%3Frange%3D30d");
  });

  it("omits next when there is none", () => {
    expect(loginPathFor()).toBe("/login");
    expect(loginPathFor("")).toBe("/login");
  });
});

describe("oauthCallbackUrl", () => {
  it("points at /auth/callback on the same origin", () => {
    expect(oauthCallbackUrl("https://restart.example", "/today")).toBe(
      "https://restart.example/auth/callback?next=%2Ftoday",
    );
  });

  it("adds the week start when known", () => {
    expect(oauthCallbackUrl("http://localhost:3100", "/stats?range=7d", 7)).toBe(
      "http://localhost:3100/auth/callback?next=%2Fstats%3Frange%3D7d&week_start=7",
    );
  });
});
