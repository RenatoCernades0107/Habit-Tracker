import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env.server";

/** What a notification's buttons may act on (docs/spec/03-architecture.md §10). */
export type ActionClaims = {
  /** User */
  u: string;
  /** Habit */
  h: string;
  /** Habit day */
  d: string;
  /** Notification id, so each notification's buttons work once */
  n: number;
  /** Expiry, seconds since the epoch (at most 24 h after sending) */
  exp: number;
};

export const ACTION_TOKEN_TTL_S = 24 * 60 * 60;

/**
 * The signing key: ACTION_TOKEN_SECRET, or one derived from CRON_SECRET so a fresh deployment
 * works without another secret. The derivation keeps the two uses apart.
 */
function key(): Buffer {
  const env = getServerEnv();
  if (env.ACTION_TOKEN_SECRET) return Buffer.from(env.ACTION_TOKEN_SECRET);
  return createHash("sha256").update(`restart:action-token:${env.CRON_SECRET}`).digest();
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signActionToken(claims: ActionClaims, secret: Buffer = key()): string {
  const body = b64(JSON.stringify(claims));
  const mac = createHmac("sha256", secret).update(body).digest();
  return `${body}.${b64(mac)}`;
}

/** The claims of a valid, unexpired token, or null. */
export function verifyActionToken(
  token: string,
  now: Date,
  secret: Buffer = key(),
): ActionClaims | null {
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as ActionClaims;
    if (
      typeof claims.u !== "string" ||
      typeof claims.h !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(claims.d) ||
      !Number.isSafeInteger(claims.n) ||
      typeof claims.exp !== "number" ||
      claims.exp * 1000 < now.getTime()
    ) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

/**
 * The check-in op_id for "Done" on a notification: the same for every press, so
 * apply_check_in_op's idempotency makes the button single use.
 */
export function opIdFor(claims: ActionClaims): string {
  const hex = createHash("sha256").update(`done:${claims.n}:${claims.h}:${claims.d}`).digest("hex");
  // Shaped as a version-4 UUID.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
