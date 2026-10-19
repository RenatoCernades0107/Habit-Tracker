import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionState } from "@/lib/supabase/proxy";

import { config, proxy } from "./proxy";

const session = vi.hoisted(() => ({
  state: "signed-out" as SessionState,
  confirmed: "signed-in" as SessionState,
}));

vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: vi.fn(async () => ({
    state: session.state,
    response: NextResponse.next(),
    carryOver: (target: NextResponse) => {
      target.headers.set("x-carried", "1");
      return target;
    },
    confirm: vi.fn(async () => session.confirmed),
  })),
}));

const BASE = "http://localhost:3100";

function request(path: string, method = "GET") {
  return new NextRequest(new URL(path, BASE), { method });
}

function location(response: Response) {
  const value = response.headers.get("location");
  return value === null ? null : value.replace(BASE, "");
}

beforeEach(() => {
  session.state = "signed-out";
  session.confirmed = "signed-in";
});

describe("proxy routing", () => {
  it("sends signed-out visitors of the app to /login with a way back", async () => {
    const response = await proxy(request("/today"));
    expect(response.status).toBe(307);
    expect(location(response)).toBe("/login?next=%2Ftoday");
    // Refreshed cookies and no-cache headers ride along on the redirect.
    expect(response.headers.get("x-carried")).toBe("1");
  });

  it("keeps the query string in next", async () => {
    const response = await proxy(request("/habits/abc/edit?tab=2"));
    expect(location(response)).toBe("/login?next=%2Fhabits%2Fabc%2Fedit%3Ftab%3D2");
  });

  it.each(["/stats", "/settings", "/routine/1", "/review/2026-W42", "/onboarding"])(
    "protects %s",
    async (path) => {
      const response = await proxy(request(path));
      expect(location(response)).toBe(`/login?next=${encodeURIComponent(path)}`);
    },
  );

  it("lets signed-out visitors see public pages", async () => {
    for (const path of ["/", "/login", "/auth/callback?code=x"]) {
      expect(location(await proxy(request(path)))).toBeNull();
    }
  });

  it("never redirects Server Function calls", async () => {
    expect(location(await proxy(request("/today", "POST")))).toBeNull();
    session.state = "signed-in";
    expect(location(await proxy(request("/login", "POST")))).toBeNull();
  });

  it("doesn't sign anyone out when the Auth server is unreachable", async () => {
    session.state = "unknown";
    expect(location(await proxy(request("/today")))).toBeNull();
  });

  it("sends signed-in users from /login to the app", async () => {
    session.state = "signed-in";
    expect(location(await proxy(request("/login")))).toBe("/today");
    expect(location(await proxy(request("/login?next=%2Fstats%3Frange%3D7d")))).toBe(
      "/stats?range=7d",
    );
    expect(location(await proxy(request("/login?next=%2F%2Fevil.example")))).toBe("/today");
    expect(location(await proxy(request("/login?next=https%3A%2F%2Fevil.example")))).toBe("/today");
  });

  it("shows /login when the session was revoked elsewhere", async () => {
    session.state = "signed-in";
    session.confirmed = "signed-out";
    expect(location(await proxy(request("/login")))).toBeNull();
  });

  it("lets signed-in users through to the app", async () => {
    session.state = "signed-in";
    expect(location(await proxy(request("/today")))).toBeNull();
  });
});

describe("proxy matcher", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  it.each(["/", "/today", "/login", "/auth/callback", "/settings/notifications", "/api/push/test"])(
    "runs on %s",
    (url) => {
      expect(matches(url)).toBe(true);
    },
  );

  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image?url=%2Fa.png&w=64&q=75",
    "/favicon.ico",
    "/icon.png",
    "/apple-icon.png",
    "/icons/icon-192.png",
    "/manifest.webmanifest",
    "/sw.js",
    "/offline",
    "/spikes/s4-today.json",
    "/api/internal/tick",
    "/api/v1/check-ins",
    "/robots.txt",
    "/images/hero.webp",
  ])("skips %s", (url) => {
    expect(matches(url)).toBe(false);
  });
});
