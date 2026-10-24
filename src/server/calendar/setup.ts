import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";

import { GoogleClient, type Fetch } from "./google";

/** The Google client, or null until GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY are set. */
export function googleClient(fetchImpl?: Fetch): GoogleClient | null {
  const env = getServerEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.TOKEN_ENCRYPTION_KEY) return null;
  return new GoogleClient(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, fetchImpl);
}

export const redirectUri = () =>
  `${getPublicEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/calendar/google/callback`;

export const STATE_COOKIE = "restart_gc_state";
const STATE_TTL_S = 10 * 60;

/** From the Supabase secret key, which only the app holds (not CRON_SECRET, also in Vault). */
function stateKey(): Buffer {
  const env = getServerEnv();
  return createHash("sha256")
    .update(`restart:calendar-state:${env.ACTION_TOKEN_SECRET ?? env.SUPABASE_SECRET_KEY}`)
    .digest();
}

/**
 * OAuth `state` tied to the session (Integrations §3.4): signed {user, nonce, expiry}; the nonce
 * is also in an httpOnly cookie, so a state from another browser is refused.
 */
export function createState(userId: string): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({ u: userId, n: nonce, exp: Math.floor(Date.now() / 1000) + STATE_TTL_S }),
  ).toString("base64url");
  const mac = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return { state: `${body}.${mac}`, nonce };
}

export function verifyState(state: string, userId: string, nonce: string | undefined): boolean {
  const [body, mac] = state.split(".");
  if (!body || !mac || !nonce) return false;
  const expected = createHmac("sha256", stateKey()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      u: string;
      n: string;
      exp: number;
    };
    return claims.u === userId && claims.n === nonce && claims.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
