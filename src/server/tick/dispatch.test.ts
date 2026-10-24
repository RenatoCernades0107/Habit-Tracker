import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminClient } from "@/server/push/subscriptions";
import { FakeSupabase } from "@/server/push/testing/fake-supabase";

import { dispatchDueNotifications, MAX_ATTEMPTS, RETRY_DELAY_MS, summarize } from "./dispatch";

const m = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ sendNotification: m.send }));
vi.mock("@/lib/env.server", () => ({
  getServerEnv: () => ({ CRON_SECRET: "c".repeat(40), SUPABASE_SECRET_KEY: "sb_secret_test" }),
}));

const NOW = Date.parse("2026-10-19T15:00:00.000Z");
const VAPID = { subject: "mailto:test@example.com", publicKey: "pub", privateKey: "priv" };
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const P256DH = "B" + "x".repeat(86);
const AUTH = "a".repeat(22);

function device(id: string, userId = USER, failureCount = 0) {
  return {
    id,
    user_id: userId,
    endpoint: `https://web.push.apple.com/${id}`,
    p256dh: P256DH,
    auth: AUTH,
    failure_count: failureCount,
    last_success_at: null,
    created_at: "2026-10-01T00:00:00.000Z",
  };
}

const PROFILE = {
  id: USER,
  locale: "en",
  timezone: "America/Lima",
  day_start_hour: 4,
  week_start: 1,
  reminder_lead_min: 5,
  daily_report_enabled: true,
  daily_report_time: "22:00:00",
  weekly_review_enabled: true,
  weekly_review_dow: 7,
  weekly_review_time: "19:00:00",
  quiet_hours_start: null,
  quiet_hours_end: null,
  muted_until: null,
};

const HABIT = {
  id: "33333333-3333-4333-8333-333333333333",
  user_id: USER,
  name: "Meditar",
  icon: null,
  color: null,
  cue: "Después del café",
  kind: "boolean",
  target_value: null,
  unit: null,
  increment_step: 1,
  schedule_type: "daily",
  days_of_week: null,
  times_per_week: null,
  time_of_day: "10:05:00",
  routine_id: null,
  category_id: null,
  sort_order: 0,
  start_date: "2026-10-01",
  archived_on: null,
  deleted_at: null,
  reminder_enabled: true,
  reminder_lead_min: null,
};

let nextNotificationId = 100;

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: nextNotificationId++,
    user_id: USER,
    kind: "test",
    habit_id: null,
    routine_id: null,
    local_date: "2026-10-19",
    send_at: new Date(NOW - 30_000).toISOString(),
    status: "pending",
    suppressed_reason: null,
    attempts: 0,
    last_error: null,
    claimed_at: null,
    sent_at: null,
    dedupe_key: `test:${USER}:${nextNotificationId}`,
    created_at: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  };
}

/** Behaves like public.srv_claim_due_notifications: due pending rows → sending, attempts + 1. */
function withClaim(db: FakeSupabase) {
  return db.onRpc("srv_claim_due_notifications", (args) => {
    const max = Number(args.p_max);
    const due = db
      .rows("scheduled_notifications")
      .filter((row) => row.status === "pending" && Date.parse(String(row.send_at)) <= NOW)
      .sort((a, b) => String(a.send_at).localeCompare(String(b.send_at)))
      .slice(0, max);
    for (const row of due) {
      row.status = "sending";
      row.claimed_at = new Date(NOW).toISOString();
      row.attempts = Number(row.attempts) + 1;
    }
    return due.map((row) => ({ ...row }));
  });
}

function setup({
  notifications = [notification()],
  devices = [device("dev-1")],
  profiles = [PROFILE],
}: {
  notifications?: Record<string, unknown>[];
  devices?: Record<string, unknown>[];
  profiles?: Record<string, unknown>[];
} = {}) {
  const db = withClaim(new FakeSupabase());
  db.seed("scheduled_notifications", notifications);
  db.seed("push_subscriptions", devices);
  db.seed("profiles", profiles);
  return db;
}

function run(
  db: FakeSupabase,
  options: Partial<Parameters<typeof dispatchDueNotifications>[0]> = {},
) {
  return dispatchDueNotifications({
    admin: db as unknown as AdminClient,
    vapid: VAPID,
    now: () => NOW,
    ...options,
  });
}

const row = (db: FakeSupabase, id: unknown) =>
  db.rows("scheduled_notifications").find((r) => r.id === id);

const pushError = (statusCode: number) =>
  Object.assign(new Error("Received unexpected response code"), {
    statusCode,
    body: "secret body with endpoint https://web.push.apple.com/abc",
    endpoint: "https://web.push.apple.com/abc",
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.send.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
});

