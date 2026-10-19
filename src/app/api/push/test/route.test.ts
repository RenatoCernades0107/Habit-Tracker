import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase } from "@/server/push/testing/fake-supabase";

import { POST } from "./route";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date("2026-10-19T15:00:00.000Z");
const VAPID_PUBLIC_KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

const m = vi.hoisted(() => ({
  user: null as { id: string } | null,
  db: null as FakeSupabase | null,
  publicKey: undefined as string | undefined,
  today: "2026-10-19" as string | null,
  send: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ sendNotification: m.send }));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => m.user }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => m.db }));
vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: m.publicKey }),
}));
vi.mock("@/lib/env.server", () => ({
  getServerEnv: () => ({ VAPID_PRIVATE_KEY: "private", VAPID_SUBJECT: "mailto:a@b.c" }),
}));

function request(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/push/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function pendingTest(sendAt: Date, status = "pending") {
  return {
    user_id: ALICE,
    kind: "test",
    status,
    send_at: sendAt.toISOString(),
    dedupe_key: `test:${Math.random()}`,
  };
}

const device = (id: string) => ({
  id,
  user_id: ALICE,
  endpoint: `https://web.push.apple.com/${id}`,
  p256dh: "B" + "x".repeat(86),
  auth: "a".repeat(22),
  failure_count: 0,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  m.user = { id: ALICE };
  m.publicKey = VAPID_PUBLIC_KEY;
  m.today = "2026-10-19";
  m.db = new FakeSupabase()
    .onRpc("srv_user_today", () => m.today)
    .seed("profiles", [{ id: ALICE, locale: "es", timezone: "America/Lima" }]);
  m.send.mockResolvedValue({ statusCode: 201 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/push/test", () => {
  it("needs a session", async () => {
    m.user = null;
    const response = await POST(request({ mode: "now" }));
    expect(response.status).toBe(401);
    expect(m.send).not.toHaveBeenCalled();
  });

  describe("scheduled", () => {
    it("queues a test row that the tick will send (spike S2)", async () => {
      const response = await POST(request({ mode: "scheduled" }));

      expect(response.status).toBe(202);
      const body = await response.json();
      expect(body).toEqual({ id: expect.any(Number), scheduledFor: "2026-10-19T15:01:00.000Z" });

      expect(m.db?.rpcCalls).toEqual([{ name: "srv_user_today", args: { p_user_id: ALICE } }]);
      const [row] = m.db?.rows("scheduled_notifications") ?? [];
      expect(row).toMatchObject({
        id: body.id,
        user_id: ALICE,
        kind: "test",
        local_date: "2026-10-19",
        send_at: "2026-10-19T15:01:00.000Z",
      });
      expect(String(row?.dedupe_key)).toMatch(new RegExp(`^test:${ALICE}:[0-9a-f-]{36}$`));
      expect(m.send).not.toHaveBeenCalled();
    });

    it("honours the delay", async () => {
      const response = await POST(request({ mode: "scheduled", delaySeconds: 0 }));
      expect((await response.json()).scheduledFor).toBe(NOW.toISOString());
    });

    it("falls back to the UTC date when the user has no profile", async () => {
      m.today = null;
      await POST(request({ mode: "scheduled", delaySeconds: 600 }));
      expect(m.db?.rows("scheduled_notifications")[0]?.local_date).toBe("2026-10-19");
    });

    it("allows at most 5 waiting tests", async () => {
      m.db?.seed(
        "scheduled_notifications",
        Array.from({ length: 5 }, (_, i) => pendingTest(new Date(NOW.getTime() + i * 1000))),
      );
      const response = await POST(request({ mode: "scheduled" }));
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("60");
      expect((await response.json()).error.code).toBe("rate_limited");
      expect(m.db?.rows("scheduled_notifications")).toHaveLength(5);
    });

    it("doesn't count finished or long-stuck tests against the limit", async () => {
      m.db?.seed("scheduled_notifications", [
        ...Array.from({ length: 3 }, () => pendingTest(NOW, "sent")),
        // Locally, without the Vault secrets, nothing ever drains the queue.
        ...Array.from({ length: 3 }, () => pendingTest(new Date(NOW.getTime() - 60 * 60_000))),
        pendingTest(NOW, "sending"),
      ]);
      const response = await POST(request({ mode: "scheduled" }));
      expect(response.status).toBe(202);
    });

    it("rejects delays outside 0–600 seconds", async () => {
      const response = await POST(request({ mode: "scheduled", delaySeconds: 601 }));
      expect(response.status).toBe(422);
    });
  });

  describe("now", () => {
    it("sends to every device right away, in the user's language", async () => {
      m.db?.seed("push_subscriptions", [device("d1"), device("d2")]);

      const response = await POST(request({ mode: "now" }));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ sent: 2, failed: 0 });
      expect(m.send).toHaveBeenCalledTimes(2);
      const payload = JSON.parse(String(m.send.mock.calls[0]?.[1]));
      expect(payload).toMatchObject({
        v: 1,
        kind: "test",
        title: "🔔 Prueba de Restart",
        url: "/settings#notifications",
        badge: 1,
      });
      expect(payload.tag).toMatch(/^test:[0-9a-f-]{36}$/);
      expect(m.send.mock.calls[0]?.[2]).toMatchObject({ TTL: 600, urgency: "high" });
      // Nothing goes through the queue.
      expect(m.db?.rows("scheduled_notifications")).toEqual([]);
    });

    it("is the default when there is no body", async () => {
      m.db?.seed("push_subscriptions", [device("d1")]);
      const response = await POST(request());
      expect(await response.json()).toEqual({ sent: 1, failed: 0 });
    });

    it("deletes devices that are gone and reports them as failed", async () => {
      m.db?.seed("push_subscriptions", [device("d1"), device("gone")]);
      m.send.mockImplementation(async (sub: { endpoint: string }) => {
        if (sub.endpoint.endsWith("gone")) throw Object.assign(new Error("x"), { statusCode: 410 });
        return { statusCode: 201 };
      });

      const response = await POST(request({ mode: "now" }));

      expect(await response.json()).toEqual({ sent: 1, failed: 1 });
      expect(m.db?.rows("push_subscriptions").map((r) => r.id)).toEqual(["d1"]);
    });

    it("reports zero devices without sending", async () => {
      const response = await POST(request({ mode: "now" }));
      expect(await response.json()).toEqual({ sent: 0, failed: 0 });
      expect(m.send).not.toHaveBeenCalled();
    });
  });

  it("answers 500 when push isn't configured", async () => {
    m.publicKey = undefined;
    const response = await POST(request({ mode: "now" }));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toEqual({
      code: "internal",
      message: "Push is not configured",
    });
  });
});
