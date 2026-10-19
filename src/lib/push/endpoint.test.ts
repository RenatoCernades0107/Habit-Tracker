import { describe, expect, it } from "vitest";

import { isAllowedPushEndpoint, MAX_ENDPOINT_LENGTH } from "./endpoint";

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/dXk3abc:APA91bHPRgkF-3cOJ_9r2m",
    "https://fcm.googleapis.com/wp/dXk3abc:APA91bHPRgkF",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk-abc_123",
    "https://web.push.apple.com/QE3X9e-abc_DEF",
    "https://api.push.apple.com/3/device/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAABr%2fJ%3d%3d",
  ])("accepts a real push service: %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ["plain http", "http://fcm.googleapis.com/fcm/send/abc"],
    ["another scheme", "ftp://fcm.googleapis.com/fcm/send/abc"],
    ["another host", "https://evil.example/fcm/send/abc"],
    ["the service name in the path", "https://evil.example/fcm.googleapis.com/abc"],
    ["a lookalike suffix", "https://fcm.googleapis.com.evil.example/abc"],
    ["a lookalike prefix", "https://evilfcm.googleapis.com/abc"],
    ["a suffix without a dot", "https://evilpush.apple.com/abc"],
    ["the bare suffix domain", "https://push.apple.com/abc"],
    ["the bare WNS domain", "https://notify.windows.com/w/?token=abc"],
    ["userinfo before the host", "https://fcm.googleapis.com@evil.example/abc"],
    ["userinfo with a password", "https://fcm.googleapis.com:pw@evil.example/abc"],
    ["userinfo on an allowed host", "https://user@fcm.googleapis.com/fcm/send/abc"],
    ["a custom port", "https://fcm.googleapis.com:8443/fcm/send/abc"],
    ["an explicit default port", "https://fcm.googleapis.com:443/fcm/send/abc"],
    ["an IPv4 literal", "https://142.250.0.1/fcm/send/abc"],
    ["an IPv6 literal", "https://[::1]/fcm/send/abc"],
    ["localhost", "https://localhost/fcm/send/abc"],
    ["a trailing-dot host", "https://fcm.googleapis.com./fcm/send/abc"],
    ["a percent-encoded host", "https://fcm%2egoogleapis.com/fcm/send/abc"],
    ["an uppercase host", "https://FCM.googleapis.com/fcm/send/abc"],
    ["backslashes", "https://fcm.googleapis.com\\@evil.example/abc"],
    ["dot segments", "https://fcm.googleapis.com/a/../fcm/send/abc"],
    ["whitespace", " https://fcm.googleapis.com/fcm/send/abc"],
    ["a Unicode lookalike", "https://fcm.googleapis.cοm/fcm/send/abc"],
    ["no slashes", "https:fcm.googleapis.com/fcm/send/abc"],
    ["not a URL", "fcm.googleapis.com"],
    ["an empty string", ""],
  ])("rejects %s", (_, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isAllowedPushEndpoint(undefined)).toBe(false);
    expect(isAllowedPushEndpoint(null)).toBe(false);
    expect(isAllowedPushEndpoint({ href: "https://fcm.googleapis.com/x" })).toBe(false);
  });

  it("bounds the length", () => {
    const base = "https://fcm.googleapis.com/fcm/send/";
    expect(isAllowedPushEndpoint(base + "a".repeat(MAX_ENDPOINT_LENGTH - base.length))).toBe(true);
    expect(isAllowedPushEndpoint(base + "a".repeat(MAX_ENDPOINT_LENGTH - base.length + 1))).toBe(
      false,
    );
  });
});