describe("dispatchDueNotifications", () => {
  it("sends a due test to every device and marks it sent", async () => {
    const n = notification();
    const db = setup({ notifications: [n], devices: [device("dev-1"), device("dev-2")] });

    const counts = await run(db);

    expect(counts).toMatchObject({ claimed: 1, sent: 1, suppressed: 0, failed: 0, retried: 0 });
    expect(db.rpcCalls[0]).toEqual({
      name: "srv_claim_due_notifications",
      args: { p_max: 200 },
    });
    expect(m.send).toHaveBeenCalledTimes(2);

    const [subscription, body, options] = m.send.mock.calls[0] ?? [];
    expect(subscription).toEqual({
      endpoint: "https://web.push.apple.com/dev-1",
      keys: { p256dh: P256DH, auth: AUTH },
    });
    expect(options).toEqual({ vapidDetails: VAPID, TTL: 600, urgency: "high", timeout: 10_000 });
    const payload = JSON.parse(String(body));
    expect(payload).toMatchObject({
      v: 1,
      kind: "test",
      title: "🔔 Restart test",
      tag: `test:${n.id}`,
      url: "/settings#notifications",
      badge: 1,
    });
    // Shown in the profile's time zone (Lima is UTC-5), so spike S2 can read the delay.
    expect(payload.body).toContain("9:59:30");
    expect(payload.body).toContain("10:00:00");

    expect(row(db, n.id)).toMatchObject({ status: "sent", sent_at: new Date(NOW).toISOString() });
    for (const sub of db.rows("push_subscriptions")) {
      expect(sub).toMatchObject({ last_success_at: new Date(NOW).toISOString(), failure_count: 0 });
    }
  });

  it("writes the notification in the user's language", async () => {
    const db = setup({ profiles: [{ id: USER, locale: "es", timezone: "Europe/Madrid" }] });
    await run(db);
    const payload = JSON.parse(String(m.send.mock.calls[0]?.[1]));
    expect(payload.title).toBe("🔔 Prueba de Restart");
    expect(payload.body).toContain("17:00:00");
  });

  it("deletes a subscription that is gone (410) and still counts the others", async () => {
    const n = notification();
    const db = setup({ notifications: [n], devices: [device("dev-old"), device("dev-new")] });
    m.send.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("dev-old")) throw pushError(410);
      return { statusCode: 201 };
    });

    const counts = await run(db);

    expect(counts.sent).toBe(1);
    expect(row(db, n.id)?.status).toBe("sent");
    expect(db.rows("push_subscriptions").map((s) => s.id)).toEqual(["dev-new"]);
  });

  it("fails a notification whose only device is gone (404), without retrying", async () => {
    const n = notification();
    const db = setup({ notifications: [n] });
    m.send.mockRejectedValue(pushError(404));

    const counts = await run(db);

    expect(counts).toMatchObject({ failed: 1, retried: 0 });
    expect(row(db, n.id)).toMatchObject({ status: "failed" });
    expect(String(row(db, n.id)?.last_error)).toContain("404");
    expect(db.rows("push_subscriptions")).toEqual([]);
  });

  it("retries a temporary failure in a minute, then fails after the last attempt", async () => {
    const n = notification();
    const db = setup({ notifications: [n] });
    m.send.mockRejectedValue(pushError(503));

    // Attempt 1 and 2: back to pending, one minute later.
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      const counts = await run(db);
      expect(counts).toMatchObject({ claimed: 1, retried: 1, failed: 0 });
      expect(row(db, n.id)).toMatchObject({
        status: "pending",
        attempts: attempt,
        claimed_at: null,
        send_at: new Date(NOW + RETRY_DELAY_MS).toISOString(),
        last_error: "push service 503",
      });
      // Due again (the fake claim compares with NOW).
      row(db, n.id)!.send_at = new Date(NOW - 1000).toISOString();
    }

    // Attempt 3: failed for good.
    const counts = await run(db);
    expect(counts).toMatchObject({ retried: 0, failed: 1 });
    expect(row(db, n.id)).toMatchObject({
      status: "failed",
      attempts: 3,
      last_error: "push service 503",
    });
    // The device stays, with its failures counted.
    expect(db.rows("push_subscriptions")[0]).toMatchObject({ failure_count: 3 });
  });

  it("treats 429 and network errors as temporary", async () => {
    const a = notification();
    const b = notification({ user_id: OTHER_USER });
    const db = setup({
      notifications: [a, b],
      devices: [device("dev-1"), device("dev-2", OTHER_USER)],
      profiles: [
        { id: USER, locale: "en", timezone: "UTC" },
        { id: OTHER_USER, locale: "en", timezone: "UTC" },
      ],
    });
    m.send.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("dev-1")) throw pushError(429);
      throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    });

    const counts = await run(db);

    expect(counts.retried).toBe(2);
    expect(row(db, a.id)?.last_error).toBe("push service 429");
    expect(row(db, b.id)?.last_error).toBe("network ECONNRESET");
  });

  it("fails other 4xx responses right away and keeps errors free of secrets", async () => {
    const n = notification();
    const db = setup({ notifications: [n] });
    m.send.mockRejectedValue(pushError(403));

    const counts = await run(db);

    expect(counts.failed).toBe(1);
    const error = String(row(db, n.id)?.last_error);
    expect(error).toBe("push service 403");
    expect(error).not.toContain("web.push.apple.com");
    expect(db.rows("push_subscriptions")[0]).toMatchObject({ failure_count: 1 });
  });

  it("suppresses stale notifications without sending", async () => {
    const stale = notification({ send_at: new Date(NOW - 11 * 60_000).toISOString() });
    const fresh = notification({ send_at: new Date(NOW - 9 * 60_000).toISOString() });
    const db = setup({ notifications: [stale, fresh] });

    const counts = await run(db);

    expect(counts).toMatchObject({ claimed: 2, suppressed: 1, sent: 1 });
    expect(row(db, stale.id)).toMatchObject({ status: "suppressed", suppressed_reason: "stale" });
    expect(m.send).toHaveBeenCalledTimes(1);
  });

  it("uses longer stale windows for digests, reports and reviews", async () => {
    const report = notification({
      kind: "daily_report",
      send_at: new Date(NOW - 3 * 60 * 60_000).toISOString(),
    });
    const review = notification({
      kind: "weekly_review",
      send_at: new Date(NOW - 3 * 60 * 60_000).toISOString(),
    });
    const db = setup({ notifications: [report, review] });

    await run(db);

    expect(row(db, report.id)).toMatchObject({ suppressed_reason: "stale" });
    // 3 hours is within the weekly review's 12 hours.
    expect(row(db, review.id)).toMatchObject({ status: "sent" });
  });

  it("sends a pending habit reminder with Done and Snooze, in the user's language", async () => {
    const reminder = notification({
      kind: "habit_reminder",
      habit_id: HABIT.id,
      dedupe_key: `habit_reminder:${HABIT.id}:2026-10-19`,
    });
    const db = setup({ notifications: [reminder], profiles: [{ ...PROFILE, locale: "es" }] });
    db.seed("habits", [HABIT]);

    const counts = await run(db);

    expect(counts).toMatchObject({ sent: 1, suppressed: 0 });
    const payload = JSON.parse(String(m.send.mock.calls[0]?.[1]));
    expect(payload).toMatchObject({
      kind: "habit_reminder",
      title: "⏰ Meditar en 5 min",
      body: "Después del café",
      tag: `habit:${HABIT.id}:2026-10-19`,
      url: `/today?habit=${HABIT.id}`,
      badge: 1,
      actions: [
        { action: "done", title: "Hecho" },
        { action: "snooze", title: "15 min" },
      ],
    });
    expect(payload.actionToken).toEqual(expect.any(String));
  });

  it("R-NTF-7: suppresses a reminder that's done, and one for a habit that's gone", async () => {
    const done = notification({ kind: "habit_reminder", habit_id: HABIT.id });
    const gone = notification({ kind: "habit_reminder", habit_id: "gone" });
    const db = setup({ notifications: [done, gone] });
    db.seed("habits", [HABIT]);
    db.seed("check_ins", [
      {
        user_id: USER,
        habit_id: HABIT.id,
        local_date: "2026-10-19",
        status: "done",
        value: null,
        skip_reason: null,
        note: null,
        source: "app",
        deleted_at: null,
      },
    ]);

    const counts = await run(db);

    expect(counts.suppressed).toBe(2);
    expect(row(db, done.id)).toMatchObject({ status: "suppressed", suppressed_reason: "done" });
    expect(row(db, gone.id)).toMatchObject({ status: "suppressed", suppressed_reason: "inactive" });
    expect(m.send).not.toHaveBeenCalled();
  });

  it("suppresses notifications for users without devices", async () => {
    const n = notification();
    const db = setup({ notifications: [n], devices: [] });

    const counts = await run(db);

    expect(counts.suppressed).toBe(1);
    expect(row(db, n.id)).toMatchObject({
      status: "suppressed",
      suppressed_reason: "no_subscriptions",
    });
  });

  it("loads devices and profiles once per batch, not per notification", async () => {
    const db = setup({ notifications: [notification(), notification(), notification()] });

    await run(db);

    const reads = db.log.filter((q) => q.operation === "select");
    expect(reads.map((q) => q.table).sort()).toEqual(["profiles", "push_subscriptions"]);
    expect(reads[0]?.filters).toEqual([{ kind: "in", column: expect.any(String), values: [USER] }]);
  });

  it("groups identical outcomes into one update", async () => {
    const db = setup({ notifications: [notification(), notification(), notification()] });

    await run(db);

    const updates = db.log.filter(
      (q) => q.table === "scheduled_notifications" && q.operation === "update",
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]?.filters).toContainEqual({ kind: "eq", column: "status", value: "sending" });
  });

  it("keeps claiming while full batches come back", async () => {
    const db = setup({ notifications: [notification(), notification(), notification()] });

    const counts = await run(db, { batchSize: 2 });

    expect(db.rpcCalls).toHaveLength(2);
    expect(counts).toMatchObject({ claimed: 3, sent: 3 });
  });

  it("stops claiming once the time budget is spent", async () => {
    const db = setup({ notifications: [notification(), notification(), notification()] });
    let clock = NOW;
    m.send.mockImplementation(async () => {
      clock += 30_000;
      return { statusCode: 201 };
    });

    const counts = await run(db, { batchSize: 1, now: () => clock });

    expect(db.rpcCalls).toHaveLength(1);
    expect(counts.claimed).toBe(1);
  });

  it("puts back what it couldn't start before the send budget ran out", async () => {
    const first = notification();
    const second = notification({ send_at: new Date(NOW - 10_000).toISOString() });
    const db = setup({ notifications: [first, second] });
    let clock = NOW;
    m.send.mockImplementation(async () => {
      clock += 45_000;
      return { statusCode: 201 };
    });

    const counts = await run(db, { now: () => clock, concurrency: 1 });

    expect(counts).toMatchObject({ claimed: 2, sent: 1, deferred: 1 });
    expect(m.send).toHaveBeenCalledTimes(1);
    // As if never claimed: the attempt is undone, so it gets all its tries later.
    expect(row(db, second.id)).toMatchObject({ status: "pending", claimed_at: null, attempts: 0 });
  });

  it("never has more than the concurrency limit in flight", async () => {
    const devices = Array.from({ length: 25 }, (_, i) => device(`dev-${i}`));
    const db = setup({ devices });
    let inFlight = 0;
    let peak = 0;
    m.send.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return { statusCode: 201 };
    });

    await run(db, { concurrency: 10 });

    expect(m.send).toHaveBeenCalledTimes(25);
    expect(peak).toBe(10);
  });

  it("puts the batch back when devices can't be loaded", async () => {
    const n = notification();
    const db = setup({ notifications: [n] });
    db.failNext("push_subscriptions", "select");

    await expect(run(db)).rejects.toThrow("load push subscriptions failed");
    expect(row(db, n.id)).toMatchObject({ status: "pending", attempts: 0, claimed_at: null });
    expect(m.send).not.toHaveBeenCalled();
  });

  it("throws when the claim fails", async () => {
    const db = new FakeSupabase();
    await expect(run(db)).rejects.toThrow("claim due notifications failed");
  });

  it("returns zero counts when nothing is due", async () => {
    const db = setup({ notifications: [] });
    expect(await run(db)).toEqual({
      claimed: 0,
      sent: 0,
      suppressed: 0,
      failed: 0,
      retried: 0,
      deferred: 0,
      ms: 0,
    });
  });
});

describe("summarize", () => {
  const sub = device("dev-1");

  it("is sent when any device got it", () => {
    expect(
      summarize([
        { subscription: sub, outcome: { status: "retryable", error: "push service 500" } },
        { subscription: sub, outcome: { status: "delivered" } },
      ]),
    ).toEqual({ type: "sent" });
  });

  it("prefers a retry over failing when some failure may be temporary", () => {
    expect(
      summarize([
        { subscription: sub, outcome: { status: "rejected", error: "push service 403" } },
        { subscription: sub, outcome: { status: "retryable", error: "push service 500" } },
      ]),
    ).toEqual({ type: "retryable", error: "push service 403; push service 500" });
  });

  it("defers when devices were skipped and nothing else may succeed later", () => {
    expect(summarize([{ subscription: sub, outcome: { status: "skipped" } }])).toEqual({
      type: "deferred",
    });
  });
});
