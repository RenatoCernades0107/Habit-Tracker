import "server-only";

import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import { parseVapidPublicKey } from "@/lib/push/client";

export type VapidDetails = { subject: string; publicKey: string; privateKey: string };

/** Thrown when the VAPID keys aren't configured; the message names variables, never values. */
export class PushConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PushConfigError";
  }
}

/**
 * VAPID details for web-push (docs/spec/06-integrations.md §4.1), passed per call instead of
 * web-push's global setVapidDetails so nothing depends on module state.
 */
export function getVapidDetails(): VapidDetails {
  const publicKey = getPublicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey || !parseVapidPublicKey(publicKey)) {
    throw new PushConfigError("NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing or not a P-256 public key");
  }
  const { VAPID_PRIVATE_KEY, VAPID_SUBJECT } = getServerEnv();
  return { subject: VAPID_SUBJECT, publicKey, privateKey: VAPID_PRIVATE_KEY };
}
