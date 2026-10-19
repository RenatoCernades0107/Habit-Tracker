import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELIVERY_POLICY } from "./policy";
import { classifyPushError, sendAll, sendToDevice, type DeviceSubscription } from "./sender";

const m = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ sendNotification: m.send }));

const VAPID = { subject: "mailto:test@example.com", publicKey: "pub", privateKey: "priv" };

const subscription = (
  endpoint = "https://fcm.googleapis.com/fcm/send/abc",
): DeviceSubscription => ({
  id: "sub-1",
  user_id: "user-1",
  endpoint,
  p256dh: "p256dh",
  auth: "auth",
  failure_count: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  m.send.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
});

describe("classifyPushError", () => {
  const withStatus = (statusCode: number) => Object.assign(new Error("x"), { statusCode });

  it.each([404, 410])("%i means the subscription is gone", (status) => {
    expect(classifyPushError(withStatus(status)).status).toBe("gone");
  });

  it.each([429, 500, 502, 503])("%i is worth retrying", (status) => {
    expect(classifyPushError(withStatus(status))).toEqual({
      status: "retryable",
      error: `push service ${status}`,
    });
  });

  it.each([400, 401, 403, 413])("%i is a permanent rejection", (status) => {
    expect(classifyPushError(withStatus(status)).status).toBe("rejected");
  });

  it("retries network errors and web-push's socket timeout", () => {
    expect(classifyPushError(Object.assign(new Error("x"), { code: "ETIMEDOUT" }))).toEqual({
      status: "retryable",
      error: "network ETIMEDOUT",
    });
    expect(classifyPushError(new Error("Socket timeout"))).toEqual({
      status: "retryable",
      error: "network timeout",
    });
  });

  it("rejects web-push's own validation errors with a fixed message", () => {
    const outcome = classifyPushError(
      new Error("The subscription p256dh value should be 65 bytes long."),
    );
    expect(outcome).toEqual({
      status: "rejected",
      error: "not sent: invalid subscription keys or VAPID details",
    });
  });
});

describe("sendToDevice", () => {
  it("sends with per-call VAPID details, TTL and urgency", async () => {
    await expect(
      sendToDevice(subscription(), '{"v":1}', DELIVERY_POLICY.daily_report, VAPID),
    ).resolves.toEqual({ status: "delivered" });
    expect(m.send).toHaveBeenCalledWith(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: "p256dh", auth: "auth" },
      },
      '{"v":1}',
      { vapidDetails: VAPID, TTL: 7200, urgency: "normal", timeout: 10_000 },
    );
  });

  it("never calls an endpoint outside the allowlist", async () => {
    const outcome = await sendToDevice(
      subscription("https://169.254.169.254/latest/meta-data"),
      "{}",
      DELIVERY_POLICY.test,
      VAPID,
    );
    expect(outcome.status).toBe("rejected");
    expect(m.send).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    m.send.mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));
    await expect(
      sendToDevice(subscription(), "{}", DELIVERY_POLICY.test, VAPID),
    ).resolves.toMatchObject({ status: "gone" });
  });
});

describe("sendAll", () => {
  it("skips jobs that haven't started when told to stop", async () => {
    let calls = 0;
    const jobs = Array.from({ length: 3 }, () => ({
      subscription: subscription(),
      payload: "{}",
      policy: DELIVERY_POLICY.test,
    }));
    const results = await sendAll(jobs, VAPID, { concurrency: 1, shouldStop: () => calls++ >= 1 });
    expect(results.map((r) => r.outcome.status)).toEqual(["delivered", "skipped", "skipped"]);
    expect(m.send).toHaveBeenCalledTimes(1);
  });

  it("returns results in job order", async () => {
    m.send.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("b")) throw Object.assign(new Error("x"), { statusCode: 500 });
      return { statusCode: 201 };
    });
    const results = await sendAll(
      ["a", "b", "c"].map((id) => ({
        subscription: { ...subscription(`https://fcm.googleapis.com/fcm/send/${id}`), id },
        payload: "{}",
        policy: DELIVERY_POLICY.test,
      })),
      VAPID,
    );
    expect(results.map((r) => [r.subscription.id, r.outcome.status])).toEqual([
      ["a", "delivered"],
      ["b", "retryable"],
      ["c", "delivered"],
    ]);
  });
});
