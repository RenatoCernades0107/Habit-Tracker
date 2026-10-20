import "server-only";

import type { AdminClient } from "@/server/push/subscriptions";

/**
 * Fixed-window limit (srv_rate_limit). True while `key` is under `max` calls in the window.
 * Fails open on a database error: a limit must never block the app.
 */
export async function underLimit(
  admin: AdminClient,
  key: string,
  max: number,
  window: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("srv_rate_limit", {
    p_key: key,
    p_max: max,
    p_window: window,
  });
  return error ? true : data !== false;
}
