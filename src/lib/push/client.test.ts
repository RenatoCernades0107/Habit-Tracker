import { describe, expect, it, vi } from "vitest";

import {
  deleteSubscription,
  parseVapidPublicKey,
  PushApiError,
  saveSubscription,
  sendTestNotification,
  ServiceWorkerTimeoutError,
  urlBase64ToUint8Array,
  usesApplicationServerKey,
  waitForServiceWorker,
} from "./client";

// A real VAPID public key (generated with web-push, not used anywhere).
const VAPID_PUBLIC_KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

function jsonResponse(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url with and without padding", () => {
    expect([...urlBase64ToUint8Array("AQID")]).toEqual([1, 2, 3]);
    expect([...urlBase64ToUint8Array("AQI")]).toEqual([1, 2]);
    expect([...urlBase64ToUint8Array("AQI=")]).toEqual([1, 2]);
    expect([...urlBase64ToUint8Array("AQ")]).toEqual([1]);
    expect([...urlBase64ToUint8Array("AQ==")]).toEqual([1]);
    expect([...urlBase64ToUint8Array("")]).toEqual([]);
  });

  it("maps the URL-safe alphabet (- and _) to bytes 62 and 63", () => {
    expect([...urlBase64ToUint8Array("-_-_")]).toEqual([0xfb, 0xff, 0xbf]);
  });

  it("decodes a VAPID public key to an uncompressed P-256 point", () => {
    const bytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });

  it("rejects standard base64 and malformed input", () => {
    expect(() => urlBase64ToUint8Array("ab+/")).toThrow(TypeError);
    expect(() => urlBase64ToUint8Array("a b")).toThrow(TypeError);
    expect(() => urlBase64ToUint8Array("A")).toThrow(TypeError);
  });
});

describe("parseVapidPublicKey", () => {
  it("accepts a valid key", () => {
    expect(parseVapidPublicKey(VAPID_PUBLIC_KEY)?.length).toBe(65);
  });

  it("returns null for missing or wrong keys", () => {
    expect(parseVapidPublicKey(undefined)).toBeNull();
    expect(parseVapidPublicKey("")).toBeNull();
    expect(parseVapidPublicKey("not a key!")).toBeNull();
    expect(parseVapidPublicKey("AQID")).toBeNull();
    // 65 bytes but not starting with 0x04 (compressed or garbage).
    expect(parseVapidPublicKey("A" + VAPID_PUBLIC_KEY.slice(1))).toBeNull();
  });
});

describe("usesApplicationServerKey", () => {
  const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  const subscriptionWith = (applicationServerKey: ArrayBuffer | null) =>
    ({ options: { applicationServerKey, userVisibleOnly: true } }) as PushSubscription;

  it("matches the same key", () => {
    expect(usesApplicationServerKey(subscriptionWith(key.slice().buffer), key)).toBe(true);
  });

  it("detects a rotated key", () => {
    const other = key.slice();
    other[10] = (other[10] ?? 0) ^ 0xff;
    expect(usesApplicationServerKey(subscriptionWith(other.buffer), key)).toBe(false);
  });

  it("assumes a match when the browser doesn't expose the key", () => {
    expect(usesApplicationServerKey(subscriptionWith(null), key)).toBe(true);
  });
});

describe("waitForServiceWorker", () => {
  it("resolves with the registration once ready", async () => {
    const registration = { scope: "/" } as ServiceWorkerRegistration;
    await expect(
      waitForServiceWorker(1000, { ready: Promise.resolve(registration) }),
    ).resolves.toBe(registration);
  });

  it("gives up when no worker ever becomes ready", async () => {
    vi.useFakeTimers();
    const pending = waitForServiceWorker(5000, { ready: new Promise(() => {}) });
    const assertion = expect(pending).rejects.toBeInstanceOf(ServiceWorkerTimeoutError);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    vi.useRealTimers();
  });
});

describe("API calls", () => {
  const subscription = {
    toJSON: () => ({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "p", auth: "a" },
    }),
  } as unknown as PushSubscription;

  it("posts the subscription as JSON with the device details", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(201, { id: "1" }));
    await saveSubscription(
      subscription,
      { platform: "ios", deviceLabel: "iPhone · Safari" },
      fetchImpl,
    );

    const [path, init] = fetchImpl.mock.calls[0] ?? [];
    expect(path).toBe("/api/push/subscriptions");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "p", auth: "a" },
      platform: "ios",
      device_label: "iPhone · Safari",
    });
  });

  it("throws the API's error code", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(401, { error: { code: "unauthorized", message: "x" } }));
    const error = await saveSubscription(
      subscription,
      { platform: "desktop", deviceLabel: "" },
      fetchImpl,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PushApiError);
    expect(error).toMatchObject({ status: 401, code: "unauthorized" });
  });

  it("copes with error responses that aren't JSON", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("Bad gateway", { status: 502 }));
    await expect(deleteSubscription("https://x", fetchImpl)).rejects.toMatchObject({
      status: 502,
      code: "unknown",
    });
  });

  it("deletes by endpoint and accepts 204", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteSubscription("https://x", fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });

  it("reads both kinds of test results", async () => {
    const now = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { sent: 2, failed: 1 }));
    await expect(sendTestNotification("now", { fetchImpl: now })).resolves.toEqual({
      mode: "now",
      sent: 2,
      failed: 1,
    });
    expect(JSON.parse(String(now.mock.calls[0]?.[1]?.body))).toEqual({ mode: "now" });

    const scheduled = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(202, { scheduledFor: "2026-10-19T15:00:00.000Z" }));
    await expect(
      sendTestNotification("scheduled", { fetchImpl: scheduled, delaySeconds: 60 }),
    ).resolves.toEqual({ mode: "scheduled", scheduledFor: "2026-10-19T15:00:00.000Z" });
    expect(JSON.parse(String(scheduled.mock.calls[0]?.[1]?.body))).toEqual({
      mode: "scheduled",
      delaySeconds: 60,
    });
  });
});
