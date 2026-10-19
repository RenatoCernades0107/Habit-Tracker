import { detectPlatform } from "@/lib/pwa/platform";

import {
  currentSubscription,
  deleteSubscription,
  saveSubscription,
  supportsPush,
  usesApplicationServerKey,
  type SubscriptionMeta,
} from "./client";
import { deviceLabel } from "./device-label";

/** Platform and a readable name for this device, sent with its subscription. */
export function thisDevice(): SubscriptionMeta {
  return {
    platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
    deviceLabel: deviceLabel(navigator.userAgent, navigator.maxTouchPoints),
  };
}

export type SyncResult = "synced" | "none" | "replaced";

/**
 * Keeps the server's copy of this device's subscription current (docs/spec/06-integrations.md
 * §4.2 step 3): browsers may renew a subscription at any time, and the upsert is idempotent.
 * A subscription made with an old VAPID key can't receive pushes: it is removed, and the
 * user enables notifications again. Throws only if the server can't be reached.
 */
export async function syncPushSubscription(vapidKey: Uint8Array): Promise<SyncResult> {
  if (!supportsPush() || Notification.permission !== "granted") return "none";
  const subscription = await currentSubscription();
  if (!subscription) return "none";

  if (!usesApplicationServerKey(subscription, vapidKey)) {
    await deleteSubscription(subscription.endpoint).catch(() => {});
    await subscription.unsubscribe().catch(() => false);
    return "replaced";
  }

  await saveSubscription(subscription, thisDevice());
  return "synced";
}
