import { describe, expect, it } from "vitest";

import {
  base64UrlByteLength,
  subscriptionBodySchema,
  testBodySchema,
  unsubscribeBodySchema,
} from "./schemas";

// Shapes of real keys: p256dh is 65 bytes (87 base64url characters), auth 16 bytes (22).
const P256DH = "B" + "x".repeat(86);
const AUTH = "a".repeat(22);
const ENDPOINT = "https://web.push.apple.com/QE3X9e-abc_DEF";

const valid = {
  endpoint: ENDPOINT,
  keys: { p256dh: P256DH, auth: AUTH },
  platform: "ios",
  device_label: "iPhone · Safari",
};

describe("base64UrlByteLength", () => {
  it("counts decoded bytes, ignoring padding", () => {
    expect(base64UrlByteLength("AQID")).toBe(3);
    expect(base64UrlByteLength("AQI")).toBe(2);
    expect(base64UrlByteLength("AQI=")).toBe(2);
    expect(base64UrlByteLength(P256DH)).toBe(65);
    expect(base64UrlByteLength(AUTH)).toBe(16);
  });
});

describe("subscriptionBodySchema", () => {
  it("accepts what PushSubscription.toJSON() gives, with platform and label", () => {
    expect(subscriptionBodySchema.parse(valid)).toEqual(valid);
  });

  it("makes platform and label optional and drops blank labels", () => {
    const minimal: Partial<typeof valid> = { ...valid };
    delete minimal.platform;
    delete minimal.device_label;
    expect(subscriptionBodySchema.parse(minimal)).toEqual(minimal);
    expect(subscriptionBodySchema.parse({ ...valid, device_label: "   " }).device_label).toBe(
      undefined,
    );
    expect(subscriptionBodySchema.parse({ ...valid, device_label: "  Pixel  " }).device_label).toBe(
      "Pixel",
    );
  });

  it("accepts padded keys", () => {
    expect(
      subscriptionBodySchema.safeParse({
        ...valid,
        keys: { p256dh: `${P256DH}=`, auth: `${AUTH}==` },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["an endpoint that isn't a push service", { ...valid, endpoint: "https://evil.example/x" }],
    ["an http endpoint", { ...valid, endpoint: "http://web.push.apple.com/x" }],
    ["a missing endpoint", { keys: valid.keys }],
    ["missing keys", { endpoint: ENDPOINT }],
    ["a short p256dh", { ...valid, keys: { p256dh: P256DH.slice(1), auth: AUTH } }],
    ["a long p256dh", { ...valid, keys: { p256dh: `${P256DH}xx`, auth: AUTH } }],
    ["standard base64 keys", { ...valid, keys: { p256dh: P256DH.slice(1) + "+", auth: AUTH } }],
    ["a short auth secret", { ...valid, keys: { p256dh: P256DH, auth: "a".repeat(20) } }],
    ["a huge auth secret", { ...valid, keys: { p256dh: P256DH, auth: "a".repeat(5000) } }],
    ["an unknown platform", { ...valid, platform: "watch" }],
    ["a long label", { ...valid, device_label: "x".repeat(81) }],
    ["a label that isn't text", { ...valid, device_label: 42 }],
  ])("rejects %s", (_, body) => {
    expect(subscriptionBodySchema.safeParse(body).success).toBe(false);
  });
});

describe("unsubscribeBodySchema", () => {
  it("needs an endpoint of bounded length", () => {
    expect(unsubscribeBodySchema.parse({ endpoint: ENDPOINT })).toEqual({ endpoint: ENDPOINT });
    expect(unsubscribeBodySchema.safeParse({}).success).toBe(false);
    expect(unsubscribeBodySchema.safeParse({ endpoint: "" }).success).toBe(false);
    expect(unsubscribeBodySchema.safeParse({ endpoint: "x".repeat(2049) }).success).toBe(false);
  });
});

describe("testBodySchema", () => {
  it("defaults to sending now", () => {
    expect(testBodySchema.parse({})).toEqual({ mode: "now", delaySeconds: 0 });
    expect(testBodySchema.parse({ mode: "now", delaySeconds: 300 })).toEqual({
      mode: "now",
      delaySeconds: 0,
    });
  });

  it("schedules in 60 seconds unless told otherwise", () => {
    expect(testBodySchema.parse({ mode: "scheduled" })).toEqual({
      mode: "scheduled",
      delaySeconds: 60,
    });
    expect(testBodySchema.parse({ mode: "scheduled", delaySeconds: 0 })).toEqual({
      mode: "scheduled",
      delaySeconds: 0,
    });
    expect(testBodySchema.parse({ mode: "scheduled", delaySeconds: 600 }).delaySeconds).toBe(600);
  });

  it.each([
    { mode: "later" },
    { mode: "scheduled", delaySeconds: 601 },
    { mode: "scheduled", delaySeconds: -1 },
    { mode: "scheduled", delaySeconds: 1.5 },
    { mode: "scheduled", delaySeconds: "60" },
  ])("rejects %j", (body) => {
    expect(testBodySchema.safeParse(body).success).toBe(false);
  });
});
