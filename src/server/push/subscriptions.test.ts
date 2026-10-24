import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SubscriptionBody } from "@/lib/push/schemas";

import type { DeviceResult, DeviceSubscription } from "./sender";
import {
  loadRecipients,
  MAX_DEVICES_PER_USER,
  recordDeliveryResults,
  upsertSubscription,
  type AdminClient,
} from "./subscriptions";
import { FakeSupabase } from "./testing/fake-supabase";

vi.mock("server-only", () => ({}));

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENDPOINT = "https://web.push.apple.com/device-1";

const body: SubscriptionBody = {
  endpoint: ENDPOINT,
  keys: { p256dh: "B" + "x".repeat(86), auth: "a".repeat(22) },
  platform: "ios",
  device_label: "iPhone · Safari",
};

let uuid = 0;
const newDb = () =>
  new FakeSupabase({
    push_subscriptions: () => ({
      id: `sub-${++uuid}`,
      created_at: new Date(Date.UTC(2026, 9, 1, 0, uuid)).toISOString(),
      last_success_at: null,
      failure_count: 0,
    }),
  });

const asAdmin = (db: FakeSupabase) => db as unknown as AdminClient;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("upsertSubscription", () => {
  it("stores a new device", async () => {
    const db = newDb();
    const { id } = await upsertSubscription(asAdmin(db), ALICE, body);

    expect(db.rows("push_subscriptions")).toEqual([
      expect.objectContaining({
        id,
        user_id: ALICE,
        endpoint: ENDPOINT,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        platform: "ios",
        device_label: "iPhone · Safari",
        failure_count: 0,
      }),
    ]);
  });

  it("is idempotent for the same device", async () => {
    const db = newDb();
    const first = await upsertSubscription(asAdmin(db), ALICE, body);
    const second = await upsertSubscription(asAdmin(db), ALICE, body);
    expect(second.id).toBe(first.id);
    expect(db.rows("push_subscriptions")).toHaveLength(1);
  });

  it("moves a device that signs in to another account, with fresh keys", async () => {
    const db = newDb().seed("push_subscriptions", [
      {
        id: "sub-alice",
        user_id: ALICE,
        endpoint: ENDPOINT,
        p256dh: "old",
        auth: "old",
        failure_count: 4,
        created_at: "2026-10-01T00:00:00.000Z",
        last_success_at: null,
      },
    ]);

    const { id } = await upsertSubscription(asAdmin(db), BOB, { ...body, platform: undefined });

    expect(id).toBe("sub-alice");
    expect(db.rows("push_subscriptions")).toEqual([
      expect.objectContaining({
        user_id: BOB,
        p256dh: body.keys.p256dh,
        failure_count: 0,
        platform: null,
      }),
    ]);
    const upsert = db.log.find((q) => q.operation === "upsert");
    expect(upsert?.table).toBe("push_subscriptions");
  });

  it(`keeps at most ${MAX_DEVICES_PER_USER} devices, dropping the least recently used`, async () => {
    const db = newDb();
    const old = Array.from({ length: MAX_DEVICES_PER_USER }, (_, i) => ({
      id: `old-${i}`,
      user_id: ALICE,
      endpoint: `https://web.push.apple.com/old-${i}`,
      p256dh: "p",
      auth: "a",
      failure_count: 0,
      created_at: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
      // old-0 was created first but delivered to recently: it stays.
      last_success_at: i === 0 ? "2026-10-18T00:00:00.000Z" : null,
    }));
    db.seed("push_subscriptions", old);
    db.seed("push_subscriptions", [
      { ...old[0], id: "bob-1", user_id: BOB, endpoint: "https://web.push.apple.com/bob" },
    ]);

    const { id } = await upsertSubscription(asAdmin(db), ALICE, body);

    const alice = db.rows("push_subscriptions").filter((r) => r.user_id === ALICE);
    expect(alice).toHaveLength(MAX_DEVICES_PER_USER);
    expect(alice.map((r) => r.id)).toContain(id);
    expect(alice.map((r) => r.id)).toContain("old-0");
    expect(alice.map((r) => r.id)).not.toContain("old-1");
    // Other users are never touched.
    expect(db.rows("push_subscriptions").some((r) => r.id === "bob-1")).toBe(true);
  });

  it("throws a DatabaseError without the database message", async () => {
    const db = newDb().failNext("push_subscriptions", "upsert");
    const error = await upsertSubscription(asAdmin(db), ALICE, body).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: "DatabaseError", code: "XX000" });
    expect(String(error)).not.toContain("injected");
  });
});

