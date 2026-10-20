import { describe, expect, it, vi } from "vitest";

import { opIdFor, signActionToken, verifyActionToken, type ActionClaims } from "./action-token";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env.server", () => ({ getServerEnv: () => ({ CRON_SECRET: "c".repeat(40) }) }));

const NOW = new Date("2026-10-20T12:00:00Z");
const claims: ActionClaims = {
  u: "11111111-1111-4111-8111-111111111111",
  h: "33333333-3333-4333-8333-333333333333",
  d: "2026-10-20",
  n: 42,
  exp: NOW.getTime() / 1000 + 60,
};

describe("action tokens", () => {
  it("round-trips, and rejects tampering, other keys and expiry", () => {
    const token = signActionToken(claims);
    expect(verifyActionToken(token, NOW)).toEqual(claims);

    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, u: "someone-else" })).toString(
      "base64url",
    );
    expect(verifyActionToken(`${forged}.${mac}`, NOW)).toBeNull();
    expect(verifyActionToken(`${body}.${mac}x`, NOW)).toBeNull();
    expect(verifyActionToken(signActionToken(claims, Buffer.from("other")), NOW)).toBeNull();
    expect(verifyActionToken(token, new Date(NOW.getTime() + 61_000))).toBeNull();
    expect(verifyActionToken("garbage", NOW)).toBeNull();
  });

  it("derives one op_id per notification, shaped as a UUID", () => {
    expect(opIdFor(claims)).toBe(opIdFor({ ...claims, exp: 0 }));
    expect(opIdFor(claims)).not.toBe(opIdFor({ ...claims, n: 43 }));
    expect(opIdFor(claims)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
