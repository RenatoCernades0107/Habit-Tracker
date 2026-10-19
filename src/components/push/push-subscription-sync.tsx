"use client";

import { useEffect } from "react";

import { getPublicEnv } from "@/lib/env";
import { parseVapidPublicKey } from "@/lib/push/client";
import { syncPushSubscription } from "@/lib/push/sync";

/** Once per page load is enough: the upsert is idempotent and subscriptions change rarely. */
let synced = false;

/**
 * Re-sends this device's push subscription when the app opens, so the server always has the
 * current endpoint and keys (docs/spec/06-integrations.md §4.2 step 3). Renders nothing.
 * Meant for the signed-in app layout; Settings does the same on its own.
 */
export function PushSubscriptionSync() {
  useEffect(() => {
    if (synced) return;
    synced = true;

    let key: Uint8Array | null = null;
    try {
      key = parseVapidPublicKey(getPublicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    } catch {
      return;
    }
    if (!key) return;

    syncPushSubscription(key).catch(() => {
      // Offline or signed out: the next app start tries again.
      synced = false;
    });
  }, []);

  return null;
}