describe("loadRecipients", () => {
  it("returns each user's devices and language, with defaults", async () => {
    const db = newDb()
      .seed("profiles", [{ id: ALICE, locale: "es", timezone: "America/Lima" }])
      .seed("push_subscriptions", [
        { id: "a1", user_id: ALICE, endpoint: "e1", p256dh: "p", auth: "a", failure_count: 0 },
        { id: "b1", user_id: BOB, endpoint: "e2", p256dh: "p", auth: "a", failure_count: 2 },
      ]);

    const recipients = await loadRecipients(asAdmin(db), [ALICE, BOB, ALICE]);

    expect(recipients.get(ALICE)).toMatchObject({ locale: "es", timeZone: "America/Lima" });
    expect(recipients.get(ALICE)?.devices.map((d) => d.id)).toEqual(["a1"]);
    // Bob has no profile row: English and UTC.
    expect(recipients.get(BOB)).toMatchObject({ locale: "en", timeZone: "UTC" });
    expect(recipients.get(BOB)?.devices[0]).toMatchObject({ id: "b1", failure_count: 2 });
    // Only what sending needs.
    expect(Object.keys(recipients.get(ALICE)?.devices[0] ?? {}).sort()).toEqual([
      "auth",
      "endpoint",
      "failure_count",
      "id",
      "p256dh",
      "user_id",
    ]);
  });

  it("queries in chunks of 100 users", async () => {
    const db = newDb();
    const ids = Array.from({ length: 250 }, (_, i) => `user-${i}`);
    await loadRecipients(asAdmin(db), ids);
    expect(db.log.filter((q) => q.table === "profiles")).toHaveLength(3);
    expect(db.log.filter((q) => q.table === "push_subscriptions")).toHaveLength(3);
  });
});

describe("recordDeliveryResults", () => {
  const device = (id: string, failureCount = 0): DeviceSubscription => ({
    id,
    user_id: ALICE,
    endpoint: `https://web.push.apple.com/${id}`,
    p256dh: "p",
    auth: "a",
    failure_count: failureCount,
  });

  it("records successes, deletes gone devices and counts failures", async () => {
    const db = newDb().seed("push_subscriptions", [
      { ...device("ok", 3) },
      { ...device("gone") },
      { ...device("flaky", 1) },
      { ...device("idle") },
    ]);
    const results: DeviceResult[] = [
      { subscription: device("ok", 3), outcome: { status: "delivered" } },
      { subscription: device("gone"), outcome: { status: "gone", error: "push service 410" } },
      {
        subscription: device("flaky", 1),
        outcome: { status: "retryable", error: "push service 503" },
      },
      { subscription: device("idle"), outcome: { status: "skipped" } },
    ];

    const { removed } = await recordDeliveryResults(
      asAdmin(db),
      results,
      "2026-10-19T15:00:00.000Z",
    );

    expect(removed).toBe(1);
    const byId = Object.fromEntries(db.rows("push_subscriptions").map((r) => [r.id, r]));
    expect(byId.ok).toMatchObject({
      failure_count: 0,
      last_success_at: "2026-10-19T15:00:00.000Z",
    });
    expect(byId.gone).toBeUndefined();
    expect(byId.flaky).toMatchObject({ failure_count: 2 });
    expect(byId.idle).toMatchObject({ failure_count: 0 });
  });

  it("logs bookkeeping errors instead of throwing", async () => {
    const db = newDb().failNext("push_subscriptions", "delete");
    await expect(
      recordDeliveryResults(
        asAdmin(db),
        [{ subscription: device("gone"), outcome: { status: "gone", error: "x" } }],
        "2026-10-19T15:00:00.000Z",
      ),
    ).resolves.toEqual({ removed: 1 });
    expect(console.error).toHaveBeenCalled();
  });
});
