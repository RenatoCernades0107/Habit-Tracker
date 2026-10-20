import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase } from "@/server/push/testing/fake-supabase";

const m = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env.server", () => ({ getServerEnv: () => ({ CRON_SECRET: "c".repeat(40) }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => m.db }));

const { POST } = await import("./route");
const { signActionToken } = await import("@/server/notifications/action-token");

const claims = {
  u: "11111111-1111-4111-8111-111111111111",
  h: "33333333-3333-4333-8333-333333333333",
  d: "2026-10-20",
  n: 7,
  exp: Math.floor(Date.now() / 1000) + 3600,
};

const call = (body: unknown) =>
  POST(
    new Request("http://localhost:3000/api/notifications/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

let db: FakeSupabase;
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  db = new FakeSupabase().onRpc("srv_apply_check_in_op", () => ({ status: "done" }));
  m.db = db;
});

describe("POST /api/notifications/action", () => {
  it("Done logs the check-in with a fixed op_id and source notification", async () => {
    const token = signActionToken(claims);
    expect((await call({ token, action: "done" })).status).toBe(200);
    expect((await call({ token, action: "done" })).status).toBe(200);
    const [a, b] = db.rpcCalls;
    expect(a).toMatchObject({
      name: "srv_apply_check_in_op",
      args: {
        p_user_id: claims.u,
        p_habit_id: claims.h,
        p_local_date: claims.d,
        p_op: "complete",
        p_source: "notification",
      },
    });
    // The same op_id twice: apply_check_in_op makes the second a no-op.
    expect(a?.args.p_op_id).toBe(b?.args.p_op_id);
  });

  it("Snooze queues one reminder per notification", async () => {
    const token = signActionToken(claims);
    expect((await call({ token, action: "snooze", minutes: 30 })).status).toBe(200);
    const rows = db.rows("scheduled_notifications");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "habit_reminder",
      habit_id: claims.h,
      dedupe_key: `habit_reminder:${claims.h}:2026-10-20:snooze:7`,
    });
  });

  it("rejects bad tokens and bad bodies", async () => {
    expect((await call({ token: "nope", action: "done" })).status).toBe(401);
    expect((await call({ token: signActionToken(claims), action: "delete" })).status).toBe(422);
    expect(db.rpcCalls).toEqual([]);
  });
});
