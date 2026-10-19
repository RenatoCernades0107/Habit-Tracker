import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase } from "@/server/push/testing/fake-supabase";

import { DELETE, POST } from "./route";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/dXk3abc:APA91bHPRgkF";

const m = vi.hoisted(() => ({
  user: null as { id: string } | null,
  db: null as FakeSupabase | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => m.user }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => m.db }));
// The fake has no RLS; the route filters by user itself, which is what's tested here.
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => m.db }));

const validBody = {
  endpoint: ENDPOINT,
  keys: { p256dh: "B" + "x".repeat(86), auth: "a".repeat(22) },
  platform: "android",
  device_label: "Android · Chrome",
};

function request(
  method: "POST" | "DELETE",
  body: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
) {
  return new NextRequest("http://localhost:3000/api/push/subscriptions", {
    method,
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

let id = 0;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  m.user = { id: ALICE };
  m.db = new FakeSupabase({
    push_subscriptions: () => ({
      id: `sub-${++id}`,
      created_at: new Date().toISOString(),
      last_success_at: null,
      failure_count: 0,
    }),
  });
});

describe("POST /api/push/subscriptions", () => {
  it("needs a session", async () => {
    m.user = null;
    const response = await POST(request("POST", validBody));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "unauthorized", message: expect.any(String) },
    });
    expect(m.db?.rows("push_subscriptions")).toEqual([]);
  });

  it("stores the device and answers 201", async () => {
    const response = await POST(request("POST", validBody));
    expect(response.status).toBe(201);
    const { id: savedId } = await response.json();
    expect(m.db?.rows("push_subscriptions")).toEqual([
      expect.objectContaining({
        id: savedId,
        user_id: ALICE,
        endpoint: ENDPOINT,
        platform: "android",
        device_label: "Android · Chrome",
      }),
    ]);
  });

  it("moves a device from another account to this one", async () => {
    m.db?.seed("push_subscriptions", [
      {
        id: "bobs",
        user_id: BOB,
        endpoint: ENDPOINT,
        p256dh: "old",
        auth: "old",
        failure_count: 0,
      },
    ]);
    const response = await POST(request("POST", validBody));
    expect(response.status).toBe(201);
    expect(m.db?.rows("push_subscriptions")).toEqual([
      expect.objectContaining({ id: "bobs", user_id: ALICE, p256dh: validBody.keys.p256dh }),
    ]);
  });

  it.each([
    ["an endpoint that isn't a push service", { ...validBody, endpoint: "https://evil.example/x" }],
    [
      "userinfo pointing elsewhere",
      { ...validBody, endpoint: "https://fcm.googleapis.com@evil.example/x" },
    ],
    ["an internal address", { ...validBody, endpoint: "https://169.254.169.254/latest" }],
    ["bad keys", { ...validBody, keys: { p256dh: "short", auth: "a".repeat(22) } }],
    ["no keys", { endpoint: ENDPOINT }],
  ])("refuses %s with 422", async (_, body) => {
    const response = await POST(request("POST", body));
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error.code).toBe("validation_error");
    // Only field names come back, never the submitted values.
    expect(JSON.stringify(json)).not.toContain("evil.example");
    expect(m.db?.rows("push_subscriptions")).toEqual([]);
  });

  it("refuses malformed JSON", async () => {
    const response = await POST(request("POST", "{not json"));
    expect(response.status).toBe(422);
  });

  it("refuses bodies that aren't JSON (no cross-site form posts)", async () => {
    const response = await POST(
      request("POST", JSON.stringify(validBody), { "content-type": "text/plain" }),
    );
    expect(response.status).toBe(415);
    expect(m.db?.rows("push_subscriptions")).toEqual([]);
  });

  it("refuses oversized bodies", async () => {
    const response = await POST(request("POST", { ...validBody, padding: "x".repeat(10_000) }));
    expect(response.status).toBe(413);
  });

  it("answers 500 without database details when saving fails", async () => {
    m.db?.failNext("push_subscriptions", "upsert");
    const response = await POST(request("POST", validBody));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "internal", message: "Could not save the subscription" },
    });
  });
});

describe("DELETE /api/push/subscriptions", () => {
  it("needs a session", async () => {
    m.user = null;
    expect((await DELETE(request("DELETE", { endpoint: ENDPOINT }))).status).toBe(401);
  });

  it("deletes the user's own device and answers 204", async () => {
    m.db?.seed("push_subscriptions", [
      { id: "mine", user_id: ALICE, endpoint: ENDPOINT },
      { id: "other", user_id: ALICE, endpoint: `${ENDPOINT}-2` },
    ]);
    const response = await DELETE(request("DELETE", { endpoint: ENDPOINT }));
    expect(response.status).toBe(204);
    expect(m.db?.rows("push_subscriptions").map((r) => r.id)).toEqual(["other"]);
  });

  it("never deletes another user's device", async () => {
    m.db?.seed("push_subscriptions", [{ id: "bobs", user_id: BOB, endpoint: ENDPOINT }]);
    const response = await DELETE(request("DELETE", { endpoint: ENDPOINT }));
    expect(response.status).toBe(204);
    expect(m.db?.rows("push_subscriptions").map((r) => r.id)).toEqual(["bobs"]);
  });

  it("needs an endpoint", async () => {
    expect((await DELETE(request("DELETE", {}))).status).toBe(422);
  });
});
