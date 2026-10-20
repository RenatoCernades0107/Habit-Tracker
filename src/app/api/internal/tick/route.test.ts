import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase } from "@/server/push/testing/fake-supabase";

import * as route from "./route";

const SECRET = "s".repeat(48);
const VAPID_PUBLIC_KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

const m = vi.hoisted(() => ({
  db: null as FakeSupabase | null,
  publicKey: undefined as string | undefined,
  serverEnvError: false,
  send: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ sendNotification: m.send }));
vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: m.publicKey }),
}));
vi.mock("@/lib/env.server", () => ({
  getServerEnv: () => {
    if (m.serverEnvError) throw new Error("Invalid environment: CRON_SECRET");
    return { CRON_SECRET: SECRET, VAPID_PRIVATE_KEY: "private", VAPID_SUBJECT: "mailto:a@b.c" };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => m.db }));

function tick(headers: Record<string, string> = {}) {
  return route.POST(
    new NextRequest("http://localhost:3000/api/internal/tick", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: "{}",
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  m.publicKey = VAPID_PUBLIC_KEY;
  m.serverEnvError = false;
  m.db = new FakeSupabase()
    .onRpc("srv_claim_profiles_to_plan", () => [])
    .onRpc("srv_claim_due_notifications", () => []);
});

describe("POST /api/internal/tick", () => {
  it.each([
    ["no header", {}],
    ["a wrong secret of the same length", { "x-cron-secret": "t".repeat(48) }],
    ["a prefix of the secret", { "x-cron-secret": SECRET.slice(0, 20) }],
    ["a longer secret", { "x-cron-secret": `${SECRET}s` }],
    ["the secret in another header", { authorization: `Bearer ${SECRET}` }],
  ])("rejects %s with 401 and claims nothing", async (_, headers) => {
    const response = await tick(headers);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "unauthorized", message: expect.any(String) },
    });
    expect(m.db?.rpcCalls).toEqual([]);
  });

  it("plans, runs the dispatcher with the right secret and returns its counts", async () => {
    const response = await tick({ "x-cron-secret": SECRET });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      planned: 0,
      claimed: 0,
      sent: 0,
      suppressed: 0,
      failed: 0,
      retried: 0,
      deferred: 0,
      ms: expect.any(Number),
      calendar_jobs: 0,
    });
    expect(m.db?.rpcCalls).toEqual([
      { name: "srv_claim_profiles_to_plan", args: { p_max: 200 } },
      { name: "srv_claim_due_notifications", args: { p_max: 200 } },
    ]);
  });

  it("fails before claiming anything when the VAPID public key is missing", async () => {
    m.publicKey = undefined;
    const response = await tick({ "x-cron-secret": SECRET });
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("internal");
    expect(m.db?.rpcCalls).toEqual([]);
  });

  it("answers 500 when the server environment is incomplete", async () => {
    m.serverEnvError = true;
    const response = await tick({ "x-cron-secret": SECRET });
    expect(response.status).toBe(500);
  });

  it("answers 500 when the claim fails, without database details", async () => {
    m.db = new FakeSupabase();
    const response = await tick({ "x-cron-secret": SECRET });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "internal", message: "Tick failed" } });
  });

  it("only handles POST (Next.js answers 405 for the rest) and allows 60 s", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "maxDuration"]);
    expect(route.maxDuration).toBe(60);
  });
});
